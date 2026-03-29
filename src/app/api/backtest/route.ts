/**
 * GET /api/backtest
 *
 * Simulates strategy on active Polymarket markets using real CLOB price history.
 *
 * With useAI=true (default):
 *   After the statistical filter (edge + trend), Claude Sonnet is asked to
 *   estimate the true YES probability from Google News RSS. A trade is only
 *   entered if Claude's estimate agrees with the statistical direction.
 *   This filters out statistically-attractive trades that the AI thinks are wrong.
 *
 * P&L is paper/unrealised — the "current price" is the exit, not resolution.
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { BacktestResult, BacktestTrade } from "@/types";

const CLOB_BASE = "https://clob.polymarket.com";
const CSV_PATH  = path.join(process.cwd(), "data", "markets.csv");
const LAVA_URL  = "https://api.lava.so/v1/messages";

// ── CSV helpers ───────────────────────────────────────────────────────────────

function parseLine(line: string): string[] {
  const f: string[] = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (q && line[i+1]==='"') { cur+='"'; i++; } else q=!q; }
    else if (ch===',' && !q) { f.push(cur); cur=''; }
    else cur+=ch;
  }
  f.push(cur); return f;
}

function loadCSVMarkets(max: number) {
  const raw   = fs.readFileSync(CSV_PATH, "utf-8");
  const lines = raw.split("\n").filter(Boolean);
  const h     = parseLine(lines[0]);
  const idx   = (k: string) => h.indexOf(k);
  const iQ = idx("question"), iY = idx("token_id_yes"),
        iB = idx("best_bid"),  iA = idx("best_ask"),
        iL = idx("last_trade_price"), iE = idx("end_date"),
        iV = idx("volume");

  const out: { question:string; tokenId:string; bid:number; ask:number;
               ltp:number|null; endDate:string; volume:number }[] = [];

  for (let i = 1; i < lines.length && out.length < max * 5; i++) {
    const c  = parseLine(lines[i]);
    const b  = parseFloat(c[iB]), a = parseFloat(c[iA]);
    if (!isFinite(b)||!isFinite(a)||b<=0||a<=0||a<=b) continue;
    const mid = (b+a)/2;
    if (mid < 0.05 || mid > 0.95) continue;
    if ((a-b) > 0.40) continue;
    const v   = parseFloat(c[iV]) || 0;
    if (v < 5_000) continue;
    const tok = c[iY]?.trim();
    if (!tok) continue;
    const ltp = parseFloat(c[iL]);
    out.push({
      question: c[iQ] ?? "",
      tokenId:  tok,
      bid: b, ask: a,
      ltp: isFinite(ltp) && ltp > 0 && ltp < 1 ? ltp : null,
      endDate: c[iE]?.trim() ?? "",
      volume: v,
    });
  }
  const step = Math.max(1, Math.floor(out.length / max));
  return out.filter((_, i) => i % step === 0).slice(0, max);
}

// ── CLOB price history ────────────────────────────────────────────────────────

type Pt = { timestamp: number; price: number };

async function fetchHistory(tokenId: string): Promise<Pt[]> {
  const url = `${CLOB_BASE}/prices-history?market=${encodeURIComponent(tokenId)}&interval=1m&fidelity=1440`;
  const res = await fetch(url, { next: { revalidate: 600 } });
  if (!res.ok) return [];
  const data = await res.json();
  return ((data?.history ?? []) as { t:number; p:string }[])
    .filter(r => r.t && r.p)
    .map(r => ({ timestamp: Number(r.t)*1000, price: parseFloat(r.p) }))
    .sort((a,b) => a.timestamp - b.timestamp);
}

// ── Signal helpers ────────────────────────────────────────────────────────────

function priceAt(history: Pt[], targetMs: number): number | null {
  let best: Pt | null = null;
  for (const pt of history) {
    if (pt.timestamp <= targetMs + 86_400_000) best = pt;
    else break;
  }
  return best ? best.price : null;
}

function slope(pts: Pt[]): number {
  if (pts.length < 3) return 0;
  const n = pts.length;
  const mt = pts.reduce((s,p)=>s+p.timestamp,0)/n;
  const mp = pts.reduce((s,p)=>s+p.price,0)/n;
  let num=0,den=0;
  for (const p of pts) { num+=(p.timestamp-mt)*(p.price-mp); den+=(p.timestamp-mt)**2; }
  return den===0 ? 0 : (num/den)*86_400_000;
}

function sharpe(returns: number[]): number {
  if (returns.length < 2) return 0;
  const m = returns.reduce((s,r)=>s+r,0)/returns.length;
  const v = returns.reduce((s,r)=>s+(r-m)**2,0)/returns.length;
  const sd = Math.sqrt(v);
  return sd===0 ? 0 : (m/sd)*Math.sqrt(252);
}

function maxDD(cumPnl: number[]): number {
  let peak=-Infinity, dd=0;
  for (const v of cumPnl) {
    if (v>peak) peak=v;
    if (peak>0) dd=Math.max(dd,(peak-v)/peak);
  }
  return dd;
}

// ── Google News RSS (inline, no import needed) ────────────────────────────────

function extractTag(xml: string, tag: string): string {
  const start = xml.indexOf(`<${tag}`);
  if (start === -1) return "";
  const close = xml.indexOf(">", start);
  if (close === -1) return "";
  const end = xml.indexOf(`</${tag}>`, close);
  if (end === -1) return "";
  return xml.slice(close + 1, end).trim();
}

function cleanXml(s: string) {
  return s.replace(/<!\[CDATA\[/g,"").replace(/\]\]>/g,"")
          .replace(/<[^>]+>/g," ").replace(/&amp;/g,"&")
          .replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/\s+/g," ").trim();
}

async function fetchNewsSnippets(question: string): Promise<string> {
  try {
    const keywords = question
      .replace(/\?|will |before |after |by |in |the /gi, " ")
      .split(/\s+/).filter(w => w.length > 3).slice(0, 5).join(" ");
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(keywords)}&hl=en-US&gl=US&ceid=US:en`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; polymarket-bot/1.0)" },
    });
    if (!res.ok) return "(no news)";
    const xml = await res.text();
    const items = xml.split("<item>").slice(1, 5);
    return items.map((item, i) => {
      const title = cleanXml(extractTag(item, "title"));
      const desc  = cleanXml(extractTag(item, "description")).slice(0, 200);
      const src   = cleanXml(extractTag(item, "source"));
      return `[${i+1}] ${title} — ${src}\n    ${desc}`;
    }).join("\n\n") || "(no news)";
  } catch {
    return "(news fetch failed)";
  }
}

// ── Claude AI probability estimate ───────────────────────────────────────────

async function askClaude(question: string, newsSnippets: string): Promise<{
  probability: number | null;
  confidence: string;
}> {
  try {
    const prompt = `You are a prediction market analyst. Estimate the probability this market resolves YES.

Market question: "${question}"

Recent news:
${newsSnippets}

Reply ONLY with valid JSON (no markdown):
{"probability": <0-1>, "confidence": "low"|"medium"|"high"}`;

    const res = await fetch(LAVA_URL, {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         process.env.LAVA_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      "claude-sonnet-4-6",
        max_tokens: 100,
        messages:   [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`Lava error ${res.status}`);
    const data = await res.json();
    const raw  = data.content?.[0]?.text ?? "";
    const jsonStr = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    const parsed  = JSON.parse(jsonStr);
    return {
      probability: typeof parsed.probability === "number" ? parsed.probability : null,
      confidence:  parsed.confidence ?? "low",
    };
  } catch {
    return { probability: null, confidence: "low" };
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const p   = req.nextUrl.searchParams;
  const entryDays      = Math.max(2, parseInt(p.get("entryDays")    ?? "14", 10));
  const sizeUsdc       = Math.max(1, parseFloat(p.get("sizeUsdc")   ?? "10"));
  const minEdge        = parseFloat(p.get("minEdge")                ?? "0.02");
  const minTrendSignal = parseFloat(p.get("minTrendSignal")         ?? "0.003");
  const maxMarkets     = Math.min(40, parseInt(p.get("maxMarkets")  ?? "20", 10));
  const useAI          = p.get("useAI") !== "false"; // default on

  const DAY    = 86_400_000;
  const now    = Date.now();
  const entryMs  = now - entryDays * DAY;
  const trendWin = 7 * DAY;

  const skipped = { noHistory: 0, noEntry: 0, weakSignal: 0, aiRejected: 0, total: 0 };

  try {
    const markets = loadCSVMarkets(maxMarkets);

    // Step 1: statistical filter (parallelised, no AI cost yet)
    const statFiltered: {
      m: typeof markets[0];
      entryPrice: number;
      currentPrice: number;
      fairP: number;
      edge: number;
      trendPerDay: number;
      direction: "YES" | "NO";
    }[] = [];

    const histories = await Promise.allSettled(markets.map(m => fetchHistory(m.tokenId)));

    for (let i = 0; i < markets.length; i++) {
      skipped.total++;
      const hr = histories[i];
      if (hr.status !== "fulfilled" || hr.value.length < 5) { skipped.noHistory++; continue; }
      const history = hr.value;

      const entryPrice = priceAt(history, entryMs);
      if (!entryPrice || entryPrice < 0.04 || entryPrice > 0.96) { skipped.noEntry++; continue; }

      const currentPrice = history[history.length - 1].price;
      const trendPts     = history.filter(pt => pt.timestamp >= entryMs - trendWin && pt.timestamp <= entryMs);
      const trendPerDay  = slope(trendPts);

      const m = markets[i];
      const ltpValid = m.ltp !== null && Math.abs(m.ltp - entryPrice) <= 0.20;
      const unc   = Math.min(1, (m.ask - m.bid) / 0.12);
      const fairP = ltpValid ? m.ltp! * (1 - unc) + entryPrice * unc : entryPrice;
      const edge  = Math.min(0.12, Math.abs(fairP - entryPrice));

      if (edge < minEdge) { skipped.weakSignal++; continue; }
      if (Math.abs(trendPerDay) < minTrendSignal) { skipped.weakSignal++; continue; }

      // Both signals must agree on direction — conflicting signals are noise, not edge
      const fairDir  = fairP > entryPrice ? "YES" : "NO";
      const trendDir = trendPerDay > 0    ? "YES" : "NO";
      if (fairDir !== trendDir) { skipped.weakSignal++; continue; }
      const direction: "YES" | "NO" = fairDir;
      statFiltered.push({ m, entryPrice, currentPrice, fairP, edge, trendPerDay, direction });
    }

    // Step 2: for stat-filtered candidates, ask Claude (parallelised)
    const trades: BacktestTrade[] = [];

    await Promise.allSettled(
      statFiltered.map(async ({ m, entryPrice, currentPrice, fairP, edge, trendPerDay, direction }) => {
        let aiProbability: number | null = null;
        let aiConfidence: string | null  = null;
        let aiAgreed = true;

        if (useAI) {
          const news = await fetchNewsSnippets(m.question);
          const ai   = await askClaude(m.question, news);
          aiProbability = ai.probability;
          aiConfidence  = ai.confidence;

          if (aiProbability !== null) {
            // Claude agrees if it points the same direction as our statistical model
            const aiDirection = aiProbability > entryPrice ? "YES" : "NO";
            aiAgreed = aiDirection === direction;
            if (!aiAgreed) { skipped.aiRejected++; return; }
          }
        }

        const priceMove = direction === "YES"
          ? currentPrice - entryPrice
          : entryPrice - currentPrice;
        const shares = sizeUsdc / entryPrice;
        const pnl    = shares * priceMove;

        trades.push({
          question:        m.question,
          direction,
          entryPrice,
          resolutionPrice: currentPrice,
          entryDate:       new Date(entryMs).toISOString(),
          resolutionDate:  new Date(now).toISOString(),
          sizeUsdc,
          pnl,
          returnPct:       pnl / sizeUsdc,
          won:             pnl > 0,
          fairP,
          edgeAtEntry:     edge,
          trendSignal:     parseFloat(trendPerDay.toFixed(5)),
          aiProbability,
          aiConfidence,
          aiAgreed,
        } satisfies BacktestTrade);
      })
    );

    trades.sort((a,b) => Date.parse(a.entryDate) - Date.parse(b.entryDate));

    if (!trades.length) {
      return NextResponse.json({
        trades: [], totalPnl: 0, totalReturn: 0,
        winRate: 0, sharpe: 0, maxDrawdown: 0, avgTrade: 0,
        equityCurve: [], skipped,
        config: { entryDays, sizeUsdc, minEdge, minTrendSignal, useAI },
      });
    }

    let cum = 0;
    const equityCurve = trades.map(t => {
      cum += t.pnl;
      return { date: t.entryDate.slice(0,10), cumPnl: parseFloat(cum.toFixed(2)) };
    });

    const totalPnl  = trades.reduce((s,t)=>s+t.pnl, 0);
    const totalCap  = trades.length * sizeUsdc;
    const returns   = trades.map(t => t.returnPct);

    return NextResponse.json({
      trades,
      totalPnl,
      totalReturn:  totalPnl / totalCap,
      winRate:      trades.filter(t=>t.won).length / trades.length,
      sharpe:       sharpe(returns),
      maxDrawdown:  maxDD(equityCurve.map(p=>p.cumPnl)),
      avgTrade:     totalPnl / trades.length,
      equityCurve,
      skipped,
      config: { entryDays, sizeUsdc, minEdge, minTrendSignal, useAI },
    } satisfies BacktestResult & { skipped: typeof skipped; config: any });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
