"use client";

import { useEffect, useRef, useState } from "react";
import type { NTArticle, NTMatch, NTTrade, NTPosition, TraderStatus } from "@/lib/newsTrader";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FEED_COLORS: Record<string, string> = {
  ap_top: "#E8543A", ap_politics: "#E8543A",
  reuters_top: "#FF6600", reuters_politics: "#FF6600",
  nyt_home: "#000", nyt_politics: "#000", nyt_world: "#000",
  bbc_world: "#BB1919", bbc_top: "#BB1919", bbc_sport: "#BB1919",
  guardian_world: "#052962", guardian_us: "#052962",
  politico: "#1F3B63", the_hill: "#2E5481",
  axios: "#FF4500", cnbc_top: "#003087",
  espn: "#CC0000", marketwatch: "#0078BE",
};

function feedColor(feed: string) {
  return FEED_COLORS[feed] ?? "#4B5563";
}

function feedLabel(feed: string) {
  return feed.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()).replace(" Top", "").replace(" Home", "").replace(" Politics", " Pol.").replace(" World", " Wrld");
}

function fmt(ts: number) {
  return new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function fmtMs(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function ago(ts: number) {
  const s = Math.floor(Date.now() / 1000 - ts);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ArticleRow({ a, isNew }: { a: NTArticle; isNew: boolean }) {
  const [flash, setFlash] = useState(isNew);
  useEffect(() => {
    if (isNew) { const t = setTimeout(() => setFlash(false), 1200); return () => clearTimeout(t); }
  }, [isNew]);

  return (
    <div
      className="flex gap-2 px-3 py-2 border-b transition-colors"
      style={{
        borderColor: "var(--border)",
        background: flash ? (a.relevant ? "#EFF6FF" : "#FAFAFA") : "transparent",
      }}
    >
      <div className="flex-shrink-0 mt-0.5">
        <span
          className="inline-block text-[9px] font-bold px-1.5 py-0.5 rounded text-white leading-none"
          style={{ background: feedColor(a.feed) }}
        >
          {feedLabel(a.feed)}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-xs leading-tight truncate ${a.relevant ? "font-medium" : "text-[var(--text-muted)]"}`}
          style={{ color: a.relevant ? "var(--text)" : "var(--text-subtle)" }}>
          {a.title}
        </p>
        <p className="text-[10px] mt-0.5" style={{ color: "var(--text-subtle)" }}>
          {ago(a.publishedTs)}
          {a.relevant && <span className="ml-1.5 text-blue-500 font-semibold">● signal</span>}
        </p>
      </div>
    </div>
  );
}

function MatchCard({ m, isNew }: { m: NTMatch; isNew: boolean }) {
  const [flash, setFlash] = useState(isNew);
  useEffect(() => {
    if (isNew) { const t = setTimeout(() => setFlash(false), 2000); return () => clearTimeout(t); }
  }, [isNew]);

  return (
    <div
      className="rounded-lg border p-3 mb-2 transition-all"
      style={{
        borderColor: flash ? "#2563EB" : "var(--border)",
        background: flash ? "#EFF6FF" : "var(--surface)",
        boxShadow: flash ? "0 0 0 1px #2563EB22" : "none",
      }}
    >
      <div className="flex items-start gap-2">
        <span
          className="text-[9px] font-bold px-1.5 py-0.5 rounded text-white flex-shrink-0 mt-0.5"
          style={{ background: feedColor(m.feed) }}
        >
          {feedLabel(m.feed)}
        </span>
        <p className="text-[11px] font-medium leading-tight" style={{ color: "var(--text)" }}>
          {m.headline}
        </p>
      </div>
      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>→</span>
        <span className="text-[10px] leading-snug flex-1" style={{ color: "var(--text-muted)" }}>
          {m.marketQuestion.slice(0, 70)}{m.marketQuestion.length > 70 ? "…" : ""}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-2 flex-wrap">
        <span
          className="text-[10px] font-bold px-1.5 py-0.5 rounded"
          style={{ background: m.direction === "YES" ? "#D1FAE5" : "#FEE2E2", color: m.direction === "YES" ? "#065F46" : "#991B1B" }}
        >
          {m.direction}
        </span>
        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          {(m.confidence * 100).toFixed(0)}% conf
        </span>
        <span className="text-[10px] font-medium" style={{ color: m.edge > 0 ? "#059669" : "#DC2626" }}>
          edge {m.edge > 0 ? "+" : ""}{(m.edge * 100).toFixed(1)}¢
        </span>
        <span className="text-[10px]" style={{ color: "var(--text-subtle)" }}>
          mid {(m.mid * 100).toFixed(1)}¢
        </span>
      </div>
      <p className="mt-1 text-[10px] italic leading-tight" style={{ color: "var(--text-subtle)" }}>
        {m.reasoning}
      </p>
    </div>
  );
}

function TradeCard({ t, isNew }: { t: NTTrade; isNew: boolean }) {
  const [flash, setFlash] = useState(isNew);
  useEffect(() => {
    if (isNew) { const t2 = setTimeout(() => setFlash(false), 2500); return () => clearTimeout(t2); }
  }, [isNew]);

  return (
    <div
      className="rounded-lg border p-3 mb-2 transition-all"
      style={{
        borderColor: flash ? "#059669" : "var(--border)",
        background: flash ? "#F0FDF4" : "var(--surface)",
        boxShadow: flash ? "0 0 0 1px #05966922" : "none",
      }}
    >
      <div className="flex items-center gap-2">
        <span className="text-base">📄</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className="text-[11px] font-bold px-2 py-0.5 rounded"
              style={{ background: t.direction === "YES" ? "#059669" : "#DC2626", color: "white" }}
            >
              {t.direction}
            </span>
            <span className="text-[13px] font-bold" style={{ color: "var(--text)" }}>
              ${t.size.toFixed(2)}
            </span>
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              @ {(t.price * 100).toFixed(1)}¢
            </span>
            <span className="text-[10px]" style={{ color: "var(--text-subtle)" }}>
              {fmtMs(t.ts)}
            </span>
          </div>
          <p className="text-[10px] mt-0.5 leading-tight" style={{ color: "var(--text-muted)" }}>
            {t.marketQuestion.slice(0, 65)}{t.marketQuestion.length > 65 ? "…" : ""}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-[10px] font-medium" style={{ color: "#059669" }}>
            +{(t.edge * 100).toFixed(1)}¢ edge
          </div>
          <div className="text-[10px]" style={{ color: "var(--text-subtle)" }}>
            {(t.confidence * 100).toFixed(0)}% conf
          </div>
        </div>
      </div>
      <div className="mt-1.5 flex items-start gap-1">
        <span className="text-[10px] flex-shrink-0" style={{ color: "var(--text-subtle)" }}>via</span>
        <span
          className="text-[9px] font-bold px-1 py-0.5 rounded text-white flex-shrink-0"
          style={{ background: feedColor(t.feed) }}
        >
          {feedLabel(t.feed)}
        </span>
        <p className="text-[10px] italic ml-1 leading-tight" style={{ color: "var(--text-subtle)" }}>
          "{t.headline.slice(0, 55)}{t.headline.length > 55 ? "…" : ""}"
        </p>
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function LiveTraderPanel() {
  const [articles,  setArticles]  = useState<NTArticle[]>([]);
  const [matches,   setMatches]   = useState<NTMatch[]>([]);
  const [trades,    setTrades]    = useState<NTTrade[]>([]);
  const [positions, setPositions] = useState<NTPosition[]>([]);
  const [status,    setStatus]    = useState<TraderStatus | null>(null);
  const [newUids,   setNewUids]   = useState<Set<string>>(new Set());
  const [pollLabel, setPollLabel] = useState<string>("Connecting…");
  const [connected, setConnected] = useState(false);

  const articleRef = useRef<HTMLDivElement>(null);
  const esRef      = useRef<EventSource | null>(null);

  const markNew = (uid: string) => {
    setNewUids(s => { const n = new Set(s); n.add(uid); return n; });
    setTimeout(() => setNewUids(s => { const n = new Set(s); n.delete(uid); return n; }), 3000);
  };

  useEffect(() => {
    const es = new EventSource("/api/news-trader/stream");
    esRef.current = es;

    es.addEventListener("article", (e: MessageEvent) => {
      const a: NTArticle = JSON.parse(e.data);
      setArticles(prev => { const next = [a, ...prev.filter(x => x.uid !== a.uid)].slice(0, 100); return next; });
      markNew(a.uid);
      // Auto-scroll article feed
      requestAnimationFrame(() => {
        if (articleRef.current) articleRef.current.scrollTop = 0;
      });
    });

    es.addEventListener("match", (e: MessageEvent) => {
      const m: NTMatch = JSON.parse(e.data);
      setMatches(prev => [m, ...prev.filter(x => x.uid !== m.uid)].slice(0, 30));
      markNew(m.uid);
    });

    es.addEventListener("trade", (e: MessageEvent) => {
      const t: NTTrade = JSON.parse(e.data);
      setTrades(prev => [t, ...prev.filter(x => x.uid !== t.uid)].slice(0, 50));
      markNew(t.uid);
    });

    es.addEventListener("status", (e: MessageEvent) => {
      const s: TraderStatus = JSON.parse(e.data);
      setStatus(s);
    });

    es.addEventListener("poll", (e: MessageEvent) => {
      const p = JSON.parse(e.data);
      setPollLabel(`Poll #${p.articles} articles · ${p.relevant} signals`);
    });

    es.onopen  = () => setConnected(true);
    es.onerror = () => { setConnected(false); setPollLabel("Reconnecting…"); };

    return () => { es.close(); };
  }, []);

  const gross  = status?.grossExposure ?? 0;
  const pnl    = status?.totalPnl ?? 0;

  return (
    <div className="flex h-full overflow-hidden" style={{ background: "var(--bg)" }}>

      {/* ── Left: Live news feed ─────────────────────────────────────────── */}
      <div className="w-80 flex-shrink-0 flex flex-col border-r overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        {/* Header */}
        <div className="px-3 py-2 border-b flex-shrink-0 flex items-center gap-2" style={{ borderColor: "var(--border)" }}>
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ background: connected ? "#10B981" : "#F59E0B", boxShadow: connected ? "0 0 0 3px #10B98133" : "none" }}
          />
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            Live News Feed
          </span>
          <span className="ml-auto text-[10px]" style={{ color: "var(--text-subtle)" }}>
            {articles.length} articles
          </span>
        </div>
        <div className="text-[10px] px-3 py-1 border-b" style={{ borderColor: "var(--border)", color: "var(--text-subtle)" }}>
          {pollLabel}
        </div>

        {/* Article list */}
        <div ref={articleRef} className="flex-1 overflow-y-auto">
          {articles.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 p-4">
              <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-center" style={{ color: "var(--text-subtle)" }}>
                Fetching live news from 18+ sources…
              </p>
            </div>
          ) : (
            articles.map(a => (
              <ArticleRow key={a.uid} a={a} isNew={newUids.has(a.uid)} />
            ))
          )}
        </div>
      </div>

      {/* ── Middle: Matches & Trades ──────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Status bar */}
        <div
          className="flex-shrink-0 flex items-center gap-4 px-4 py-2 border-b"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "#FEF3C7", color: "#92400E" }}>
              PAPER MODE
            </span>
          </div>
          <div className="flex items-center gap-4 ml-2">
            <div>
              <span className="text-[10px]" style={{ color: "var(--text-subtle)" }}>Exposure </span>
              <span className="text-[11px] font-semibold" style={{ color: "var(--text)" }}>${gross.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-[10px]" style={{ color: "var(--text-subtle)" }}>Unreal. PnL </span>
              <span className="text-[11px] font-semibold" style={{ color: pnl >= 0 ? "#059669" : "#DC2626" }}>
                {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-[10px]" style={{ color: "var(--text-subtle)" }}>Trades </span>
              <span className="text-[11px] font-semibold" style={{ color: "var(--text)" }}>{trades.length}</span>
            </div>
            <div>
              <span className="text-[10px]" style={{ color: "var(--text-subtle)" }}>Polls </span>
              <span className="text-[11px] font-semibold" style={{ color: "var(--text)" }}>{status?.pollCount ?? 0}</span>
            </div>
          </div>
        </div>

        {/* Two columns: matches + trades */}
        <div className="flex-1 flex overflow-hidden min-h-0">

          {/* Matches */}
          <div className="flex-1 flex flex-col overflow-hidden border-r" style={{ borderColor: "var(--border)" }}>
            <div className="px-3 py-2 border-b flex-shrink-0" style={{ borderColor: "var(--border)" }}>
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                AI Matches
              </span>
              <span className="ml-2 text-[10px]" style={{ color: "var(--text-subtle)" }}>
                {matches.length} found
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {matches.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-1 p-4 text-center">
                  <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
                    Claude is scanning headlines for market matches…
                  </p>
                  <p className="text-[10px]" style={{ color: "var(--text-subtle)" }}>
                    min {(0.65 * 100).toFixed(0)}% confidence · min 3¢ edge
                  </p>
                </div>
              ) : (
                matches.map(m => <MatchCard key={m.uid} m={m} isNew={newUids.has(m.uid)} />)
              )}
            </div>
          </div>

          {/* Trades + Positions */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-3 py-2 border-b flex-shrink-0" style={{ borderColor: "var(--border)" }}>
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                Paper Trades
              </span>
              <span className="ml-2 text-[10px]" style={{ color: "var(--text-subtle)" }}>
                {trades.length} placed · Kelly-sized
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {trades.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 gap-1 text-center">
                  <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
                    Paper trades will appear here when confident matches are found
                  </p>
                </div>
              ) : (
                trades.map(t => <TradeCard key={t.uid} t={t} isNew={newUids.has(t.uid)} />)
              )}

              {trades.length > 0 && (
                <div className="mt-3 mb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                    Open Positions
                  </span>
                </div>
              )}

              {/* Inline positions mini-table */}
              {trades.length > 0 && (() => {
                // Derive positions from trades
                const posMap = new Map<string, { q: string; dir: string; size: number; entry: number; ts: number }>();
                for (const t of [...trades].reverse()) {
                  const ex = posMap.get(t.marketId);
                  if (ex) {
                    const newSize = ex.size + t.size;
                    ex.entry = (ex.entry * ex.size + t.price * t.size) / newSize;
                    ex.size = newSize;
                  } else {
                    posMap.set(t.marketId, { q: t.marketQuestion, dir: t.direction, size: t.size, entry: t.price, ts: t.ts });
                  }
                }
                const rows = [...posMap.values()];
                return (
                  <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)" }}>
                    <table className="w-full text-[10px]">
                      <thead>
                        <tr style={{ background: "var(--surface-2)" }}>
                          <th className="text-left px-2 py-1.5 font-semibold" style={{ color: "var(--text-muted)" }}>Market</th>
                          <th className="text-right px-2 py-1.5 font-semibold" style={{ color: "var(--text-muted)" }}>Dir</th>
                          <th className="text-right px-2 py-1.5 font-semibold" style={{ color: "var(--text-muted)" }}>Size</th>
                          <th className="text-right px-2 py-1.5 font-semibold" style={{ color: "var(--text-muted)" }}>Entry</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((p, i) => (
                          <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                            <td className="px-2 py-1.5 max-w-0" style={{ color: "var(--text)" }}>
                              <div className="truncate w-32">{p.q}</div>
                            </td>
                            <td className="px-2 py-1.5 text-right">
                              <span
                                className="font-bold"
                                style={{ color: p.dir === "YES" ? "#059669" : "#DC2626" }}
                              >{p.dir}</span>
                            </td>
                            <td className="px-2 py-1.5 text-right font-medium" style={{ color: "var(--text)" }}>
                              ${p.size.toFixed(2)}
                            </td>
                            <td className="px-2 py-1.5 text-right" style={{ color: "var(--text-muted)" }}>
                              {(p.entry * 100).toFixed(1)}¢
                            </td>
                          </tr>
                        ))}
                        <tr className="border-t" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                          <td className="px-2 py-1.5 font-semibold" style={{ color: "var(--text)" }} colSpan={2}>Total</td>
                          <td className="px-2 py-1.5 text-right font-bold" style={{ color: "var(--text)" }}>
                            ${rows.reduce((s, p) => s + p.size, 0).toFixed(2)}
                          </td>
                          <td />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
