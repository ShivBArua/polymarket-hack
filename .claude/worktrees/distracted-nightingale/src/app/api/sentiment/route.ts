/**
 * GET /api/sentiment?q=<market question>
 *
 * Pipeline:
 *   1. Fetch top 4 news articles from Google News RSS  (web scraper)
 *   2. Pass articles + question to Gemini Flash         (LLM analysis)
 *   3. Gemini returns: probability estimate + 2-sentence reasoning
 *
 * Returns:
 *   { probability, confidence, reasoning, keyFactor, articles, model }
 *
 * Requires: GOOGLE_API_KEY in .env.local
 */

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const MODEL = "gemini-1.5-flash";

// ── Minimal RSS fetch ─────────────────────────────────────────────────────────

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
  return s.replace(/<!--\[CDATA\[/g, "").replace(/\]\]>/g, "").trim();
}

function decodeEntities(s: string) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

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
  const items = xml.split("<item>").slice(1, 5);

  return items.map(item => ({
    title:   decodeEntities(stripCdata(extractTag(item, "title"))),
    source:  decodeEntities(stripCdata(extractTag(item, "source"))),
    link:    extractTag(item, "link"),
    pubDate: extractTag(item, "pubDate"),
  })).filter(a => a.title);
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q) return NextResponse.json({ error: "q required" }, { status: 400 });

  if (!process.env.GOOGLE_API_KEY) {
    return NextResponse.json({ error: "GOOGLE_API_KEY not set in .env.local" }, { status: 500 });
  }

  try {
    const articles = await fetchArticles(q);

    const articleSnippets = articles.length
      ? articles.map((a, i) => `[${i + 1}] "${a.title}" — ${a.source} (${a.pubDate})`).join("\n")
      : "(no recent news found)";

    const prompt = `You are an analyst for a prediction market trading bot.

Market question: "${q}"

Recent news articles retrieved by web scraper:
${articleSnippets}

Based on these articles and your knowledge, estimate the probability this market resolves YES.
Reply in this exact JSON format (no markdown, no explanation outside the JSON):
{
  "probability": <number between 0 and 1, e.g. 0.62>,
  "confidence": "low" | "medium" | "high",
  "reasoning": "<2 sentences explaining your estimate, citing specific articles if relevant>",
  "keyFactor": "<the single most important piece of evidence>"
}`;

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    const model = genAI.getGenerativeModel({ model: MODEL });
    const result = await model.generateContent(prompt);
    const raw = result.response.text();
    const jsonStr = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    const parsed = JSON.parse(jsonStr);

    return NextResponse.json({
      probability: parseFloat(parsed.probability) || null,
      confidence:  parsed.confidence ?? "low",
      reasoning:   parsed.reasoning  ?? "",
      keyFactor:   parsed.keyFactor  ?? "",
      articles,
      model:       `gemini/${MODEL}`,
      articleQuery: q,
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
