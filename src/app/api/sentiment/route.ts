/**
 * GET /api/sentiment?q=<market question>&tokenId=<yes token id>
 *
 * Pipeline:
 *   1. Fetch Polymarket market description from Gamma API (resolution criteria)
 *   2. Fetch top 6 news articles from Google News RSS incl. description snippets
 *   3. Pass everything to Claude Sonnet for probability estimate
 *
 * Requires: LAVA_API_KEY in .env.local
 */

import { NextRequest, NextResponse } from "next/server";

const MODEL    = "claude-sonnet-4-6";
const LAVA_URL = "https://api.lava.so/v1/messages";

async function lavaChat(prompt: string, maxTokens: number): Promise<string> {
  const res = await fetch(LAVA_URL, {
    method: "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         process.env.LAVA_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model:      MODEL,
      max_tokens: maxTokens,
      messages:   [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Lava error ${res.status}: ${errText}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text ?? "";
}

// ── XML helpers ───────────────────────────────────────────────────────────────

function extractTag(xml: string, tag: string): string {
  const start = xml.indexOf(`<${tag}`);
  if (start === -1) return "";
  const close = xml.indexOf(">", start);
  if (close === -1) return "";
  const end = xml.indexOf(`</${tag}>`, close);
  if (end === -1) return "";
  return xml.slice(close + 1, end).trim();
}

function stripCdata(s: string) {
  return s.replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "").trim();
}

function stripHtml(s: string) {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
}

function clean(s: string) {
  return decodeEntities(stripHtml(stripCdata(s)));
}

// ── Google News RSS ───────────────────────────────────────────────────────────

async function fetchArticles(question: string) {
  const keywords = question
    .replace(/\?|will |before |after |by |in |the /gi, " ")
    .split(/\s+/).filter(w => w.length > 3).slice(0, 6).join(" ");

  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(keywords)}&hl=en-US&gl=US&ceid=US:en`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; polymarket-bot/1.0)" },
    next: { revalidate: 300 },
  });
  if (!res.ok) return [];

  const xml = await res.text();
  const items = xml.split("<item>").slice(1, 7);

  return items.map(item => ({
    title:       clean(extractTag(item, "title")),
    source:      clean(extractTag(item, "source")),
    link:        extractTag(item, "link"),
    pubDate:     extractTag(item, "pubDate"),
    description: clean(extractTag(item, "description")).slice(0, 300),
  })).filter(a => a.title);
}

// ── Polymarket market description (Gamma API) ────────────────────────────────

async function fetchMarketDescription(tokenId: string): Promise<string> {
  if (!tokenId) return "";
  try {
    const res = await fetch(
      `https://gamma-api.polymarket.com/markets?clob_token_ids=${tokenId}&limit=1`,
      { next: { revalidate: 600 } }
    );
    if (!res.ok) return "";
    const data = await res.json();
    const market = Array.isArray(data) ? data[0] : data?.markets?.[0];
    return market?.description ?? "";
  } catch {
    return "";
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const q       = req.nextUrl.searchParams.get("q");
  const tokenId = req.nextUrl.searchParams.get("tokenId") ?? "";
  if (!q) return NextResponse.json({ error: "q required" }, { status: 400 });

  try {
    const [articles, marketDesc] = await Promise.all([
      fetchArticles(q),
      fetchMarketDescription(tokenId),
    ]);

    const articleSnippets = articles.length
      ? articles.map((a, i) =>
          `[${i + 1}] "${a.title}" — ${a.source} (${a.pubDate})\n    ${a.description}`
        ).join("\n\n")
      : "(no recent news found)";

    const descSection = marketDesc
      ? `\nPolymarket resolution criteria:\n${marketDesc.slice(0, 500)}\n`
      : "";

    const prompt = `You are an analyst for a prediction market trading bot.

Market question: "${q}"
${descSection}
Recent news articles with snippets (Google News RSS):
${articleSnippets}

Based on the resolution criteria, article content, and your knowledge, estimate the probability this market resolves YES.
Reply in this exact JSON format (no markdown, no explanation outside the JSON):
{
  "probability": <number between 0 and 1, e.g. 0.62>,
  "confidence": "low" | "medium" | "high",
  "reasoning": "<2 sentences explaining your estimate, citing specific articles or criteria if relevant>",
  "keyFactor": "<the single most important piece of evidence>"
}`;

    const raw = await lavaChat(prompt, 300);
    const jsonStr = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    const parsed  = JSON.parse(jsonStr);

    return NextResponse.json({
      probability: parseFloat(parsed.probability) || null,
      confidence:  parsed.confidence ?? "low",
      reasoning:   parsed.reasoning  ?? "",
      keyFactor:   parsed.keyFactor  ?? "",
      articles,
      marketDesc:  marketDesc.slice(0, 300) || null,
      model:       MODEL,
      articleQuery: q,
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
