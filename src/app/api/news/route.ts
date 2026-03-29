/**
 * GET /api/news?q=<market question>
 *
 * Fetches top news articles from Google News RSS for a given query.
 * Returns up to 5 articles with title, URL, source, and publish date.
 *
 * No API key required — uses Google News public RSS.
 */

import { NextRequest, NextResponse } from "next/server";

export interface NewsArticle {
  title: string;
  url: string;
  source: string;
  publishedAt: string; // ISO or relative
}

function extractTag(xml: string, tag: string): string {
  const start = xml.indexOf(`<${tag}`);
  if (start === -1) return "";
  const close = xml.indexOf(">", start);
  if (close === -1) return "";
  const end = xml.indexOf(`</${tag}>`, close);
  if (end === -1) return "";
  return xml.slice(close + 1, end).trim();
}

function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "").trim();
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q) return NextResponse.json({ articles: [] });

  // Extract key terms — drop common prediction market boilerplate
  const keywords = q
    .replace(/\?|will |before |after |by |in |the /gi, " ")
    .split(/\s+/)
    .filter(w => w.length > 3)
    .slice(0, 6)
    .join(" ");

  const rssUrl =
    `https://news.google.com/rss/search?q=${encodeURIComponent(keywords)}&hl=en-US&gl=US&ceid=US:en`;

  try {
    const res = await fetch(rssUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; polymarket-bot/1.0)" },
      next: { revalidate: 300 },
    });

    if (!res.ok) return NextResponse.json({ articles: [] });

    const xml   = await res.text();
    const items = xml.split("<item>").slice(1, 6); // top 5

    const articles: NewsArticle[] = items.map(item => {
      const title  = decodeHtmlEntities(stripCdata(extractTag(item, "title")));
      const link   = extractTag(item, "link") || extractTag(item, "url");
      const source = decodeHtmlEntities(stripCdata(extractTag(item, "source")));
      const pubDate = extractTag(item, "pubDate");

      // Try to make publish time relative
      let publishedAt = pubDate;
      try {
        const ms = Date.parse(pubDate);
        if (isFinite(ms)) {
          const diff = Date.now() - ms;
          const h = Math.round(diff / 3_600_000);
          const d = Math.round(diff / 86_400_000);
          publishedAt = h < 1 ? "just now" : h < 24 ? `${h}h ago` : `${d}d ago`;
        }
      } catch {}

      return { title, url: link, source, publishedAt };
    }).filter(a => a.title && a.url);

    return NextResponse.json({ articles, query: keywords });
  } catch (err: any) {
    return NextResponse.json({ articles: [], error: err.message });
  }
}
