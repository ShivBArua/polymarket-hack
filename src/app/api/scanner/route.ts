/**
 * Strategy 1 — Low-Latency Scanner API
 *
 * Edge model (honest):
 *
 *   mid    = (best_bid + best_ask) / 2
 *   spread = best_ask − best_bid
 *
 *   fairP  = blend of last_trade_price and mid, weighted by spread:
 *              uncertainty = min(1, spread / 0.12)
 *              fairP = ltp*(1−unc) + mid*unc        if |ltp − mid| ≤ 0.20
 *              fairP = mid                           if ltp is stale/missing
 *
 *   The |ltp − mid| > 0.20 guard filters markets where the order book hasn't
 *   updated since the last print — that gap is data latency, not real edge.
 *
 *   edge   = |fairP − mid|, capped at 0.12 (12 cents per $1 notional)
 *   source = "momentum" if ltp was used, "spread" if only bid/ask used
 *
 * Why capped at 0.12?
 *   A legitimate pre-resolution mispricing on a liquid market is rarely more
 *   than 10–15 cents. Larger gaps almost always mean stale quotes.
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { ScannerEntry, Urgency } from "@/types";

const CSV_PATH = path.join(process.cwd(), "data", "markets.csv");
const MAX_EDGE  = 0.12;   // cap: 12 cents per $1
const STALE_GAP = 0.20;   // if |ltp - mid| > this, treat ltp as stale

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "", inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      fields.push(current); current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function urgencyFromDays(days: number | null): Urgency {
  if (days === null) return "low";
  if (days <= 1)  return "critical";
  if (days <= 7)  return "high";
  if (days <= 30) return "medium";
  return "low";
}

export async function GET(req: NextRequest) {
  const params   = req.nextUrl.searchParams;
  const limit    = parseInt(params.get("limit")   ?? "25", 10);
  const minEdge  = parseFloat(params.get("minEdge") ?? "0.01");
  const now      = Date.now();

  try {
    const raw     = fs.readFileSync(CSV_PATH, "utf-8");
    const lines   = raw.split("\n").filter(Boolean);
    const headers = parseCsvLine(lines[0]);
    const idx     = (h: string) => headers.indexOf(h);

    const iId   = idx("id");
    const iQ    = idx("question");
    const iCond = idx("conditionId");
    const iVol  = idx("volume");
    const iTokY = idx("token_id_yes");
    const iTokN = idx("token_id_no");
    const iLtp  = idx("last_trade_price");
    const iBid  = idx("best_bid");
    const iAsk  = idx("best_ask");
    const iEnd  = idx("end_date");

    const results: ScannerEntry[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols    = parseCsvLine(lines[i]);
      const best_bid = parseFloat(cols[iBid]);
      const best_ask = parseFloat(cols[iAsk]);

      if (!isFinite(best_bid) || !isFinite(best_ask)) continue;
      if (best_bid <= 0 || best_ask <= 0 || best_ask <= best_bid) continue;
      if (best_ask - best_bid > 0.50) continue; // absurdly wide spread = no real market

      const mid    = (best_bid + best_ask) / 2;
      const spread = best_ask - best_bid;

      // Skip already-resolved markets
      if (mid < 0.03 || mid > 0.97) continue;

      const ltp     = parseFloat(cols[iLtp]);
      const ltpValid = isFinite(ltp) && ltp > 0 && ltp < 1
                       && Math.abs(ltp - mid) <= STALE_GAP;

      let fairP: number;
      let edgeSource: "momentum" | "spread";

      if (ltpValid) {
        // Blend: wide spread → trust ltp less, regress toward mid
        const uncertainty = Math.min(1, spread / 0.12);
        fairP      = ltp * (1 - uncertainty) + mid * uncertainty;
        edgeSource = "momentum";
      } else {
        // No reliable last-trade — use spread alone as a staleness proxy
        // Wider spread = market maker unsure → mid is less certain
        // Slight pull toward 0.5 proportional to spread
        fairP      = mid * (1 - spread * 0.5) + 0.5 * spread * 0.5;
        edgeSource = "spread";
      }

      const rawEdge = Math.abs(fairP - mid);
      const edge    = Math.min(MAX_EDGE, rawEdge);

      if (edge < minEdge) continue;

      const direction = fairP > mid ? "YES" : "NO";

      // End date
      const endRaw = cols[iEnd]?.trim();
      let end_date: string | null           = null;
      let daysToResolution: number | null   = null;
      if (endRaw) {
        const ms = Date.parse(endRaw);
        if (isFinite(ms)) {
          end_date          = new Date(ms).toISOString();
          daysToResolution  = Math.max(0, (ms - now) / 86_400_000);
        }
      }

      results.push({
        id:               cols[iId]  ?? String(i),
        question:         cols[iQ]   ?? "",
        conditionId:      cols[iCond] ?? "",
        tokenIdYes:       cols[iTokY] ?? "",
        tokenIdNo:        cols[iTokN] ?? "",
        volume:           parseFloat(cols[iVol]) || 0,
        best_bid,
        best_ask,
        last_trade_price: ltpValid ? ltp : null,
        end_date,
        mid,
        spread,
        fairP:            parseFloat(fairP.toFixed(4)),
        edge:             parseFloat(edge.toFixed(4)),
        edgeSource,
        direction,
        daysToResolution,
        urgency:          urgencyFromDays(daysToResolution),
      });
    }

    // Sort: urgency first, then edge
    const urgencyScore: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
    results.sort((a, b) => {
      const uDiff = urgencyScore[b.urgency] - urgencyScore[a.urgency];
      return uDiff !== 0 ? uDiff : b.edge - a.edge;
    });

    return NextResponse.json(results.slice(0, limit));
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
