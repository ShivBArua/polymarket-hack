/**
 * GET /api/related?q=<market question>&tokenId=<yes token id>
 *
 * Returns markets related to a given question from two sources:
 *   1. Polymarket — keyword search across the local CSV
 *   2. Kalshi     — keyword search via their public REST API
 *
 * Similarity score: Jaccard similarity on lowercased keywords (length > 3).
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const CSV_PATH   = path.join(process.cwd(), "data", "markets.csv");
const KALSHI_API = "https://trading-api.kalshi.com/trade-api/v2";

// ── Keyword helpers ───────────────────────────────────────────────────────────

const STOP = new Set([
  "will","the","that","this","have","been","from","they","with",
  "what","when","where","which","their","there","about","would",
  "could","should","before","after","market","price","predict",
]);

function kw(s: string): Set<string> {
  return new Set(
    s.toLowerCase().replace(/[^a-z0-9\s]/g," ").split(/\s+/)
     .filter(w => w.length > 3 && !STOP.has(w))
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 0;
  let inter = 0;
  a.forEach(w => { if (b.has(w)) inter++; });
  return inter / (a.size + b.size - inter);
}

// ── CSV line parser ───────────────────────────────────────────────────────────

function parseLine(line: string): string[] {
  const f: string[] = []; let cur="",q=false;
  for (let i=0;i<line.length;i++){
    const ch=line[i];
    if(ch==='"'){if(q&&line[i+1]==='"'){cur+='"';i++;}else q=!q;}
    else if(ch===','&&!q){f.push(cur);cur='';}
    else cur+=ch;
  }
  f.push(cur);return f;
}

// ── Polymarket related (CSV) ──────────────────────────────────────────────────

function findPolymarketRelated(
  question: string,
  excludeId: string,
  limit = 4
) {
  const qKw = kw(question);
  const raw  = fs.readFileSync(CSV_PATH, "utf-8");
  const lines = raw.split("\n").filter(Boolean);
  const h     = parseLine(lines[0]);
  const iId   = h.indexOf("id");
  const iQ    = h.indexOf("question");
  const iBid  = h.indexOf("best_bid");
  const iAsk  = h.indexOf("best_ask");
  const iLtp  = h.indexOf("last_trade_price");

  const scored: { question:string; sim:number; mid:number; ltp:number|null }[] = [];

  for (let i=1; i<lines.length; i++) {
    const c  = parseLine(lines[i]);
    if ((c[iId]??'') === excludeId) continue;
    const sim = jaccard(qKw, kw(c[iQ]??''));
    if (sim < 0.12) continue;
    const bid = parseFloat(c[iBid]), ask = parseFloat(c[iAsk]);
    if (!isFinite(bid)||!isFinite(ask)||ask<=bid) continue;
    const mid = (bid+ask)/2;
    if (mid < 0.03 || mid > 0.97) continue;
    const ltp = parseFloat(c[iLtp]);
    scored.push({ question: c[iQ]??'', sim, mid, ltp: isFinite(ltp)?ltp:null });
  }

  return scored
    .sort((a,b)=>b.sim-a.sim)
    .slice(0,limit)
    .map(r => ({
      source: "Polymarket" as const,
      question: r.question,
      yesPrice: parseFloat((r.mid*100).toFixed(1)),
      similarity: parseFloat(r.sim.toFixed(3)),
      url: `https://polymarket.com`,
    }));
}

// ── Kalshi related ────────────────────────────────────────────────────────────

async function findKalshiRelated(question: string, limit = 3) {
  const qKw = kw(question);
  try {
    // Kalshi public GET — no auth needed for read
    const res = await fetch(
      `${KALSHI_API}/markets?limit=200&status=open`,
      { headers: { Accept: "application/json" }, next: { revalidate: 300 } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const markets: any[] = data?.markets ?? [];

    const scored = markets
      .map(m => ({
        title:     (m.title ?? m.question ?? "") as string,
        yesPrice:  typeof m.yes_ask === "number" ? m.yes_ask : null,
        url:       `https://kalshi.com/markets/${m.ticker ?? ""}`,
        sim:       jaccard(qKw, kw(m.title ?? m.question ?? "")),
      }))
      .filter(m => m.sim >= 0.10 && m.title)
      .sort((a,b)=>b.sim-a.sim)
      .slice(0,limit);

    return scored.map(m => ({
      source: "Kalshi" as const,
      question: m.title,
      yesPrice: m.yesPrice,
      similarity: parseFloat(m.sim.toFixed(3)),
      url: m.url,
    }));
  } catch {
    return [];
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const q          = req.nextUrl.searchParams.get("q") ?? "";
  const excludeId  = req.nextUrl.searchParams.get("id") ?? "";

  if (!q) return NextResponse.json({ polymarket: [], kalshi: [] });

  const [poly, kalshi] = await Promise.allSettled([
    Promise.resolve(findPolymarketRelated(q, excludeId)),
    findKalshiRelated(q),
  ]);

  return NextResponse.json({
    polymarket: poly.status === "fulfilled" ? poly.value : [],
    kalshi:     kalshi.status === "fulfilled" ? kalshi.value : [],
  });
}
