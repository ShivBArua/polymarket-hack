/**
 * src/lib/newsTrader.ts
 *
 * Core news-trader engine running server-side.
 * Module-level singleton — state persists across SSE connections within one
 * Next.js process. Hot-reloads in dev will reset state.
 */

import { EventEmitter } from "events";
import crypto from "crypto";
import fs from "fs";
import path from "path";

// Bypass macOS Homebrew Python SSL cert issues for external RSS/API fetches.
// This is a dev-only workaround for Homebrew Python's missing system certs.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NTArticle {
  uid: string;
  feed: string;
  title: string;
  url: string;
  snippet: string;
  publishedTs: number;
  fetchedTs: number;
  relevant: boolean;
}

export interface NTMatch {
  uid: string;
  articleUid: string;
  headline: string;
  feed: string;
  marketId: string;
  marketQuestion: string;
  direction: "YES" | "NO";
  confidence: number;
  fairValue: number;
  mid: number;
  edge: number;
  reasoning: string;
  ts: number;
}

export interface NTTrade {
  uid: string;
  matchUid: string;
  marketId: string;
  marketQuestion: string;
  direction: "YES" | "NO";
  size: number;
  price: number;
  edge: number;
  confidence: number;
  headline: string;
  feed: string;
  reasoning: string;
  ts: number;
}

export interface NTPosition {
  marketId: string;
  marketQuestion: string;
  direction: "YES" | "NO";
  size: number;
  entryPrice: number;
  currentPrice: number;
  unrealisedPnl: number;
  ts: number;
}

export type NTEvent =
  | { type: "article";   data: NTArticle }
  | { type: "match";     data: NTMatch }
  | { type: "trade";     data: NTTrade }
  | { type: "poll";      data: { articles: number; relevant: number; feedsHit: number } }
  | { type: "status";    data: TraderStatus }
  | { type: "heartbeat"; data: { ts: number } };

export interface TraderStatus {
  running: boolean;
  positions: number;
  grossExposure: number;
  totalPnl: number;
  tradesPlaced: number;
  articlesProcessed: number;
  pollCount: number;
  lastPollTs: number;
  mode: "paper";
}

// ─── Config ───────────────────────────────────────────────────────────────────

const LAVA_URL   = "https://api.lava.so/v1/messages";
const MODEL      = "claude-sonnet-4-6";
const MAX_TOKENS = 400;
const POLL_MS    = 15_000;
const MIN_CONFIDENCE  = 0.65;
const MIN_EDGE        = 0.03;
const MAX_TRADE_USDC  = 25;
const MAX_EXPOSURE    = 500;
const COOLDOWN_MS     = 90_000;  // per market
const CLAUDE_RPM      = 20;      // max calls per minute

const NEWS_FEEDS: Record<string, string> = {
  ap_top:           "https://feeds.apnews.com/rss/apf-topnews",
  ap_politics:      "https://feeds.apnews.com/rss/apf-politics",
  reuters_top:      "https://feeds.reuters.com/reuters/topNews",
  reuters_politics: "https://feeds.reuters.com/Reuters/PoliticsNews",
  nyt_home:         "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml",
  nyt_politics:     "https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml",
  nyt_world:        "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",
  bbc_world:        "http://feeds.bbci.co.uk/news/world/rss.xml",
  bbc_top:          "http://feeds.bbci.co.uk/news/rss.xml",
  bbc_sport:        "http://feeds.bbci.co.uk/sport/rss.xml",
  guardian_world:   "https://www.theguardian.com/world/rss",
  guardian_us:      "https://www.theguardian.com/us-news/rss",
  politico:         "https://rss.politico.com/politics-news.xml",
  the_hill:         "https://thehill.com/news/feed/",
  axios:            "https://api.axios.com/feed/",
  cnbc_top:         "https://www.cnbc.com/id/100003114/device/rss/rss.html",
  espn:             "https://www.espn.com/espn/rss/news",
  marketwatch:      "https://feeds.content.dowjones.io/public/rss/mw_bulletins",
};

const STOP_WORDS = new Set(`a about above after again against all also am an and any are as at
be because been before being below between both but by can cannot could
did do does doing down during each few for from further get got had has
have having he her here him himself his how i if in into is it its itself
let me more most my no nor not of off on once only or other our out over
own same she should so some such than that the their them then there these
they this those through to too under until up very was we were what when
where which while who whom why will with would you your`.split(/\s+/));

const SIGNAL_RE = new RegExp(
  [
    "president","congress","senate","house vote","signed","vetoed",
    "indicted","arrested","convicted","acquitted","guilty","not guilty",
    "elected","wins","victory","concedes","resigned","fired","appointed",
    "impeach","supreme court","ruling","decision","upheld","struck down",
    "executive order","passed","failed vote","ceasefire","invasion",
    "attack","war","peace deal","summit","sanctions","nuclear","missile",
    "treaty","agreement","fed rate","interest rate","inflation","gdp",
    "jobs report","recession","bankruptcy","merger","acquisition",
    "championship","defeated","scored","final","playoffs","super bowl",
    "world series","nba finals","world cup","ceo","launch","released",
    "banned","fined","approved","rejected","bitcoin","crypto","etf",
    "election","vote","poll","tariff","trade war","default","debt",
  ].map(k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
  "i"
);
const NOISE_RE = /obituary|crossword|recipe|horoscope|puzzle|lifestyle|travel|fashion|food tip/i;

// ─── RSS parser ───────────────────────────────────────────────────────────────

function extractTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  if (!m) return "";
  return m[1].replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&nbsp;/g," ").replace(/\s+/g," ").trim();
}

function parseRssItems(xml: string, feedName: string, now: number): NTArticle[] {
  const items: NTArticle[] = [];
  const blockRe = /<item>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(xml)) !== null) {
    const block = m[1];
    const title   = extractTag(block, "title");
    const url     = extractTag(block, "link") || extractTag(block, "guid");
    const snippet = extractTag(block, "description").slice(0, 300);
    const pubStr  = extractTag(block, "pubDate");
    const pubTs   = pubStr ? (new Date(pubStr).getTime() / 1000 || now) : now;
    if (!title || !url) continue;
    const uid = crypto.createHash("sha256").update(`${url}|${title}`).digest("hex").slice(0, 24);
    const text = `${title} ${snippet}`;
    const relevant = !NOISE_RE.test(text) && SIGNAL_RE.test(text);
    items.push({ uid, feed: feedName, title, url, snippet, publishedTs: pubTs, fetchedTs: now, relevant });
  }
  return items;
}

// ─── TF-IDF market index ──────────────────────────────────────────────────────

interface IndexedMarket {
  id: string;
  question: string;
  tokenIdYes: string;
  tokenIdNo: string;
  bid: number;
  ask: number;
  mid: number;
  spread: number;
  keywords: Set<string>;
}

function extractKeywords(text: string): Set<string> {
  const words = text.toLowerCase().match(/[a-z']+/g) ?? [];
  return new Set(words.filter(w => w.length > 3 && !STOP_WORDS.has(w)));
}

class MarketIndex {
  private markets: Map<string, IndexedMarket> = new Map();
  private postings: Map<string, Set<string>> = new Map();
  private df: Map<string, number> = new Map();

  load(csvPath: string) {
    if (!fs.existsSync(csvPath)) return;
    const lines = fs.readFileSync(csvPath, "utf-8").split("\n").filter(Boolean);
    const h = lines[0].split(",");
    const iQ  = h.indexOf("question");
    const iY  = h.indexOf("token_id_yes");
    const iN  = h.indexOf("token_id_no");
    const iB  = h.indexOf("best_bid");
    const iA  = h.indexOf("best_ask");

    for (let i = 1; i < lines.length; i++) {
      const c = parseCsvLine(lines[i]);
      const bid = parseFloat(c[iB]), ask = parseFloat(c[iA]);
      if (!isFinite(bid) || !isFinite(ask) || bid <= 0 || ask <= bid) continue;
      const mid = (bid + ask) / 2;
      if (mid < 0.04 || mid > 0.96 || (ask - bid) > 0.40) continue;
      const id = `csv_${i}`;
      const question = c[iQ] ?? "";
      const kw = extractKeywords(question);
      const m: IndexedMarket = {
        id, question,
        tokenIdYes: c[iY]?.trim() ?? "",
        tokenIdNo:  c[iN]?.trim() ?? "",
        bid, ask, mid, spread: ask - bid, keywords: kw,
      };
      this.markets.set(id, m);
      for (const k of kw) {
        if (!this.postings.has(k)) this.postings.set(k, new Set());
        this.postings.get(k)!.add(id);
      }
    }
    for (const [k, ids] of this.postings) this.df.set(k, ids.size);
  }

  query(text: string, topK = 10): IndexedMarket[] {
    const qKw = extractKeywords(text);
    const scores = new Map<string, number>();
    const n = Math.max(this.markets.size, 1);
    for (const kw of qKw) {
      const df = this.df.get(kw) ?? 0;
      if (!df) continue;
      const idf = Math.log(n / (1 + df)) + 1;
      for (const id of this.postings.get(kw) ?? []) {
        scores.set(id, (scores.get(id) ?? 0) + idf);
      }
    }
    const norm = Math.sqrt(qKw.size);
    return [...scores.entries()]
      .map(([id, score]) => {
        const m = this.markets.get(id)!;
        return { score: score / (norm * Math.sqrt(m.keywords.size || 1)), m };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(x => x.m);
  }

  size() { return this.markets.size; }
}

function parseCsvLine(line: string): string[] {
  const f: string[] = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (q && line[i+1]==='"') { cur+='"'; i++; } else q=!q; }
    else if (ch===',' && !q) { f.push(cur); cur=''; }
    else cur += ch;
  }
  f.push(cur); return f;
}

// ─── Claude API ───────────────────────────────────────────────────────────────

async function callClaude(prompt: string): Promise<string | null> {
  const key = process.env.LAVA_API_KEY ?? "";
  if (!key) return null;
  try {
    const res = await fetch(LAVA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) return null;
    const d = await res.json();
    return d?.content?.[0]?.text ?? null;
  } catch { return null; }
}

function buildPrompt(article: NTArticle, candidates: IndexedMarket[]): string {
  const list = candidates.map((m, i) =>
    `  [${i+1}] ID=${m.id} | mid=${m.mid.toFixed(3)} | Q: ${m.question}`
  ).join("\n");
  return `You are matching breaking news to active Polymarket prediction markets.

HEADLINE: ${article.title}
SOURCE: ${article.feed}
SNIPPET: ${article.snippet}

CANDIDATE MARKETS:
${list}

Which market (if any) does this headline directly affect? Does it make YES or NO more likely?

Respond with ONLY valid JSON:
{"market_number":null|1-${candidates.length},"market_id":null|"<id>","direction":null|"YES"|"NO","fair_value":null|0.0-1.0,"confidence":0.0-1.0,"reasoning":"<one sentence>"}

Rules: confidence<0.5 if unsure. fair_value = post-news probability for YES. null market_number if no genuine match.`;
}

// ─── Rate limiter ─────────────────────────────────────────────────────────────

class TokenBucket {
  private tokens: number;
  private last: number;
  private rate: number;
  constructor(rpm: number) {
    this.tokens = rpm;
    this.rate   = rpm / 60;
    this.last   = Date.now();
  }
  async acquire() {
    while (true) {
      const now  = Date.now();
      const dt   = (now - this.last) / 1000;
      this.tokens = Math.min(CLAUDE_RPM, this.tokens + dt * this.rate);
      this.last   = now;
      if (this.tokens >= 1) { this.tokens--; return; }
      await sleep(500);
    }
  }
}

// ─── Singleton state ──────────────────────────────────────────────────────────

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

class NewsTrader {
  emitter = new EventEmitter();
  articles:  NTArticle[] = [];   // last 100
  matches:   NTMatch[]   = [];   // last 30
  trades:    NTTrade[]   = [];   // last 50
  positions: Map<string, NTPosition> = new Map();

  running      = false;
  pollCount    = 0;
  lastPollTs   = 0;
  articlesProcessed = 0;

  private seenUids = new Map<string, number>();
  private cooldowns = new Map<string, number>();
  private bucket = new TokenBucket(CLAUDE_RPM);
  private index  = new MarketIndex();
  private indexLoaded = false;

  private csvPath = path.join(process.cwd(), "data", "markets.csv");

  emit(event: NTEvent) {
    this.emitter.emit("event", event);
  }

  push<T>(arr: T[], item: T, max: number) {
    arr.unshift(item);
    if (arr.length > max) arr.pop();
  }

  ensureIndex() {
    if (!this.indexLoaded) {
      this.index.load(this.csvPath);
      this.indexLoaded = true;
      console.log(`[news-trader] Market index: ${this.index.size()} markets`);
    }
  }

  get status(): TraderStatus {
    const positions = [...this.positions.values()];
    return {
      running: this.running,
      positions: positions.length,
      grossExposure: positions.reduce((s, p) => s + p.size, 0),
      totalPnl: positions.reduce((s, p) => s + p.unrealisedPnl, 0),
      tradesPlaced: this.trades.length,
      articlesProcessed: this.articlesProcessed,
      pollCount: this.pollCount,
      lastPollTs: this.lastPollTs,
      mode: "paper",
    };
  }

  // ── Scraper ────────────────────────────────────────────────────────────────

  async pollFeeds(): Promise<NTArticle[]> {
    const now = Math.floor(Date.now() / 1000);
    // Expire cache >2h
    for (const [uid, ts] of this.seenUids) {
      if (now - ts > 7200) this.seenUids.delete(uid);
    }

    console.log(`[news-trader] Polling ${Object.keys(NEWS_FEEDS).length} feeds (seenUids=${this.seenUids.size})...`);

    const fetches = Object.entries(NEWS_FEEDS).map(async ([name, url]) => {
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(7000),
          headers: { "User-Agent": "Mozilla/5.0 (compatible; PolymarketResearch/1.0)" },
        });
        if (!res.ok) { console.log(`[news-trader] ${name}: HTTP ${res.status}`); return []; }
        const xml = await res.text();
        const items = parseRssItems(xml, name, now);
        if (items.length) console.log(`[news-trader] ${name}: ${items.length} items`);
        return items;
      } catch(e: any) {
        console.log(`[news-trader] ${name}: ${e?.message?.slice(0,60)}`);
        return [];
      }
    });

    const results = await Promise.allSettled(fetches);
    const newArticles: NTArticle[] = [];

    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      for (const a of r.value) {
        if (!this.seenUids.has(a.uid)) {
          this.seenUids.set(a.uid, now);
          newArticles.push(a);
        }
      }
    }
    console.log(`[news-trader] Poll complete: ${newArticles.length} new articles (seen=${this.seenUids.size})`);
    return newArticles.sort((a, b) => a.publishedTs - b.publishedTs);
  }

  // ── Matching ───────────────────────────────────────────────────────────────

  async processArticle(article: NTArticle): Promise<void> {
    this.articlesProcessed++;
    this.push(this.articles, article, 100);
    this.emit({ type: "article", data: article });

    if (!article.relevant) return;

    const candidates = this.index.query(`${article.title} ${article.snippet}`, 10)
      .filter(m => m.spread < 0.35 && m.mid > 0.04 && m.mid < 0.96);
    if (!candidates.length) return;

    await this.bucket.acquire();
    const raw = await callClaude(buildPrompt(article, candidates));
    if (!raw) return;

    let parsed: any;
    try {
      const clean = raw.replace(/```(?:json)?/g, "").trim();
      parsed = JSON.parse(clean);
    } catch { return; }

    const { market_id, market_number, direction, fair_value, confidence, reasoning } = parsed;
    if (!direction || (direction !== "YES" && direction !== "NO")) return;
    if (!confidence || confidence < MIN_CONFIDENCE) return;

    let market = candidates.find(m => m.id === market_id);
    if (!market && typeof market_number === "number" && market_number >= 1 && market_number <= candidates.length) {
      market = candidates[market_number - 1];
    }
    if (!market) return;

    const fv   = typeof fair_value === "number" ? fair_value : (direction === "YES" ? market.mid + 0.05 : market.mid - 0.05);
    const edge = direction === "YES" ? fv - market.mid : (1 - fv) - (1 - market.mid);
    if (edge < MIN_EDGE) return;

    const match: NTMatch = {
      uid: crypto.randomUUID(),
      articleUid: article.uid,
      headline: article.title,
      feed: article.feed,
      marketId: market.id,
      marketQuestion: market.question,
      direction,
      confidence,
      fairValue: fv,
      mid: market.mid,
      edge,
      reasoning: reasoning ?? "",
      ts: Date.now(),
    };
    this.push(this.matches, match, 30);
    this.emit({ type: "match", data: match });

    this.maybeExecute(match, market);
  }

  // ── Paper execution ────────────────────────────────────────────────────────

  maybeExecute(match: NTMatch, market: IndexedMarket) {
    const now = Date.now();

    // Cooldown
    const lastOrder = this.cooldowns.get(match.marketId) ?? 0;
    if (now - lastOrder < COOLDOWN_MS) return;

    // Exposure
    const gross = [...this.positions.values()].reduce((s, p) => s + p.size, 0);
    if (gross >= MAX_EXPOSURE) return;

    // Kelly size
    const kelly = match.confidence * Math.abs(match.edge) * 100;
    const size  = Math.max(2, Math.min(MAX_TRADE_USDC, kelly));

    const price = match.direction === "YES"
      ? Math.min(0.97, market.ask + 0.01)
      : Math.min(0.97, (1 - market.bid) + 0.01);

    const trade: NTTrade = {
      uid: crypto.randomUUID(),
      matchUid: match.uid,
      marketId: match.marketId,
      marketQuestion: match.marketQuestion,
      direction: match.direction,
      size: parseFloat(size.toFixed(2)),
      price,
      edge: match.edge,
      confidence: match.confidence,
      headline: match.headline,
      feed: match.feed,
      reasoning: match.reasoning,
      ts: now,
    };

    this.push(this.trades, trade, 50);
    this.cooldowns.set(match.marketId, now);
    this.emit({ type: "trade", data: trade });

    // Update / create position
    const existing = this.positions.get(match.marketId);
    if (existing) {
      existing.size += trade.size;
      // Weighted avg entry price
      existing.entryPrice = (existing.entryPrice * (existing.size - trade.size) + price * trade.size) / existing.size;
    } else {
      this.positions.set(match.marketId, {
        marketId: match.marketId,
        marketQuestion: match.marketQuestion,
        direction: match.direction,
        size: trade.size,
        entryPrice: price,
        currentPrice: market.mid,
        unrealisedPnl: 0,
        ts: now,
      });
    }

    this.emit({ type: "status", data: this.status });
  }

  // ── Main loop ──────────────────────────────────────────────────────────────

  async start() {
    if (this.running) return;
    this.running = true;
    this.ensureIndex();
    console.log("[news-trader] Loop started");

    while (this.running) {
      try {
        const articles = await this.pollFeeds();
        this.pollCount++;
        this.lastPollTs = Date.now();

        const relevant = articles.filter(a => a.relevant);
        this.emit({ type: "poll", data: { articles: articles.length, relevant: relevant.length, feedsHit: Object.keys(NEWS_FEEDS).length } });

        // Process articles sequentially (Claude rate-limited internally)
        for (const a of articles) {
          if (!this.running) break;
          await this.processArticle(a);
        }
      } catch (e) {
        console.error("[news-trader] Loop error:", e);
      }

      this.emit({ type: "heartbeat", data: { ts: Date.now() } });
      await sleep(POLL_MS);
    }
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

declare global { var __newsTrader: NewsTrader | undefined; var __newsTraderVersion: number | undefined; }

const VERSION = 5; // bump to force singleton reset on hot reload

export function getTrader(): NewsTrader {
  if (!global.__newsTrader || global.__newsTraderVersion !== VERSION) {
    if (global.__newsTrader) global.__newsTrader.running = false;
    global.__newsTrader = new NewsTrader();
    global.__newsTraderVersion = VERSION;
  }
  return global.__newsTrader;
}

export function startTrader() {
  const t = getTrader();
  if (!t.running) t.start().catch(console.error);
  return t;
}
