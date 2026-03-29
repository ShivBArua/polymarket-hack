/**
 * GET /api/optimize
 *
 * Grid-searches over parameter combinations using real CLOB price history.
 * Data is fetched ONCE and reused across all combinations — fast in-memory sweep.
 *
 * Parameters swept:
 *   entryDays       [3, 7, 14, 21, 30]       days before current date to enter
 *   minEdge         [0.01, 0.03, 0.05, 0.08]  minimum fair-value edge to trade
 *   minTrendSignal  [0.0005, 0.002, 0.005]    minimum momentum slope per day
 *
 * Fixed:
 *   sizeUsdc = 10   (doesn't affect Sharpe/winRate, only scales absolute P&L)
 *   maxMarkets = 25 (enough for reliable signal, keeps fetch cost low)
 *
 * Returns top 10 combinations ranked by Sharpe ratio.
 */

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const CLOB_BASE = "https://clob.polymarket.com";
const CSV_PATH  = path.join(process.cwd(), "data", "markets.csv");
const SIZE_USDC = 10;
const MAX_MKTS  = 25;

// ── Parameter grid ────────────────────────────────────────────────────────────

const GRID = {
  entryDays:      [3, 7, 14, 21, 30],
  minEdge:        [0.01, 0.03, 0.05, 0.08, 0.10],
  minTrendSignal: [0.0005, 0.001, 0.003, 0.006, 0.010],
};

// ── CSV loader ────────────────────────────────────────────────────────────────

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

function loadMarkets() {
  const raw   = fs.readFileSync(CSV_PATH, "utf-8");
  const lines = raw.split("\n").filter(Boolean);
  const h     = parseLine(lines[0]);
  const iQ = h.indexOf("question"), iY = h.indexOf("token_id_yes"),
        iB = h.indexOf("best_bid"),  iA = h.indexOf("best_ask"),
        iL = h.indexOf("last_trade_price"), iV = h.indexOf("volume");

  const out: { question:string; tokenId:string; bid:number; ask:number; ltp:number|null }[] = [];

  for (let i = 1; i < lines.length && out.length < MAX_MKTS * 6; i++) {
    const c = parseLine(lines[i]);
    const b = parseFloat(c[iB]), a = parseFloat(c[iA]);
    if (!isFinite(b)||!isFinite(a)||b<=0||a<=0||a<=b) continue;
    const mid = (b+a)/2;
    if (mid < 0.05 || mid > 0.95) continue;
    if ((a-b) > 0.40) continue;
    if ((parseFloat(c[iV])||0) < 5_000) continue;
    const tok = c[iY]?.trim(); if (!tok) continue;
    const ltp = parseFloat(c[iL]);
    out.push({ question: c[iQ]??"", tokenId: tok, bid: b, ask: a,
               ltp: isFinite(ltp)&&ltp>0&&ltp<1 ? ltp : null });
  }
  const step = Math.max(1, Math.floor(out.length / MAX_MKTS));
  return out.filter((_,i)=>i%step===0).slice(0, MAX_MKTS);
}

// ── CLOB history ──────────────────────────────────────────────────────────────

type Pt = { ts: number; p: number };

async function fetchHistory(tokenId: string): Promise<Pt[]> {
  const url = `${CLOB_BASE}/prices-history?market=${encodeURIComponent(tokenId)}&interval=1m&fidelity=1440`;
  try {
    const res = await fetch(url, { next: { revalidate: 600 } });
    if (!res.ok) return [];
    const data = await res.json();
    return ((data?.history ?? []) as {t:number;p:string}[])
      .filter(r=>r.t&&r.p)
      .map(r=>({ ts: Number(r.t)*1000, p: parseFloat(r.p) }))
      .sort((a,b)=>a.ts-b.ts);
  } catch { return []; }
}

function priceAt(hist: Pt[], ms: number): number|null {
  let best: Pt|null = null;
  for (const pt of hist) {
    if (pt.ts <= ms + 86_400_000) best = pt;
    else break;
  }
  return best ? best.p : null;
}

function slope(pts: Pt[]): number {
  if (pts.length < 3) return 0;
  const n = pts.length;
  const mt = pts.reduce((s,p)=>s+p.ts,0)/n;
  const mp = pts.reduce((s,p)=>s+p.p,0)/n;
  let num=0,den=0;
  for (const p of pts) { num+=(p.ts-mt)*(p.p-mp); den+=(p.ts-mt)**2; }
  return den===0 ? 0 : (num/den)*86_400_000;
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function sharpe(returns: number[]): number {
  if (returns.length < 2) return 0;
  const m  = returns.reduce((s,r)=>s+r,0)/returns.length;
  const sd = Math.sqrt(returns.reduce((s,r)=>s+(r-m)**2,0)/returns.length);
  return sd===0 ? 0 : (m/sd)*Math.sqrt(252);
}

function maxDD(pnls: number[]): number {
  let cum=0, peak=-Infinity, dd=0;
  for (const p of pnls) {
    cum+=p;
    if (cum>peak) peak=cum;
    if (peak>0) dd=Math.max(dd,(peak-cum)/peak);
  }
  return dd;
}

// ── Simulate one parameter combo against pre-loaded histories ─────────────────

interface MarketData {
  question: string;
  bid: number; ask: number; ltp: number|null;
  history: Pt[];
}

function simulate(
  markets: MarketData[],
  entryDays: number,
  minEdge: number,
  minTrendSignal: number,
  now: number,
) {
  const DAY = 86_400_000;
  const entryMs  = now - entryDays * DAY;
  const trendWin = 7 * DAY;

  const trades: { pnl: number; won: boolean; returnPct: number }[] = [];

  for (const m of markets) {
    if (m.history.length < 5) continue;

    const entryPrice = priceAt(m.history, entryMs);
    if (!entryPrice || entryPrice < 0.04 || entryPrice > 0.96) continue;

    const currentPrice = m.history[m.history.length-1].p;

    const trendPts = m.history.filter(pt => pt.ts >= entryMs-trendWin && pt.ts <= entryMs);
    const trendPerDay = slope(trendPts);

    const ltpValid = m.ltp !== null && Math.abs(m.ltp - entryPrice) <= 0.20;
    const unc   = Math.min(1, (m.ask-m.bid)/0.12);
    const fairP = ltpValid ? m.ltp!*(1-unc)+entryPrice*unc : entryPrice;
    const edge  = Math.min(0.12, Math.abs(fairP-entryPrice));

    if (edge < minEdge) continue;
    if (Math.abs(trendPerDay) < minTrendSignal) continue;

    // Both signals must agree on direction
    const fairDir  = fairP > entryPrice ? "YES" : "NO";
    const trendDir = trendPerDay > 0    ? "YES" : "NO";
    if (fairDir !== trendDir) continue;
    const direction = fairDir;
    const priceMove = direction==="YES" ? currentPrice-entryPrice : entryPrice-currentPrice;
    const pnl = (SIZE_USDC/entryPrice)*priceMove;

    trades.push({ pnl, won: pnl>0, returnPct: pnl/SIZE_USDC });
  }

  if (!trades.length) return null;

  const totalPnl = trades.reduce((s,t)=>s+t.pnl,0);
  const winRate  = trades.filter(t=>t.won).length/trades.length;
  const sh       = sharpe(trades.map(t=>t.returnPct));
  const dd       = maxDD(trades.map(t=>t.pnl));

  return { trades: trades.length, totalPnl, winRate, sharpe: sh, maxDrawdown: dd };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const markets = loadMarkets();
    const now     = Date.now();

    // Fetch all histories in parallel once
    const histories = await Promise.all(markets.map(m => fetchHistory(m.tokenId)));
    const data: MarketData[] = markets.map((m,i) => ({ ...m, history: histories[i] }));

    // Sweep all combinations
    const results: {
      entryDays: number; minEdge: number; minTrendSignal: number;
      trades: number; totalPnl: number; winRate: number; sharpe: number; maxDrawdown: number;
    }[] = [];

    for (const ed of GRID.entryDays) {
      for (const me of GRID.minEdge) {
        for (const mt of GRID.minTrendSignal) {
          const sim = simulate(data, ed, me, mt, now);
          if (!sim || sim.trades < 3) continue; // need enough trades to be meaningful
          results.push({ entryDays: ed, minEdge: me, minTrendSignal: mt, ...sim });
        }
      }
    }

    // Rank by Sharpe, return top 15
    results.sort((a,b) => b.sharpe - a.sharpe);
    const top = results.slice(0, 15);

    // Best overall
    const best = top[0] ?? null;

    return NextResponse.json({
      best,
      results: top,
      totalCombinations: GRID.entryDays.length * GRID.minEdge.length * GRID.minTrendSignal.length,
      validCombinations: results.length,
      marketsUsed: markets.length,
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
