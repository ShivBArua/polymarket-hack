"use client";

import { useState, useEffect, useCallback } from "react";
import clsx from "clsx";
import { ScannerEntry } from "@/types";
import { shortQuestion } from "@/lib/utils";

interface Props {
  onSelectCandidates: (entries: ScannerEntry[]) => void;
}

interface NewsArticle {
  title: string; link: string; source: string; pubDate: string; description?: string;
}

interface RelatedMarket {
  source: "Polymarket" | "Kalshi";
  question: string; yesPrice: number | null; similarity: number; url: string;
}

interface SentimentResult {
  probability: number | null;
  confidence: "low" | "medium" | "high";
  reasoning: string; keyFactor: string;
  articles: NewsArticle[]; marketDesc: string | null;
  model: string; error?: string;
}

interface ResearchData {
  sentiment: SentimentResult | null;
  related: { polymarket: RelatedMarket[]; kalshi: RelatedMarket[] } | null;
  loadingSentiment: boolean; loadingRelated: boolean;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function EdgeBar({ edge }: { edge: number }) {
  const pct = Math.min(100, (edge / 0.12) * 100);
  return (
    <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
      <div className="h-1 rounded-full transition-all" style={{ width: `${pct}%`, background: "var(--accent)" }} />
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const cls: Record<string, string> = {
    high:   "bg-emerald-50 text-emerald-700 border-emerald-200",
    medium: "bg-amber-50 text-amber-700 border-amber-200",
    low:    "bg-stone-100 text-stone-500 border-stone-200",
  };
  return (
    <span className={clsx("px-1.5 py-0.5 text-[10px] rounded border font-medium capitalize", cls[confidence] ?? cls.low)}>
      {confidence} confidence
    </span>
  );
}

function SectionLabel({ title, badge }: { title: string; badge: string }) {
  return (
    <div className="flex items-center gap-2 mb-2.5">
      <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
        {title}
      </span>
      <span className="px-1.5 py-0.5 text-[10px] rounded border font-mono"
        style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-subtle)" }}>
        {badge}
      </span>
    </div>
  );
}

function ResearchDrawer({ entry, data }: { entry: ScannerEntry; data: ResearchData }) {
  const { sentiment, related, loadingSentiment, loadingRelated } = data;
  const mid   = (entry.mid * 100).toFixed(1);
  const fairP = entry.fairP != null ? (entry.fairP * 100).toFixed(1) : null;
  const edge  = (entry.edge * 100).toFixed(1);

  return (
    <div className="border-t divide-y bg-white" style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      onClick={e => e.stopPropagation()}>

      {/* AI Analysis */}
      <div className="px-4 py-3.5">
        <SectionLabel title="AI Analysis" badge={sentiment?.model ?? "claude-sonnet-4-6"} />

        {loadingSentiment && (
          <div className="text-xs" style={{ color: "var(--text-subtle)" }}>Analysing…</div>
        )}
        {!loadingSentiment && sentiment?.error && (
          <p className="text-xs text-red-600">{sentiment.error}</p>
        )}
        {!loadingSentiment && sentiment && !sentiment.error && (
          <div className="space-y-2.5">
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold" style={{ color: "var(--text)" }}>
                {sentiment.probability != null ? `${(sentiment.probability * 100).toFixed(0)}%` : "—"}
              </span>
              <div className="flex-1">
                <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                  <div className="h-1.5 rounded-full" style={{
                    width: `${(sentiment.probability ?? 0) * 100}%`,
                    background: "var(--accent)",
                  }} />
                </div>
                <p className="text-[10px] mt-0.5" style={{ color: "var(--text-subtle)" }}>
                  Probability market resolves YES
                </p>
              </div>
              <ConfidenceBadge confidence={sentiment.confidence} />
            </div>
            <p className="text-xs leading-relaxed border-l-2 pl-2.5"
              style={{ color: "var(--text-muted)", borderColor: "var(--accent-border)" }}>
              {sentiment.reasoning}
            </p>
            {sentiment.keyFactor && (
              <div className="flex gap-1.5 text-xs">
                <span className="flex-shrink-0 font-medium" style={{ color: "var(--text-subtle)" }}>Key factor:</span>
                <span style={{ color: "var(--text-muted)" }}>{sentiment.keyFactor}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Web Sources */}
      <div className="px-4 py-3.5">
        <SectionLabel title="Web Sources" badge="Google News RSS" />

        {loadingSentiment && (
          <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Fetching articles…</p>
        )}
        {!loadingSentiment && sentiment?.marketDesc && (
          <div className="mb-2.5 p-2 rounded text-xs border"
            style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-muted)" }}>
            <span className="font-semibold" style={{ color: "var(--text-subtle)" }}>Resolution criteria: </span>
            {sentiment.marketDesc}
          </div>
        )}
        {!loadingSentiment && (!sentiment?.articles || sentiment.articles.length === 0) && (
          <p className="text-xs" style={{ color: "var(--text-subtle)" }}>No recent articles found.</p>
        )}
        {!loadingSentiment && sentiment?.articles && sentiment.articles.length > 0 && (
          <ul className="space-y-2.5">
            {sentiment.articles.map((a, i) => (
              <li key={i} className="text-xs flex gap-2">
                <span className="font-mono flex-shrink-0 mt-0.5" style={{ color: "var(--text-subtle)" }}>{i + 1}.</span>
                <div>
                  <a href={a.link} target="_blank" rel="noopener noreferrer"
                    className="font-medium underline underline-offset-2 leading-snug hover:opacity-70 transition-opacity"
                    style={{ color: "var(--accent)" }}>
                    {a.title}
                  </a>
                  <span className="ml-1.5" style={{ color: "var(--text-subtle)" }}>
                    {a.source} · {a.pubDate}
                  </span>
                  {a.description && (
                    <p className="mt-0.5 leading-relaxed" style={{ color: "var(--text-muted)" }}>
                      {a.description}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Statistical Model */}
      <div className="px-4 py-3.5">
        <SectionLabel title="Statistical Model" badge="Polymarket CLOB" />
        <div className="grid grid-cols-3 gap-2 mb-2">
          {[
            { label: "Mid price",    value: `${mid}¢`,              accent: false },
            { label: "Fair-P model", value: fairP ? `${fairP}¢` : "—", accent: false },
            { label: "Edge",         value: `+${edge}¢`,             accent: true  },
          ].map(({ label, value, accent }) => (
            <div key={label} className="rounded p-2 border"
              style={{
                background:   accent ? "var(--accent-bg)" : "var(--surface-2)",
                borderColor:  accent ? "var(--accent-border)" : "var(--border)",
              }}>
              <p className="text-[10px] mb-0.5" style={{ color: accent ? "var(--accent)" : "var(--text-subtle)" }}>
                {label}
              </p>
              <p className="font-mono font-bold text-sm" style={{ color: accent ? "var(--accent)" : "var(--text)" }}>
                {value}
              </p>
            </div>
          ))}
        </div>
        <p className="text-[10px] font-mono" style={{ color: "var(--text-subtle)" }}>
          edge = |fairP − mid|, capped 12¢ · signal: {entry.edgeSource ?? "spread"}
        </p>
      </div>

      {/* Related Markets */}
      <div className="px-4 py-3.5">
        <SectionLabel title="Related Markets" badge="Polymarket CSV + Kalshi API" />

        {loadingRelated && (
          <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Searching Polymarket and Kalshi…</p>
        )}
        {!loadingRelated && related && (() => {
          const all = [
            ...(related.polymarket ?? []).map(m => ({ ...m, src: "Polymarket" as const })),
            ...(related.kalshi ?? []).map(m => ({ ...m, src: "Kalshi" as const })),
          ];
          if (all.length === 0) return <p className="text-xs" style={{ color: "var(--text-subtle)" }}>No related markets found.</p>;
          return (
            <ul className="space-y-1.5">
              {all.map((m, i) => {
                const diff = m.yesPrice != null ? Math.abs(m.yesPrice - entry.mid * 100) : null;
                return (
                  <li key={i} className="flex gap-2 text-xs items-start">
                    <span className={clsx(
                      "px-1.5 py-0.5 text-[10px] rounded border font-medium flex-shrink-0 mt-0.5",
                      m.src === "Kalshi"
                        ? "bg-teal-50 text-teal-700 border-teal-200"
                        : "bg-blue-50 text-blue-700 border-blue-200"
                    )}>
                      {m.src}
                    </span>
                    <div className="flex-1 min-w-0">
                      <a href={m.url} target="_blank" rel="noopener noreferrer"
                        className="block truncate leading-snug hover:opacity-70 transition-opacity"
                        style={{ color: "var(--text)" }}>
                        {m.question}
                      </a>
                      <div className="flex gap-2 mt-0.5" style={{ color: "var(--text-subtle)" }}>
                        {m.yesPrice != null && <span>YES {m.yesPrice.toFixed(1)}¢</span>}
                        {diff != null && diff > 5 && (
                          <span className="text-amber-700 font-medium">
                            {diff.toFixed(1)}¢ diff vs Poly
                          </span>
                        )}
                        <span>sim {(m.similarity * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          );
        })()}
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

const URGENCY_BADGE: Record<string, string> = {
  critical: "text-red-600 border-red-200 bg-red-50",
  high:     "text-orange-600 border-orange-200 bg-orange-50",
  medium:   "text-amber-700 border-amber-200 bg-amber-50",
  low:      "text-stone-500 border-stone-200 bg-stone-50",
};

const URGENCY_DOT: Record<string, string> = {
  critical: "bg-red-500 animate-pulse",
  high:     "bg-orange-400",
  medium:   "bg-amber-400",
  low:      "bg-stone-300",
};

export function ScannerPanel({ onSelectCandidates }: Props) {
  const [entries, setEntries] = useState<ScannerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [filter, setFilter] = useState<"all" | "critical" | "high">("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [research, setResearch] = useState<Record<string, ResearchData>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/scanner?limit=30&minEdge=0.01");
      if (!res.ok) throw new Error("Scanner fetch failed");
      const data: ScannerEntry[] = await res.json();
      setEntries(data);
      setLastRefresh(new Date());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  // No auto-load on mount — user clicks Refresh to trigger the scan

  const loadResearch = useCallback(async (entry: ScannerEntry) => {
    const id = entry.id;
    setResearch(prev => ({ ...prev, [id]: { sentiment: null, related: null, loadingSentiment: true, loadingRelated: true } }));
    const [sentimentRes, relatedRes] = await Promise.allSettled([
      fetch(`/api/sentiment?q=${encodeURIComponent(entry.question)}&tokenId=${entry.id}`).then(r => r.json()),
      fetch(`/api/related?q=${encodeURIComponent(entry.question)}&id=${entry.id}`).then(r => r.json()),
    ]);
    setResearch(prev => ({
      ...prev,
      [id]: {
        sentiment: sentimentRes.status === "fulfilled" ? sentimentRes.value : { error: "Failed to load" } as any,
        related:   relatedRes.status === "fulfilled"   ? relatedRes.value   : null,
        loadingSentiment: false,
        loadingRelated:   false,
      },
    }));
  }, []);

  const toggleExpand = (entry: ScannerEntry) => {
    if (expanded === entry.id) { setExpanded(null); return; }
    setExpanded(entry.id);
    if (!research[entry.id]) loadResearch(entry);
  };

  const toggleSelect = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const filtered = entries.filter(e => {
    if (filter === "critical") return e.urgency === "critical";
    if (filter === "high")     return e.urgency === "critical" || e.urgency === "high";
    return true;
  });

  const selectedEntries = entries.filter(e => selected.has(e.id));

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg)" }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0 bg-white"
        style={{ borderColor: "var(--border)" }}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text)" }}>
            Market Scanner
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>
            Click any market to expand AI analysis · {entries.length} signals
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastRefresh && (
            <span className="text-xs" style={{ color: "var(--text-subtle)" }}>
              {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button onClick={load} disabled={loading}
            className="px-2.5 py-1 text-xs rounded border transition-colors disabled:opacity-40"
            style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-muted)" }}>
            {loading ? "Scanning…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-1.5 px-4 py-2 border-b flex-shrink-0 bg-white"
        style={{ borderColor: "var(--border)" }}>
        {(["all", "high", "critical"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className="px-2.5 py-1 text-xs rounded border transition-colors capitalize"
            style={filter === f
              ? { background: "var(--accent-bg)", borderColor: "var(--accent-border)", color: "var(--accent)" }
              : { background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-muted)" }
            }>
            {f === "all" ? "All signals" : f === "high" ? "≤7 days" : "≤1 day"}
          </button>
        ))}
        {selected.size > 0 && (
          <button onClick={() => onSelectCandidates(selectedEntries)}
            className="ml-auto px-3 py-1 text-xs rounded text-white font-semibold transition-colors hover:opacity-90"
            style={{ background: "var(--accent)" }}>
            Optimize {selected.size} selected →
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading && entries.length === 0 && (
          <div className="flex items-center justify-center h-32 text-xs" style={{ color: "var(--text-subtle)" }}>
            Scanning markets…
          </div>
        )}
        {!loading && entries.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-xs" style={{ color: "var(--text-subtle)" }}>
            <span>Click <strong>Refresh</strong> to scan for edge opportunities</span>
          </div>
        )}
        {!loading && entries.length > 0 && filtered.length === 0 && (
          <div className="flex items-center justify-center h-32 text-xs" style={{ color: "var(--text-subtle)" }}>
            No signals match current filter
          </div>
        )}

        {filtered.map(entry => {
          const isExpanded = expanded === entry.id;
          const rd = research[entry.id];
          return (
            <div key={entry.id} className="border-b" style={{ borderColor: "var(--border)" }}>
              <div
                onClick={() => toggleExpand(entry)}
                className="px-4 py-3 cursor-pointer transition-colors select-none border-l-2"
                style={{
                  borderLeftColor: isExpanded
                    ? "var(--accent)"
                    : selected.has(entry.id) ? "var(--accent-border)" : "transparent",
                  background: isExpanded
                    ? "var(--accent-bg)"
                    : selected.has(entry.id) ? "var(--accent-bg)" : "white",
                }}
              >
                <div className="flex items-start gap-2 mb-1.5">
                  <span className={clsx("mt-1 flex-shrink-0 w-2 h-2 rounded-full", URGENCY_DOT[entry.urgency])} />
                  <p className="text-xs leading-snug flex-1" style={{ color: "var(--text)" }}>
                    {shortQuestion(entry.question, 80)}
                  </p>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button onClick={e => toggleSelect(e, entry.id)}
                      className="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors"
                      style={selected.has(entry.id)
                        ? { background: "var(--accent)", borderColor: "var(--accent)", color: "white" }
                        : { borderColor: "var(--border-strong)", background: "white" }
                      }>
                      {selected.has(entry.id) && (
                        <svg width="8" height="8" viewBox="0 0 10 10" fill="currentColor">
                          <path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                        </svg>
                      )}
                    </button>
                    <span className="text-[10px]" style={{ color: "var(--text-subtle)" }}>
                      {isExpanded ? "▲" : "▼"}
                    </span>
                  </div>
                </div>

                <div className="mb-1.5 ml-4">
                  <EdgeBar edge={entry.edge} />
                </div>

                <div className="flex items-center gap-2 ml-4 flex-wrap">
                  <span className={clsx(
                    "px-1.5 py-0.5 rounded border text-[10px] font-bold",
                    entry.direction === "YES" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                              : "bg-red-50 text-red-600 border-red-200"
                  )}>
                    {entry.direction}
                  </span>
                  <span className={clsx(
                    "px-1.5 py-0.5 rounded border text-[10px] font-medium",
                    URGENCY_BADGE[entry.urgency]
                  )}>
                    {entry.daysToResolution != null
                      ? entry.daysToResolution < 1 ? "<1d" : `${Math.round(entry.daysToResolution)}d`
                      : "—"}
                  </span>
                  <span className="text-[10px]" style={{ color: "var(--text-subtle)" }}>
                    mid {(entry.mid * 100).toFixed(1)}%
                  </span>
                  <span className="text-[10px]" style={{ color: "var(--text-subtle)" }}>
                    spread {(entry.spread * 100).toFixed(1)}%
                  </span>
                  <span className="text-[10px] font-semibold ml-auto" style={{ color: "var(--accent)" }}>
                    edge +{(entry.edge * 100).toFixed(1)}¢
                  </span>
                </div>

                {!isExpanded && (
                  <p className="text-[10px] ml-4 mt-1" style={{ color: "var(--text-subtle)" }}>
                    Expand to view AI analysis and news
                  </p>
                )}
              </div>

              {isExpanded && rd && <ResearchDrawer entry={entry} data={rd} />}
              {isExpanded && !rd && (
                <div className="px-4 py-3 text-xs" style={{ color: "var(--text-subtle)", background: "var(--surface-2)" }}>
                  Loading research…
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      {entries.length > 0 && (
        <div className="px-4 py-2.5 border-t flex-shrink-0 flex justify-between text-xs bg-white"
          style={{ borderColor: "var(--border)", color: "var(--text-subtle)" }}>
          <span>Critical: <span className="text-red-600 font-medium">{entries.filter(e => e.urgency === "critical").length}</span></span>
          <span>High: <span className="text-orange-600 font-medium">{entries.filter(e => e.urgency === "high").length}</span></span>
          <span>Avg edge: <span className="font-medium" style={{ color: "var(--accent)" }}>
            {((entries.reduce((s, e) => s + e.edge, 0) / entries.length) * 100).toFixed(1)}¢
          </span></span>
        </div>
      )}
    </div>
  );
}
