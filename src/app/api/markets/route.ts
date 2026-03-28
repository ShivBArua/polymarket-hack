import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

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

function parseRow(headers: string[], values: string[]) {
  const obj: Record<string, string> = {};
  headers.forEach((h, i) => { obj[h] = values[i] ?? ""; });
  return obj;
}

function loadFromCsv(query: string, limit: number) {
  const raw = fs.readFileSync(CSV_PATH, "utf-8");
  const lines = raw.split("\n").filter(Boolean);
  const headers = parseCsvLine(lines[0]);
  const q = query.toLowerCase();

  const results = [];
  for (let i = 1; i < lines.length && results.length < limit; i++) {
    const row = parseRow(headers, parseCsvLine(lines[i]));
    if (q && !row.question.toLowerCase().includes(q)) continue;
    if (!row.token_id_yes) continue;

    results.push({
      id: row.id,
      question: row.question,
      conditionId: row.conditionId,
      volume: parseFloat(row.volume) || 0,
      last_trade_price: parseFloat(row.last_trade_price) || null,
      best_bid: parseFloat(row.best_bid) || null,
      best_ask: parseFloat(row.best_ask) || null,
      tokens: [
        { token_id: row.token_id_yes, outcome: row.outcome_yes || "Yes" },
        { token_id: row.token_id_no, outcome: row.outcome_no || "No" },
      ],
    });
  }
  return results;
}

const GAMMA_BASE = "https://gamma-api.polymarket.com";

async function loadFromApi(limit: number) {
  const res = await fetch(
    `${GAMMA_BASE}/markets?limit=${limit}&active=true&closed=false`,
    { next: { revalidate: 60 } }
  );
  if (!res.ok) throw new Error(`Upstream error ${res.status}`);
  const raw: any[] = await res.json();

  return raw
    .filter((m) => m.question && m.clobTokenIds)
    .map((m) => {
      const tokenIds: string[] =
        typeof m.clobTokenIds === "string"
          ? JSON.parse(m.clobTokenIds)
          : m.clobTokenIds;
      const outcomes: string[] =
        typeof m.outcomes === "string"
          ? JSON.parse(m.outcomes)
          : (m.outcomes ?? []);
      return {
        id: m.id ?? m.conditionId ?? "",
        question: m.question,
        conditionId: m.conditionId ?? "",
        volume: parseFloat(m.volume ?? "0") || 0,
        last_trade_price: parseFloat(m.lastTradePrice) || null,
        best_bid: parseFloat(m.bestBid) || null,
        best_ask: parseFloat(m.bestAsk) || null,
        tokens: tokenIds.map((id: string, i: number) => ({
          token_id: id,
          outcome: outcomes[i] ?? `Outcome ${i + 1}`,
        })),
      };
    })
    .filter((m) => m.tokens.length > 0);
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const limit = parseInt(params.get("limit") ?? "50", 10);
  const query = params.get("q") ?? "";

  try {
    if (fs.existsSync(CSV_PATH)) {
      const markets = loadFromCsv(query, limit);
      return NextResponse.json(markets);
    }
    const markets = await loadFromApi(limit);
    return NextResponse.json(markets);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
