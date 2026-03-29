/**
 * scripts/enrich-markets-ai.mjs
 *
 * Enriches data/markets.csv with Claude AI probability estimates.
 * Adds columns: ai_probability, ai_confidence, ai_key_factor
 *
 * Filters BEFORE calling API (to save cost):
 *   - Already enriched (skip)
 *   - Mid < 5% or > 95% (near-resolved, skip)
 *   - Spread > 40% (no real market, skip)
 *   - Volume < $5,000 (illiquid, skip)
 *   - No valid token_id_yes (skip)
 *   - end_date already passed (skip)
 *
 * Efficiency:
 *   - 5 concurrent workers (news fetch + Claude in parallel)
 *   - News fetch and Claude call overlap across workers
 *   - Saves CSV in batches of 10 (not every row)
 *   - Resumable — skips already-filled rows
 *
 * Usage:
 *   node scripts/enrich-markets-ai.mjs
 *   node scripts/enrich-markets-ai.mjs --max 500
 */

import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { fileURLToPath } from "url";

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const CSV_PATH   = path.join(__dirname, "..", "data", "markets.csv");
const CONCURRENCY = 5;   // parallel workers
const SAVE_EVERY  = 10;  // write CSV every N completions

// ── Load .env.local ───────────────────────────────────────────────────────────

const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
}

const client = new Anthropic();

// ── CSV helpers ───────────────────────────────────────────────────────────────

function parseLine(line) {
  const f = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (q && line[i+1]==='"') { cur+='"'; i++; } else q=!q; }
    else if (ch===',' && !q) { f.push(cur); cur=''; }
    else cur+=ch;
  }
  f.push(cur); return f;
}

function csvEscape(s) {
  if (s == null) return "";
  const str = String(s);
  return (str.includes(",") || str.includes('"') || str.includes("\n"))
    ? '"' + str.replace(/"/g, '""') + '"'
    : str;
}

function saveCSV(header, rows) {
  const out = [header, ...rows].map(r => r.map(csvEscape).join(",")).join("\n") + "\n";
  fs.writeFileSync(CSV_PATH, out, "utf-8");
}

// ── Pre-filter: cheap checks before any API call ──────────────────────────────

function shouldSkip(row, cols) {
  const { iP, iQ, iB, iA, iV, iY, iE } = cols;

  // Already enriched
  if (row[iP] && row[iP] !== "") return "done";

  // No question or token
  if (!row[iQ]?.trim()) return "no-question";
  if (!row[iY]?.trim()) return "no-token";

  // Near-resolved: mid < 5% or > 95%
  const bid = parseFloat(row[iB]), ask = parseFloat(row[iA]);
  if (!isFinite(bid) || !isFinite(ask) || bid <= 0 || ask <= bid) return "no-market";
  const mid = (bid + ask) / 2;
  if (mid < 0.05 || mid > 0.95) return "near-resolved";

  // Too wide spread
  if (ask - bid > 0.40) return "wide-spread";

  // Too illiquid
  const vol = parseFloat(row[iV]) || 0;
  if (vol < 5_000) return "low-volume";

  // Already expired
  const endDate = row[iE]?.trim();
  if (endDate) {
    const end = Date.parse(endDate);
    if (isFinite(end) && end < Date.now()) return "expired";
  }

  return null;
}

// ── Google News RSS ───────────────────────────────────────────────────────────

function extractTag(xml, tag) {
  const start = xml.indexOf(`<${tag}`);
  if (start === -1) return "";
  const close = xml.indexOf(">", start);
  if (close === -1) return "";
  const end = xml.indexOf(`</${tag}>`, close);
  if (end === -1) return "";
  return xml.slice(close + 1, end).trim();
}

function cleanXml(s) {
  return s.replace(/<!\[CDATA\[/g,"").replace(/\]\]>/g,"")
          .replace(/<[^>]+>/g," ").replace(/&amp;/g,"&")
          .replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/\s+/g," ").trim();
}

async function fetchNews(question) {
  try {
    const keywords = question
      .replace(/\?|will |before |after |by |in |the /gi, " ")
      .split(/\s+/).filter(w => w.length > 3).slice(0, 5).join(" ");
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(keywords)}&hl=en-US&gl=US&ceid=US:en`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; polymarket-bot/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return "(no news)";
    const xml = await res.text();
    return xml.split("<item>").slice(1, 5).map((item, i) => {
      const title = cleanXml(extractTag(item, "title"));
      const desc  = cleanXml(extractTag(item, "description")).slice(0, 200);
      const src   = cleanXml(extractTag(item, "source"));
      return `[${i+1}] ${title} — ${src}\n    ${desc}`;
    }).join("\n\n") || "(no news)";
  } catch {
    return "(no news)";
  }
}

// ── Claude ────────────────────────────────────────────────────────────────────

async function askClaude(question, news) {
  const msg = await client.messages.create({
    model:      "claude-sonnet-4-6",
    max_tokens: 100,
    messages:   [{
      role: "user",
      content: `Prediction market analyst. Give YES probability for: "${question}"\n\nNews:\n${news}\n\nJSON only: {"probability":<0-1>,"confidence":"low"|"medium"|"high","keyFactor":"<one sentence>"}`,
    }],
  });
  const raw     = msg.content[0].text ?? "";
  const jsonStr = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
  return JSON.parse(jsonStr);
}

// ── Concurrency pool ──────────────────────────────────────────────────────────

async function processRow(row, cols, idx, total) {
  const { iP, iC, iK, iQ } = cols;
  const question = row[iQ];
  process.stdout.write(`[${idx+1}/${total}] ${question.slice(0, 65)}… `);
  try {
    const [news] = await Promise.all([fetchNews(question)]);
    const result = await askClaude(question, news);
    row[iP] = String(result.probability ?? "");
    row[iC] = String(result.confidence  ?? "");
    row[iK] = String(result.keyFactor   ?? "");
    console.log(`→ ${(result.probability * 100).toFixed(0)}% (${result.confidence})`);
    return true;
  } catch (err) {
    // Retry once on rate limit
    if (err.message?.includes("429") || err.message?.includes("rate")) {
      await new Promise(r => setTimeout(r, 30000));
      try {
        const news   = await fetchNews(question);
        const result = await askClaude(question, news);
        row[iP] = String(result.probability ?? "");
        row[iC] = String(result.confidence  ?? "");
        row[iK] = String(result.keyFactor   ?? "");
        console.log(`→ ${(result.probability * 100).toFixed(0)}% (retry)`);
        return true;
      } catch {}
    }
    console.log(`→ ERROR: ${err.message?.slice(0, 80)}`);
    return false;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const raw    = fs.readFileSync(CSV_PATH, "utf-8");
  const lines  = raw.split("\n").filter(Boolean);
  const header = parseLine(lines[0]);

  // Ensure new columns exist
  for (const c of ["ai_probability", "ai_confidence", "ai_key_factor"]) {
    if (!header.includes(c)) header.push(c);
  }

  const cols = {
    iP: header.indexOf("ai_probability"),
    iC: header.indexOf("ai_confidence"),
    iK: header.indexOf("ai_key_factor"),
    iQ: header.indexOf("question"),
    iB: header.indexOf("best_bid"),
    iA: header.indexOf("best_ask"),
    iV: header.indexOf("volume"),
    iY: header.indexOf("token_id_yes"),
    iE: header.indexOf("end_date"),
  };

  const rows = lines.slice(1).map(l => parseLine(l));
  // Pad all rows
  rows.forEach(r => { while (r.length < header.length) r.push(""); });

  const maxArg = process.argv.indexOf("--max");
  const maxRun = maxArg !== -1 ? parseInt(process.argv[maxArg + 1], 10) : Infinity;

  // Pre-filter: split into work queue and already-done
  const queue = [];
  let preSkipped = 0;
  for (let i = 0; i < rows.length; i++) {
    const reason = shouldSkip(rows[i], cols);
    if (reason === null) {
      if (queue.length < maxRun) queue.push(i);
    } else {
      if (reason !== "done") preSkipped++;
    }
  }

  const alreadyDone = rows.filter(r => r[cols.iP] && r[cols.iP] !== "").length;
  console.log(`CSV: ${rows.length} total rows`);
  console.log(`  Already enriched: ${alreadyDone}`);
  console.log(`  Filtered (bad markets): ${preSkipped}`);
  console.log(`  To process: ${queue.length} markets`);
  console.log(`  Concurrency: ${CONCURRENCY} workers\n`);

  if (queue.length === 0) { console.log("Nothing to do."); return; }

  let done = 0, failed = 0, saveCounter = 0;

  // Process with concurrency pool
  let qi = 0;
  async function worker() {
    while (qi < queue.length) {
      const idx = queue[qi++];
      const ok  = await processRow(rows[idx], cols, idx, rows.length);
      if (ok) done++; else failed++;
      saveCounter++;
      if (saveCounter >= SAVE_EVERY) {
        saveCSV(header, rows);
        saveCounter = 0;
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // Final save
  saveCSV(header, rows);
  console.log(`\nDone. ${done} enriched, ${failed} failed, ${preSkipped} pre-filtered.`);
}

main().catch(err => { console.error(err); process.exit(1); });
