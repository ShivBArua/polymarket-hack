"use client";

import { useState, useCallback } from "react";
import clsx from "clsx";
import { ScannerEntry, QUBOResult } from "@/types";
import { shortQuestion } from "@/lib/utils";

interface Props {
  candidates: ScannerEntry[];
  onClear: () => void;
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border p-2.5 text-center"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--text-subtle)" }}>{label}</p>
      <p className="text-sm font-bold" style={{ color: accent ? "var(--accent)" : "var(--text)" }}>{value}</p>
    </div>
  );
}

function SliderRow({
  label, valueFmt, min, max, step, value, onChange, subLeft, subRight,
}: {
  label: string;
  valueFmt: React.ReactNode;
  min: number; max: number; step: number; value: number;
  onChange: (v: number) => void;
  subLeft: string; subRight: string;
}) {
  return (
    <div className="rounded-lg border p-3"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <label className="text-xs block mb-2" style={{ color: "var(--text-muted)" }}>
        {label} = {valueFmt}
      </label>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full" style={{ accentColor: "var(--accent)" }} />
      <div className="flex justify-between text-[10px] mt-1" style={{ color: "var(--text-subtle)" }}>
        <span>{subLeft}</span><span>{subRight}</span>
      </div>
    </div>
  );
}

export function QuantumPanel({ candidates, onClear }: Props) {
  const [corrLambda, setCorrLambda] = useState(0.05);
  const [riskLambda, setRiskLambda] = useState(0.08);
  const [bankroll, setBankroll] = useState(200);
  const [maxPositions, setMaxPositions] = useState(5);
  const [result, setResult] = useState<QUBOResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runOptimizer = useCallback(async () => {
    setRunning(true); setError(null); setResult(null);
    try {
      const res = await fetch("/api/quantum", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidates,
          lambda: corrLambda,
          maxPositions,
          riskLambda,
          bankroll,
        }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error ?? "Optimizer failed"); }
      setResult(await res.json());
    } catch (e: any) { setError(e.message ?? "Unknown error"); }
    finally { setRunning(false); }
  }, [candidates, corrLambda, riskLambda, bankroll, maxPositions]);

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: "var(--bg)" }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0 bg-white"
        style={{ borderColor: "var(--border)" }}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text)" }}>
            QUBO Portfolio Optimizer
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>
            Simulated Annealing · {candidates.length} candidates loaded
          </p>
        </div>
        <button onClick={onClear} className="text-xs transition-colors hover:opacity-70"
          style={{ color: "var(--text-muted)" }}>
          Clear
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">

        {/* Controls — row 1 */}
        <div className="grid grid-cols-2 gap-3">
          <SliderRow
            label="Correlation penalty λ_corr"
            valueFmt={<span style={{ color: "var(--accent)" }} className="font-semibold">{corrLambda.toFixed(3)}</span>}
            min={0} max={0.30} step={0.005} value={corrLambda}
            onChange={setCorrLambda}
            subLeft="0 — ignore overlap" subRight="0.30 — avoid all"
          />
          <SliderRow
            label="Risk penalty λ_risk"
            valueFmt={<span style={{ color: "var(--accent)" }} className="font-semibold">{riskLambda.toFixed(3)}</span>}
            min={0} max={0.30} step={0.005} value={riskLambda}
            onChange={setRiskLambda}
            subLeft="0 — ignore spread" subRight="0.30 — avoid wide"
          />
        </div>

        {/* Controls — row 2 */}
        <div className="grid grid-cols-2 gap-3">
          <SliderRow
            label="Bankroll"
            valueFmt={<span style={{ color: "var(--accent)" }} className="font-semibold">${bankroll}</span>}
            min={25} max={500} step={25} value={bankroll}
            onChange={setBankroll}
            subLeft="$25" subRight="$500"
          />
          <SliderRow
            label="Max positions"
            valueFmt={<span style={{ color: "var(--accent)" }} className="font-semibold">{maxPositions}</span>}
            min={1} max={Math.min(10, Math.max(1, candidates.length))} step={1} value={maxPositions}
            onChange={setMaxPositions}
            subLeft="1" subRight={String(Math.min(10, Math.max(1, candidates.length)))}
          />
        </div>

        {/* QUBO objective */}
        <div className="rounded-lg border px-3 py-2"
          style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}>
          <p className="text-[10px] font-mono leading-relaxed" style={{ color: "var(--text-subtle)" }}>
            H(x) = −∑ edge&#x2093;·x&#x2093;
            &nbsp;+&nbsp; {riskLambda.toFixed(3)}·∑ risk&#x2093;·x&#x2093;
            &nbsp;+&nbsp; {corrLambda.toFixed(3)}·∑&#x1D62;&#x2C7C; corr&#x1D62;&#x2C7C;·x&#x2093;·x&#x2C7C;
            <br />
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+&nbsp; 10·(∑ size&#x2093;·x&#x2093; − ${bankroll})²₊
            &nbsp;+&nbsp; 10·(∑ x&#x2093; − {maxPositions})²₊
          </p>
        </div>

        {/* Run button */}
        <button onClick={runOptimizer} disabled={running || candidates.length === 0}
          className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all text-white hover:opacity-90 disabled:opacity-40"
          style={{ background: "var(--accent)" }}>
          {running ? "Running SA-QUBO…" : "Run QUBO Optimizer"}
        </button>

        {error && (
          <p className="text-xs rounded-lg border p-3 text-red-700 bg-red-50 border-red-200">{error}</p>
        )}

        {result && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-4 gap-2">
              <Stat label="Selected" value={`${result.selected.length} / ${candidates.length}`} accent />
              <Stat label="Total Edge" value={`+${(result.totalEdge * 100).toFixed(1)}%`} accent />
              <Stat label="Corr Risk" value={`${(result.totalRisk * 100).toFixed(0)}%`} />
              <Stat label="SA Iters" value={result.iterations.toLocaleString()} />
            </div>

            {/* Correlation overlap table */}
            {candidates.length <= 20 && (() => {
              const pairs: { i: number; j: number; val: number }[] = [];
              result.correlationMatrix.forEach((row, i) =>
                row.forEach((val, j) => {
                  if (j > i && val >= 0.05) pairs.push({ i, j, val });
                })
              );
              pairs.sort((a, b) => b.val - a.val);

              return (
                <div className="rounded-lg border overflow-hidden" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                  <div className="px-3 py-2.5 border-b flex items-center justify-between"
                    style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                      Topic Overlap Between Markets
                    </p>
                    <p className="text-[10px]" style={{ color: "var(--text-subtle)" }}>
                      Pairs with shared keywords
                    </p>
                  </div>
                  {pairs.length === 0 ? (
                    <p className="text-xs px-3 py-3" style={{ color: "var(--text-subtle)" }}>
                      No significant topic overlap — all candidates cover different subjects.
                    </p>
                  ) : (
                    <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                      {pairs.slice(0, 8).map(({ i, j, val }) => {
                        const pct = Math.round(val * 100);
                        const high = val >= 0.3;
                        const med  = val >= 0.15;
                        const iSel = result.selected.some(s => s.id === candidates[i].id);
                        const jSel = result.selected.some(s => s.id === candidates[j].id);
                        return (
                          <div key={`${i}-${j}`} className="px-3 py-2.5">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className={clsx(
                                "text-[10px] px-1.5 py-0.5 rounded border font-medium flex-shrink-0",
                                iSel ? "bg-[var(--accent-bg)] text-[var(--accent)] border-[var(--accent-border)]"
                                     : "border-[var(--border)] text-[var(--text-subtle)]"
                              )} style={!iSel ? { background: "var(--surface-2)" } : {}}>
                                {iSel ? "✓ IN" : "✗ OUT"}
                              </span>
                              <p className="text-xs leading-snug flex-1 truncate" style={{ color: "var(--text)" }}>
                                {shortQuestion(candidates[i].question, 50)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 mb-2">
                              <span className={clsx(
                                "text-[10px] px-1.5 py-0.5 rounded border font-medium flex-shrink-0",
                                jSel ? "bg-[var(--accent-bg)] text-[var(--accent)] border-[var(--accent-border)]"
                                     : "border-[var(--border)] text-[var(--text-subtle)]"
                              )} style={!jSel ? { background: "var(--surface-2)" } : {}}>
                                {jSel ? "✓ IN" : "✗ OUT"}
                              </span>
                              <p className="text-xs leading-snug flex-1 truncate" style={{ color: "var(--text)" }}>
                                {shortQuestion(candidates[j].question, 50)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 ml-0.5">
                              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                                <div className="h-1.5 rounded-full transition-all"
                                  style={{
                                    width: `${pct}%`,
                                    background: high ? "#ef4444" : med ? "#f59e0b" : "var(--border-strong)",
                                  }} />
                              </div>
                              <span className={clsx(
                                "text-[10px] font-semibold tabular-nums flex-shrink-0",
                                high ? "text-red-500" : med ? "text-amber-600" : ""
                              )} style={!high && !med ? { color: "var(--text-subtle)" } : {}}>
                                {pct}% overlap
                              </span>
                              {(!iSel || !jSel) && high && (
                                <span className="text-[10px] text-red-500 flex-shrink-0">one excluded</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Portfolio */}
            <div className="rounded-lg border p-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
              <p className="text-[10px] uppercase tracking-wider mb-2.5" style={{ color: "var(--text-subtle)" }}>
                Optimal Portfolio ({result.selected.length} positions)
              </p>
              {result.selected.length === 0 ? (
                <p className="text-xs" style={{ color: "var(--text-subtle)" }}>No trades selected — try lowering λ_corr or increasing bankroll</p>
              ) : (
                <div className="space-y-1.5">
                  {result.selected.map(entry => (
                    <div key={entry.id} className="flex items-center gap-2 py-1.5 px-2 rounded border"
                      style={{ background: "var(--accent-bg)", borderColor: "var(--accent-border)" }}>
                      <span className={clsx(
                        "px-1.5 py-0.5 rounded border text-[10px] font-bold flex-shrink-0",
                        entry.direction === "YES" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                                  : "bg-red-50 text-red-600 border-red-200"
                      )}>
                        {entry.direction}
                      </span>
                      <p className="text-xs flex-1 leading-snug" style={{ color: "var(--text)" }}>
                        {shortQuestion(entry.question, 65)}
                      </p>
                      <span className="text-[10px] font-semibold flex-shrink-0" style={{ color: "var(--accent)" }}>
                        +{(entry.edge * 100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <p className="text-[10px] text-center" style={{ color: "var(--text-subtle)" }}>
              SA-QUBO · {SA_RESTARTS_DISPLAY} restarts · H = {result.finalEnergy.toFixed(4)}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

const SA_RESTARTS_DISPLAY = 5;
