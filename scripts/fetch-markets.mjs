/**
 * Fetches every active Polymarket market by paginating the Gamma API
 * and writes the result to data/markets.csv.
 *
 * Usage:  node scripts/fetch-markets.mjs
 *         npm run fetch-markets
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.join(__dirname, "..", "data", "markets.csv");

const GAMMA_BASE = "https://gamma-api.polymarket.com";
const PAGE_SIZE = 500;

function escapeCsv(value) {
  const str = String(value ?? "").replace(/"/g, '""');
  return str.includes(",") || str.includes('"') || str.includes("\n")
    ? `"${str}"`
    : str;
}

async function fetchPage(offset) {
  const url = `${GAMMA_BASE}/markets?active=true&closed=false&limit=${PAGE_SIZE}&offset=${offset}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gamma API error ${res.status} at offset ${offset}`);
  return res.json();
}

function parseJson(value, fallback = []) {
  if (Array.isArray(value)) return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function main() {
  console.log("Fetching all active Polymarket markets…");

  const rows = [];
  let offset = 0;
  let total = 0;

  while (true) {
    process.stdout.write(`  offset ${offset}…`);
    const page = await fetchPage(offset);
    if (!page.length) {
      console.log(" done.");
      break;
    }

    for (const m of page) {
      const tokenIds = parseJson(m.clobTokenIds);
      const outcomes = parseJson(m.outcomes);

      if (!m.question || tokenIds.length === 0) continue;

      rows.push({
        id: m.id ?? "",
        question: m.question,
        conditionId: m.conditionId ?? "",
        volume: parseFloat(m.volume ?? "0"),
        token_id_yes: tokenIds[0] ?? "",
        token_id_no: tokenIds[1] ?? "",
        outcome_yes: outcomes[0] ?? "Yes",
        outcome_no: outcomes[1] ?? "No",
        last_trade_price: m.lastTradePrice ?? "",
        best_bid: m.bestBid ?? "",
        best_ask: m.bestAsk ?? "",
        end_date: m.endDate ?? "",
      });
    }

    console.log(` ${page.length} markets`);
    total += page.length;
    offset += PAGE_SIZE;

    if (page.length < PAGE_SIZE) break;
  }

  const HEADERS = [
    "id", "question", "conditionId", "volume",
    "token_id_yes", "token_id_no", "outcome_yes", "outcome_no",
    "last_trade_price", "best_bid", "best_ask", "end_date",
  ];

  const lines = [
    HEADERS.join(","),
    ...rows.map((r) => HEADERS.map((h) => escapeCsv(r[h])).join(",")),
  ];

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, lines.join("\n"), "utf-8");

  console.log(`\nWrote ${rows.length} markets to ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
