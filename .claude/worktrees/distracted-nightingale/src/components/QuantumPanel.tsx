"use client";

import { useState, useCallback } from "react";
import clsx from "clsx";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from "recharts";
import { ScannerEntry, QUBOResult } from "@/types";
import { shortQuestion } from "@/lib/utils";

interface Props {
  candidates: ScannerEntry[];
  onClear: () => void;
}

// ── Correlation heat-cell colour ──────────────────────────────────────────────

function heatBg(v: number, isdiag: boolean): string {
  if (isdiag) return "bg-indigo-500/50";
  if (v < 0.05) return "bg-zinc-800";
  if (v < 0.2) return "bg-blue-900/60";
  if (v < 0.4) return "bg-blue-700/70";
  if (v < 0.6) return "bg-blue-600";
  return "bg-blue-400";
}

// ── Bar-chart tooltip ─────────────────────────────────────────────────────────

function BarTip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded p-2 text-xs max-w-56">
      <p className="text-zinc-300 mb-0.5 leading-snug">{shortQuestion(d.question, 55)}</p>
      <p className="text-indigo-400 font-semibold">Edge +{(d.edge * 100).toFixed(1)}%</p>
      <p className="text-zinc-500">{d.direction} · mid {(d.mid * 100).toFixed(1)}%</p>
    </div>
  );
}

export function QuantumPanel({ candidates, onClear }: Props) {
  const [lambda, setLambda] = useState(0.5);
  const [maxPositions, setMaxPositions] = useState(5);
  const [result, setResult] = useState<QUBOResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runOptimizer = useCallback(async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/quantum", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidates, lambda, maxPositions }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Optimizer failed");
      }
      setResult(await res.json());
    } catch (e: any) {
      setError(e.message ?? "Unknown error");
    } finally {
      setRunning(false);
    }
  }, [candidates, lambda, maxPositions]);

  const chartData = candidates.map((c) => ({
    question: c.question,
    edge: c.edge,
    mid: c.mid,
    direction: c.direction,
    selected: result?.selected.some((s) => s.id === c.id) ?? false,
  }));

  // correlation threshold derived from lambda (mirrors the server logic)
  const corrThreshold = Math.max(0.05, 1 - lambda).toFixed(2);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 flex-shrink-0">
        <div>
          <p className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
            Portfolio Optimizer
          </p>
          <p className="text-xs text-zinc-600 mt-0.5">
            Greedy edge-maximisation · {candidates.length} candidates loaded
          </p>
        </div>
        <button
          onClick={onClear}
          className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          ← clear
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Controls */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
            <label className="text-xs text-zinc-500 block mb-2">
              De-correlation strength λ ={" "}
              <span className="text-indigo-400 font-semibold">{lambda.toFixed(2)}</span>
              <span className="text-zinc-600 ml-1">(corr threshold {corrThreshold})</span>
            </label>
            <input
              type="range" min={0} max={0.95} step={0.05}
              value={lambda}
              onChange={(e) => setLambda(parseFloat(e.target.value))}
              className="w-full accent-indigo-500"
            />
            <div className="flex justify-between text-[10px] text-zinc-600 mt-1">
              <span>0 — pure edge</span>
              <span>0.95 — max diversity</span>
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
            <label className="text-xs text-zinc-500 block mb-2">
              Max positions ={" "}
              <span className="text-indigo-400 font-semibold">{maxPositions}</span>
            </label>
            <input
              type="range" min={1} max={Math.min(10, candidates.length)} step={1}
              value={maxPositions}
              onChange={(e) => setMaxPositions(parseInt(e.target.value))}
              className="w-full accent-indigo-500"
            />
            <div className="flex justify-between text-[10px] text-zinc-600 mt-1">
              <span>1</span>
              <span>{Math.min(10, candidates.length)}</span>
            </div>
          </div>
        </div>

        {/* Objective summary */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 py-2">
          <p className="text-[10px] text-zinc-600 font-mono">
            Objective: max ∑ edge_i·x_i &nbsp;s.t.&nbsp; corr(i,j) &lt; {corrThreshold} for selected pairs,&nbsp;
            ∑ x_i ≤ {maxPositions}
          </p>
        </div>

        {/* Run button */}
        <button
          onClick={runOptimizer}
          disabled={running || candidates.length === 0}
          className={clsx(
            "w-full py-2.5 rounded-lg text-sm font-semibold transition-all",
            running
              ? "bg-indigo-700/40 text-indigo-400 cursor-not-allowed"
              : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/30"
          )}
        >
          {running ? "Running optimizer…" : "Run Portfolio Optimizer"}
        </button>

        {error && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
            {error}
          </p>
        )}

        {result && (
          <>
            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Selected", value: `${result.selected.length} / ${candidates.length}`, color: "text-indigo-400" },
                { label: "Total Edge", value: `+${(result.totalEdge * 100).toFixed(1)}%`, color: "text-green-400" },
                { label: "Pairwise Corr.", value: result.totalRisk.toFixed(3), color: result.totalRisk > 0.3 ? "text-yellow-400" : "text-zinc-300" },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-center">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">{label}</p>
                  <p className={clsx("text-sm font-bold", color)}>{value}</p>
                </div>
              ))}
            </div>

            {/* Edge bar chart */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
              <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">
                Edge per trade — selected <span className="text-indigo-400">■</span> vs rejected <span className="text-zinc-500">■</span>
              </p>
              <div className="h-28">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} barCategoryGap="20%">
                    <XAxis dataKey="question" hide />
                    <YAxis
                      tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                      tick={{ fontSize: 9, fill: "#71717a" }}
                      width={32}
                    />
                    <Tooltip content={<BarTip />} />
                    <Bar dataKey="edge" radius={[2, 2, 0, 0]}>
                      {chartData.map((d, i) => (
                        <Cell key={i} fill={d.selected ? "#6366f1" : "#3f3f46"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Correlation heatmap */}
            {candidates.length <= 20 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">
                  Market Correlation Matrix (keyword overlap)
                </p>
                <div
                  className="grid gap-0.5"
                  style={{ gridTemplateColumns: `repeat(${candidates.length}, minmax(0, 1fr))` }}
                >
                  {result.correlationMatrix.map((row, i) =>
                    row.map((val, j) => (
                      <div
                        key={`${i}-${j}`}
                        title={`${shortQuestion(candidates[i].question, 35)} ↔ ${shortQuestion(candidates[j].question, 35)}: ${val.toFixed(2)}`}
                        className={clsx(
                          "aspect-square rounded-[2px]",
                          heatBg(val, i === j)
                        )}
                      />
                    ))
                  )}
                </div>
                <p className="text-[10px] text-zinc-600 mt-1.5">
                  Brighter = higher topic overlap · hover cell for details
                </p>
              </div>
            )}

            {/* Selected trades */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
              <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">
                Optimal Portfolio ({result.selected.length} positions)
              </p>
              {result.selected.length === 0 ? (
                <p className="text-xs text-zinc-600">No trades selected — try lowering λ</p>
              ) : (
                <div className="space-y-1.5">
                  {result.selected.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center gap-2 py-1.5 px-2 bg-indigo-500/5 border border-indigo-500/20 rounded"
                    >
                      <span className={clsx(
                        "px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0",
                        entry.direction === "YES" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                      )}>
                        {entry.direction}
                      </span>
                      <p className="text-xs text-zinc-300 flex-1 leading-snug">
                        {shortQuestion(entry.question, 65)}
                      </p>
                      <span className="text-[10px] text-indigo-400 font-semibold flex-shrink-0">
                        +{(entry.edge * 100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <p className="text-[10px] text-zinc-700 text-center">
              Greedy de-correlated selection · objective H = {result.finalEnergy.toFixed(4)}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
