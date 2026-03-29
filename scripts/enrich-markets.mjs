/**
 * Reads data/markets.csv, computes fair_p and edge for each market,
 * and writes an enriched CSV back to the same file.
 *
 * Fair-value model:
 *   mid     = (best_bid + best_ask) / 2
 *   spread  = best_ask − best_bid
 *   uncertainty = min(1, spread / 0.15)        ← wide spread → less trust in LTP
 *   fair_p  = ltp * (1−uncertainty) + mid * uncertainty
 *   edge    = fair_p − mid                     ← positive → buy YES, negative → buy NO
 *
 * Usage:  node scripts/enrich-markets.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_PATH  = path.join(__dirname, "..", "data", "markets.csv");

function parseLine(line) {
  const fields = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === "," && !inQ) { fields.push(cur); cur = ""; }
    else cur += ch;
  }
  fields.push(cur);
  return fields;
}

function escapeCsv(v) {
  const s = String(v ?? "").replace(/"/g, '""');
  return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s}"` : s;
}

function computeFairP(ltp, bid, ask) {
  const midVal   = (bid + ask) / 2;
  const spread   = ask - bid;
  if (!isFinite(ltp)) return midVal;
  const unc = Math.min(1, spread / 0.15);
  return ltp * (1 - unc) + midVal * unc;
}

const raw     = fs.readFileSync(CSV_PATH, "utf-8");
const lines   = raw.split("\n").filter(Boolean);
const headers = parseLine(lines[0]);

const iLtp = headers.indexOf("last_trade_price");
const iBid = headers.indexOf("best_bid");
const iAsk = headers.indexOf("best_ask");

// Add new columns if not already present
const newHeaders = [...headers];
if (!newHeaders.includes("fair_p")) newHeaders.push("fair_p");
if (!newHeaders.includes("model_edge")) newHeaders.push("model_edge");

const iFP  = newHeaders.indexOf("fair_p");
const iME  = newHeaders.indexOf("model_edge");

let enriched = 0, skipped = 0;
const outLines = [newHeaders.join(",")];

for (let i = 1; i < lines.length; i++) {
  const cols = parseLine(lines[i]);
  while (cols.length < newHeaders.length) cols.push("");

  const bid = parseFloat(cols[iBid]);
  const ask = parseFloat(cols[iAsk]);
  const ltp = parseFloat(cols[iLtp]);

  if (!isFinite(bid) || !isFinite(ask) || ask <= bid) {
    cols[iFP] = "";
    cols[iME] = "";
    skipped++;
  } else {
    const mid    = (bid + ask) / 2;
    const fairP  = computeFairP(isFinite(ltp) ? ltp : null, bid, ask);
    const edge   = fairP - mid;
    cols[iFP]    = fairP.toFixed(4);
    cols[iME]    = edge.toFixed(4);
    enriched++;
  }

  outLines.push(newHeaders.map((_, j) => escapeCsv(cols[j])).join(","));

  if (i % 5000 === 0) process.stdout.write(`  processed ${i}/${lines.length - 1}\n`);
}

fs.writeFileSync(CSV_PATH, outLines.join("\n"), "utf-8");
console.log(`Done. Enriched: ${enriched}, skipped: ${skipped}`);
console.log(`Columns added: fair_p, model_edge → ${CSV_PATH}`);
