/**
 * Strategy 1 — Low-Latency Scanner API
 *
 * Reads the local markets CSV, scores each market for potential alpha,
 * and returns a ranked list of trade signals.
 *
 * Edge signal logic:
 *   mid         = (best_bid + best_ask) / 2
 *   spread      = best_ask − best_bid
 *   momentum    = last_trade_price − mid  (positive → price recently higher)
 *   edge        = |momentum| if |momentum| > 0.02, else spread * 0.4
 *   direction   = YES if momentum > 0, else NO
 *
 * Urgency is derived from days to market resolution.
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { ScannerEntry, Urgency } from "@/types";

const CSV_PATH = path.join(process.cwd(), "data", "markets.csv");

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
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
  if (days <= 1) return "critical";
  if (days <= 7) return "high";
  if (days <= 30) return "medium";
  return "low";
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const limit = parseInt(params.get("limit") ?? "25", 10);
  const minEdge = parseFloat(params.get("minEdge") ?? "0.01");
  const now = Date.now();

  try {
    const raw = fs.readFileSync(CSV_PATH, "utf-8");
    const lines = raw.split("\n").filter(Boolean);
    const headers = parseCsvLine(lines[0]);
    const idx = (h: string) => headers.indexOf(h);

    const iId = idx("id");
    const iQ = idx("question");
    const iCond = idx("conditionId");
    const iVol = idx("volume");
    const iTokY = idx("token_id_yes");
    const iTokN = idx("token_id_no");
    const iLtp = idx("last_trade_price");
    const iBid = idx("best_bid");
    const iAsk = idx("best_ask");
    const iEnd = idx("end_date");

    const results: ScannerEntry[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);

      const best_bid = parseFloat(cols[iBid]);
      const best_ask = parseFloat(cols[iAsk]);
      if (!isFinite(best_bid) || !isFinite(best_ask)) continue;
      if (best_bid <= 0 || best_ask <= 0 || best_ask <= best_bid) continue;

      const mid = (best_bid + best_ask) / 2;
      const spread = best_ask - best_bid;

      // Skip markets that are already fully resolved
      if (mid < 0.02 || mid > 0.98) continue;

      const ltp = parseFloat(cols[iLtp]);
      const last_trade_price = isFinite(ltp) && ltp > 0 ? ltp : null;

      const momentum = last_trade_price !== null ? last_trade_price - mid : 0;
      const edge =
        Math.abs(momentum) > 0.02
          ? Math.abs(momentum)
          : spread * 0.4;

      if (edge < minEdge) continue;

      const direction = momentum >= 0 ? "YES" : "NO";

      const endRaw = cols[iEnd]?.trim();
      let end_date: string | null = null;
      let daysToResolution: number | null = null;
      if (endRaw) {
        const ms = Date.parse(endRaw);
        if (isFinite(ms)) {
          end_date = new Date(ms).toISOString();
          daysToResolution = Math.max(0, (ms - now) / 86_400_000);
        }
      }

      results.push({
        id: cols[iId] ?? String(i),
        question: cols[iQ] ?? "",
        conditionId: cols[iCond] ?? "",
        tokenIdYes: cols[iTokY] ?? "",
        tokenIdNo: cols[iTokN] ?? "",
        volume: parseFloat(cols[iVol]) || 0,
        best_bid,
        best_ask,
        last_trade_price,
        end_date,
        mid,
        spread,
        edge,
        direction,
        daysToResolution,
        urgency: urgencyFromDays(daysToResolution),
      });
    }

    // Sort by edge desc, then by urgency (closer resolution = higher priority)
    results.sort((a, b) => {
      const urgencyScore = { critical: 4, high: 3, medium: 2, low: 1 };
      const uDiff = urgencyScore[b.urgency] - urgencyScore[a.urgency];
      if (uDiff !== 0) return uDiff * 0.3 + (b.edge - a.edge) * 0.7 > 0 ? -1 : 1;
      return b.edge - a.edge;
    });

    return NextResponse.json(results.slice(0, limit));
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
