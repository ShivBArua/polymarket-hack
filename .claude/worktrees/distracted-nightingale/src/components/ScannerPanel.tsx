"use client";

import { useState, useEffect, useCallback } from "react";
import clsx from "clsx";
import { ScannerEntry } from "@/types";
import { shortQuestion } from "@/lib/utils";

interface Props {
  onSelectCandidates: (entries: ScannerEntry[]) => void;
}

const URGENCY_COLOR: Record<string, string> = {
  critical: "text-red-400 border-red-500/50 bg-red-500/10",
  high: "text-orange-400 border-orange-500/50 bg-orange-500/10",
  medium: "text-yellow-400 border-yellow-500/50 bg-yellow-500/10",
  low: "text-zinc-400 border-zinc-600 bg-zinc-800",
};

const URGENCY_DOT: Record<string, string> = {
  critical: "bg-red-400 animate-pulse",
  high: "bg-orange-400",
  medium: "bg-yellow-400",
  low: "bg-zinc-500",
};

function EdgeBar({ edge }: { edge: number }) {
  const pct = Math.min(100, edge * 500); // 20% edge = full bar
  return (
    <div className="w-full h-1 bg-zinc-700 rounded-full overflow-hidden">
      <div
        className="h-1 rounded-full bg-indigo-500 transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function ScannerPanel({ onSelectCandidates }: Props) {
  const [entries, setEntries] = useState<ScannerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [filter, setFilter] = useState<"all" | "critical" | "high">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/scanner?limit=30&minEdge=0.01");
      if (!res.ok) throw new Error("Scanner fetch failed");
      const data: ScannerEntry[] = await res.json();
      setEntries(data);
      setLastRefresh(new Date());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = entries.filter((e) => {
    if (filter === "all") return true;
    if (filter === "critical") return e.urgency === "critical";
    if (filter === "high") return e.urgency === "critical" || e.urgency === "high";
    return true;
  });

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedEntries = entries.filter((e) => selected.has(e.id));

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 flex-shrink-0">
        <div>
          <p className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
            Market Scanner
          </p>
          <p className="text-xs text-zinc-600 mt-0.5">
            Low-latency edge detection — {entries.length} signals
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastRefresh && (
            <span className="text-xs text-zinc-600">
              {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="px-2.5 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-md transition-colors disabled:opacity-40"
          >
            {loading ? "Scanning…" : "⟳ Refresh"}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-1 px-4 py-2 border-b border-zinc-800 flex-shrink-0">
        {(["all", "high", "critical"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={clsx(
              "px-2.5 py-1 text-xs rounded-md border transition-colors capitalize",
              filter === f
                ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/40"
                : "bg-zinc-800 text-zinc-500 border-zinc-700 hover:border-zinc-600"
            )}
          >
            {f === "all" ? "All signals" : f === "high" ? "≤7 days" : "≤1 day"}
          </button>
        ))}
        {selected.size > 0 && (
          <button
            onClick={() => onSelectCandidates(selectedEntries)}
            className="ml-auto px-3 py-1 text-xs rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors"
          >
            Optimize {selected.size} selected →
          </button>
        )}
      </div>

      {/* Signal list */}
      <div className="flex-1 overflow-y-auto">
        {loading && entries.length === 0 && (
          <div className="flex items-center justify-center h-32 text-xs text-zinc-600">
            Scanning 42k+ markets…
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="flex items-center justify-center h-32 text-xs text-zinc-600">
            No signals match current filter
          </div>
        )}

        {filtered.map((entry) => (
          <div
            key={entry.id}
            onClick={() => toggleSelect(entry.id)}
            className={clsx(
              "px-4 py-3 border-b border-zinc-800/60 cursor-pointer transition-colors select-none",
              selected.has(entry.id)
                ? "bg-indigo-500/10 border-l-2 border-l-indigo-500"
                : "hover:bg-zinc-800/40 border-l-2 border-l-transparent"
            )}
          >
            {/* Market question */}
            <div className="flex items-start gap-2 mb-1.5">
              <span
                className={clsx(
                  "mt-0.5 flex-shrink-0 w-2 h-2 rounded-full",
                  URGENCY_DOT[entry.urgency]
                )}
              />
              <p className="text-xs text-zinc-200 leading-snug">
                {shortQuestion(entry.question, 80)}
              </p>
            </div>

            {/* Edge bar */}
            <div className="mb-1.5 ml-4">
              <EdgeBar edge={entry.edge} />
            </div>

            {/* Metrics row */}
            <div className="flex items-center gap-2 ml-4 flex-wrap">
              {/* Direction badge */}
              <span
                className={clsx(
                  "px-1.5 py-0.5 rounded text-[10px] font-bold",
                  entry.direction === "YES"
                    ? "bg-green-500/20 text-green-400"
                    : "bg-red-500/20 text-red-400"
                )}
              >
                {entry.direction}
              </span>

              {/* Urgency badge */}
              <span
                className={clsx(
                  "px-1.5 py-0.5 rounded border text-[10px] font-medium capitalize",
                  URGENCY_COLOR[entry.urgency]
                )}
              >
                {entry.daysToResolution !== null
                  ? entry.daysToResolution < 1
                    ? `&lt;1d`
                    : `${Math.round(entry.daysToResolution)}d`
                  : "—"}
              </span>

              <span className="text-[10px] text-zinc-500">
                mid {(entry.mid * 100).toFixed(1)}%
              </span>
              <span className="text-[10px] text-zinc-500">
                spread {(entry.spread * 100).toFixed(1)}%
              </span>
              <span className="text-[10px] text-indigo-400 font-semibold ml-auto">
                edge +{(entry.edge * 100).toFixed(1)}%
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Footer summary */}
      {entries.length > 0 && (
        <div className="px-4 py-2.5 border-t border-zinc-800 flex-shrink-0 flex justify-between text-xs text-zinc-500">
          <span>
            Critical:{" "}
            <span className="text-red-400 font-medium">
              {entries.filter((e) => e.urgency === "critical").length}
            </span>
          </span>
          <span>
            High:{" "}
            <span className="text-orange-400 font-medium">
              {entries.filter((e) => e.urgency === "high").length}
            </span>
          </span>
          <span>
            Avg edge:{" "}
            <span className="text-indigo-400 font-medium">
              {(
                (entries.reduce((s, e) => s + e.edge, 0) / entries.length) *
                100
              ).toFixed(1)}
              %
            </span>
          </span>
        </div>
      )}
    </div>
  );
}
