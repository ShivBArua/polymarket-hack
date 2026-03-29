"use client";

import { useState, useCallback } from "react";
import clsx from "clsx";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  CartesianGrid, ReferenceLine,
} from "recharts";
import { BacktestResult, BacktestTrade } from "@/types";
import { shortQuestion } from "@/lib/utils";

interface OptimizeResult {
  entryDays: number; minEdge: number; minTrendSignal: number;
  trades: number; totalPnl: number; winRate: number; sharpe: number; maxDrawdown: number;
}

interface OptimizeResponse {
  best: OptimizeResult | null; results: OptimizeResult[];
  totalCombinations: number; validCombinations: number; marketsUsed: number;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, positive }: {
  label: string; value: string; sub?: string; positive?: boolean;
}) {
  return (
    <div className="rounded-lg border p-3 text-center"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--text-subtle)" }}>{label}</p>
      <p className={clsx("text-lg font-bold",
        positive === true  ? "text-emerald-700" :
        positive === false ? "text-red-600"     : ""
      )} style={positive === undefined ? { color: "var(--text)" } : {}}>
        {value}
      </p>
      {sub && <p className="text-[10px] mt-0.5" style={{ color: "var(--text-subtle)" }}>{sub}</p>}
    </div>
  );
}

function CurveTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const v: number = payload[0].value;
  return (
    <div className="rounded border p-2 text-xs shadow-sm"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <p className="mb-0.5" style={{ color: "var(--text-subtle)" }}>{label}</p>
      <p className={v >= 0 ? "text-emerald-700 font-semibold" : "text-red-600 font-semibold"}>
        {v >= 0 ? "+" : ""}${v.toFixed(2)}
      </p>
    </div>
  );
}

function TradeRow({ t }: { t: BacktestTrade }) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-2 items-center px-3 py-2 border-b text-xs transition-colors hover:bg-stone-50"
      style={{ borderColor: "var(--border)" }}>
      <p className="leading-snug truncate" style={{ color: "var(--text)" }}>{shortQuestion(t.question, 55)}</p>
      <span className={clsx("px-1.5 py-0.5 rounded border text-[10px] font-bold flex-shrink-0",
        t.direction === "YES" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-red-50 text-red-600 border-red-200")}>
        {t.direction}
      </span>
      <span className="flex-shrink-0" style={{ color: "var(--text-muted)" }}>{(t.entryPrice * 100).toFixed(1)}¢</span>
      <span className={clsx("font-semibold flex-shrink-0", t.won ? "text-emerald-700" : "text-red-600")}>
        {t.pnl >= 0 ? "+" : ""}${t.pnl.toFixed(2)}
      </span>
      {t.aiProbability != null && (
        <span className="text-[10px] flex-shrink-0" style={{ color: "var(--accent)" }}>
          AI {(t.aiProbability * 100).toFixed(0)}%
        </span>
      )}
      <span className={clsx("text-[10px] flex-shrink-0 font-medium", t.won ? "text-emerald-600" : "text-stone-400")}>
        {t.won ? "WIN" : "LOSS"}
      </span>
    </div>
  );
}

function OptRow({ r, rank, onApply, isApplied }: {
  r: OptimizeResult; rank: number; onApply: (r: OptimizeResult) => void; isApplied: boolean;
}) {
  const sharpeColor = r.sharpe >= 2 ? "text-emerald-700" : r.sharpe >= 1 ? "text-amber-700" : "text-stone-500";
  return (
    <tr className={clsx("border-b text-xs transition-colors", isApplied ? "bg-[var(--accent-bg)]" : "hover:bg-stone-50")}
      style={{ borderColor: "var(--border)" }}>
      <td className="px-2 py-1.5 font-mono" style={{ color: "var(--text-subtle)" }}>#{rank}</td>
      <td className="px-2 py-1.5 font-mono" style={{ color: "var(--text)" }}>{r.entryDays}d</td>
      <td className="px-2 py-1.5 font-mono" style={{ color: "var(--text)" }}>{(r.minEdge * 100).toFixed(0)}%</td>
      <td className="px-2 py-1.5 font-mono" style={{ color: "var(--text)" }}>{r.minTrendSignal.toFixed(4)}</td>
      <td className="px-2 py-1.5" style={{ color: "var(--text-muted)" }}>{r.trades}</td>
      <td className={clsx("px-2 py-1.5 font-semibold", sharpeColor)}>{r.sharpe.toFixed(2)}</td>
      <td className="px-2 py-1.5" style={{ color: "var(--text-muted)" }}>{(r.winRate * 100).toFixed(0)}%</td>
      <td className={clsx("px-2 py-1.5 font-semibold", r.totalPnl >= 0 ? "text-emerald-700" : "text-red-600")}>
        {r.totalPnl >= 0 ? "+" : ""}${r.totalPnl.toFixed(2)}
      </td>
      <td className="px-2 py-1.5" style={{ color: "var(--text-subtle)" }}>{(r.maxDrawdown * 100).toFixed(0)}%</td>
      <td className="px-2 py-1.5">
        <button onClick={() => onApply(r)}
          className={clsx("px-2 py-0.5 rounded border text-[10px] font-semibold transition-colors",
            isApplied ? "border-[var(--accent-border)] text-[var(--accent)]"
                      : "border-stone-200 text-stone-600 hover:border-[var(--accent-border)] hover:text-[var(--accent)]"
          )}
          style={isApplied ? { background: "var(--accent-bg)" } : { background: "var(--surface-2)" }}>
          {isApplied ? "Applied" : "Use"}
        </button>
      </td>
    </tr>
  );
}

function SliderField({ label, value, displayValue, min, max, step, onChange, bounds }: {
  label: string; value: number; displayValue: string;
  min: number; max: number; step: number; onChange: (v: number) => void;
  bounds: [string, string];
}) {
  return (
    <div>
      <label className="text-xs block mb-1.5" style={{ color: "var(--text-muted)" }}>
        {label}: <span className="font-semibold" style={{ color: "var(--accent)" }}>{displayValue}</span>
      </label>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full" style={{ accentColor: "var(--accent)" }} />
      <div className="flex justify-between text-[10px] mt-0.5" style={{ color: "var(--text-subtle)" }}>
        <span>{bounds[0]}</span><span>{bounds[1]}</span>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function BacktestPanel() {
  const [entryDays,  setEntryDays]  = useState(14);
  const [sizeUsdc,   setSizeUsdc]   = useState(10);
  const [minEdge,    setMinEdge]    = useState(0.03);
  const [minTrend,   setMinTrend]   = useState(0.001);
  const [maxMarkets, setMaxMarkets] = useState(40);
  const [useAI,      setUseAI]      = useState(false);

  const [result,  setResult]  = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const [optResult,  setOptResult]  = useState<OptimizeResponse | null>(null);
  const [optLoading, setOptLoading] = useState(false);
  const [optError,   setOptError]   = useState<string | null>(null);
  const [appliedIdx, setAppliedIdx] = useState<number | null>(null);
  const [showOpt,    setShowOpt]    = useState(false);

  const run = useCallback(async () => {
    setLoading(true); setError(null); setResult(null);
    try {
      const qs = new URLSearchParams({
        entryDays: String(entryDays), sizeUsdc: String(sizeUsdc),
        minEdge: String(minEdge), minTrendSignal: String(minTrend),
        maxMarkets: String(maxMarkets), useAI: String(useAI),
      });
      const res  = await fetch(`/api/backtest?${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Backtest failed");
      setResult(data);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [entryDays, sizeUsdc, minEdge, minTrend, maxMarkets, useAI]);

  const runOptimize = useCallback(async () => {
    setOptLoading(true); setOptError(null);
    try {
      const res  = await fetch("/api/optimize");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Optimize failed");
      setOptResult(data); setShowOpt(true); setAppliedIdx(null);
    } catch (e: any) { setOptError(e.message); }
    finally { setOptLoading(false); }
  }, []);

  const applyParams = (r: OptimizeResult, idx: number) => {
    setEntryDays(r.entryDays); setMinEdge(r.minEdge); setMinTrend(r.minTrendSignal); setAppliedIdx(idx);
  };

  const curveColor = result && result.totalPnl >= 0 ? "#16A34A" : "#DC2626";

  return (
    <div className="flex h-full w-full overflow-hidden" style={{ background: "var(--bg)" }}>

      {/* Config sidebar */}
      <div className="w-64 flex-shrink-0 border-r flex flex-col overflow-hidden bg-white"
        style={{ borderColor: "var(--border)" }}>
        <div className="px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text)" }}>
            Backtest Config
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>
            Real CLOB price history · paper P&L
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <SliderField label="Entry window" displayValue={`${entryDays}d`}
            min={3} max={60} step={1} value={entryDays} onChange={setEntryDays} bounds={["3d", "60d"]} />
          <SliderField label="Trade size" displayValue={`$${sizeUsdc} USDC`}
            min={1} max={100} step={1} value={sizeUsdc} onChange={setSizeUsdc} bounds={["$1", "$100"]} />
          <SliderField label="Min edge" displayValue={`${(minEdge * 100).toFixed(1)}%`}
            min={0.01} max={0.2} step={0.005} value={minEdge} onChange={setMinEdge} bounds={["1%", "20%"]} />
          <SliderField label="Min trend" displayValue={`${minTrend.toFixed(4)}/day`}
            min={0.0005} max={0.01} step={0.0005} value={minTrend} onChange={setMinTrend} bounds={["weak", "strong"]} />
          <SliderField label="Markets to scan" displayValue={String(maxMarkets)}
            min={10} max={50} step={5} value={maxMarkets} onChange={setMaxMarkets} bounds={["10", "50"]} />

          {/* AI toggle */}
          <div className="flex items-center justify-between py-2.5 border-t" style={{ borderColor: "var(--border)" }}>
            <div>
              <p className="text-xs font-medium" style={{ color: "var(--text)" }}>AI filter</p>
              <p className="text-[10px]" style={{ color: "var(--text-subtle)" }}>Skip trades AI disagrees with</p>
            </div>
            <button onClick={() => setUseAI(v => !v)}
              className="w-10 h-5 rounded-full relative transition-colors"
              style={{ background: useAI ? "var(--accent)" : "var(--border-strong)" }}>
              <span className={clsx("absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all",
                useAI ? "left-5" : "left-0.5")} />
            </button>
          </div>

          <div className="rounded-lg p-3 text-[10px] leading-relaxed border"
            style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-subtle)" }}>
            Enter <span style={{ color: "var(--accent)" }}>{entryDays}d</span> ago.
            Edge ≥ <span style={{ color: "var(--accent)" }}>{(minEdge * 100).toFixed(1)}%</span>.
            Trend ≥ <span style={{ color: "var(--accent)" }}>{minTrend.toFixed(4)}</span>/day.
            {useAI && <span style={{ color: "var(--accent)" }}> AI-confirmed only.</span>}
          </div>
        </div>

        <div className="p-4 border-t space-y-2" style={{ borderColor: "var(--border)" }}>
          <button onClick={run} disabled={loading}
            className="w-full py-2.5 rounded-lg text-sm font-bold transition-all text-white hover:opacity-90 disabled:opacity-40"
            style={{ background: "var(--accent)" }}>
            {loading ? (useAI ? "Running with AI…" : "Running…") : "Run Backtest"}
          </button>
          <button onClick={runOptimize} disabled={optLoading}
            className="w-full py-2 rounded-lg text-xs font-semibold transition-all border hover:opacity-80 disabled:opacity-40"
            style={{ borderColor: "var(--accent-border)", color: "var(--accent)", background: "var(--accent-bg)" }}>
            {optLoading ? "Searching parameters…" : "Auto-tune Parameters"}
          </button>
          {optLoading && (
            <p className="text-[10px] text-center" style={{ color: "var(--text-subtle)" }}>
              Testing {5 * 5 * 5} parameter combinations…
            </p>
          )}
        </div>
      </div>

      {/* Results panel */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Auto-tune results */}
        {showOpt && optResult && (
          <div className="border-b flex-shrink-0" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between px-4 py-2 border-b"
              style={{ borderColor: "var(--border)", background: "var(--accent-bg)" }}>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold" style={{ color: "var(--accent)" }}>Auto-tune Results</span>
                <span className="text-[10px]" style={{ color: "var(--text-subtle)" }}>
                  {optResult.validCombinations}/{optResult.totalCombinations} valid combos ·{" "}
                  {optResult.marketsUsed} markets · ranked by Sharpe
                </span>
              </div>
              <button onClick={() => setShowOpt(false)} className="text-[10px] transition-colors hover:opacity-70"
                style={{ color: "var(--text-subtle)" }}>Dismiss</button>
            </div>

            {optResult.best && (
              <div className="px-4 py-2 border-b flex items-center gap-4 text-xs"
                style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                <span className="font-semibold" style={{ color: "var(--accent)" }}>Best:</span>
                <span style={{ color: "var(--text)" }}>
                  Entry <span style={{ color: "var(--accent)" }}>{optResult.best.entryDays}d</span> ·{" "}
                  Edge ≥ <span style={{ color: "var(--accent)" }}>{(optResult.best.minEdge * 100).toFixed(0)}%</span> ·{" "}
                  Trend ≥ <span style={{ color: "var(--accent)" }}>{optResult.best.minTrendSignal.toFixed(4)}</span>
                </span>
                <span className="text-emerald-700 font-bold">Sharpe {optResult.best.sharpe.toFixed(2)}</span>
                <span style={{ color: "var(--text-subtle)" }}>
                  {optResult.best.winRate * 100 | 0}% win rate · {optResult.best.trades} trades
                </span>
                <button onClick={() => applyParams(optResult.best!, -1)}
                  className="ml-auto px-3 py-1 rounded text-[10px] font-bold text-white hover:opacity-90 transition-opacity"
                  style={{ background: "var(--accent)" }}>
                  Apply Best
                </button>
              </div>
            )}

            <div className="overflow-x-auto max-h-52 overflow-y-auto" style={{ background: "var(--surface)" }}>
              <table className="w-full text-xs">
                <thead className="sticky top-0 border-b" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                  <tr className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>
                    {["#","Entry","MinEdge","MinTrend","Trades","Sharpe","Win%","P&L","DD",""].map(h => (
                      <th key={h} className="px-2 py-1.5 text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {optResult.results.map((r, i) => (
                    <OptRow key={i} r={r} rank={i + 1}
                      onApply={rr => applyParams(rr, i)}
                      isApplied={appliedIdx === i || (appliedIdx === -1 && i === 0)} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {optError && (
          <div className="mx-4 mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{optError}</div>
        )}

        {/* Empty state */}
        {!result && !loading && !error && !showOpt && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
            <div className="w-12 h-12 rounded-xl border-2 flex items-center justify-center mb-1"
              style={{ borderColor: "var(--border-strong)", color: "var(--text-subtle)" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
              </svg>
            </div>
            <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Historical Backtester</p>
            <p className="text-xs leading-relaxed max-w-sm" style={{ color: "var(--text-muted)" }}>
              Simulate the edge and momentum strategy on active markets using real CLOB price history.
              Use <span style={{ color: "var(--accent)" }}>Auto-tune</span> to find optimal parameters
              across a 125-combination grid search.
            </p>
          </div>
        )}

        {error && (
          <div className="m-4 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>
        )}

        {result && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-4 gap-2">
              <StatCard label="Total P&L"
                value={`${result.totalPnl >= 0 ? "+" : ""}$${result.totalPnl.toFixed(2)}`}
                sub={`${(result.totalReturn * 100).toFixed(1)}% return`}
                positive={result.totalPnl >= 0} />
              <StatCard label="Win Rate"
                value={`${(result.winRate * 100).toFixed(0)}%`}
                sub={`${result.trades.filter(t => t.won).length} / ${result.trades.length} trades`}
                positive={result.winRate >= 0.5} />
              <StatCard label="Sharpe Ratio"
                value={result.sharpe.toFixed(2)} sub="annualised"
                positive={result.sharpe >= 1 ? true : result.sharpe >= 0 ? undefined : false} />
              <StatCard label="Max Drawdown"
                value={`${(result.maxDrawdown * 100).toFixed(1)}%`} sub="peak-to-trough"
                positive={result.maxDrawdown < 0.2 ? undefined : false} />
            </div>

            {(result as any).skipped && (
              <div className="flex gap-4 text-[10px] px-1" style={{ color: "var(--text-subtle)" }}>
                <span>Scanned: <span style={{ color: "var(--text-muted)" }}>{(result as any).skipped.total}</span></span>
                <span>No history: <span style={{ color: "var(--text-muted)" }}>{(result as any).skipped.noHistory}</span></span>
                <span>No entry: <span style={{ color: "var(--text-muted)" }}>{(result as any).skipped.noEntry}</span></span>
                <span>Weak signal: <span style={{ color: "var(--text-muted)" }}>{(result as any).skipped.weakSignal}</span></span>
                {(result as any).skipped.aiRejected > 0 && (
                  <span>AI rejected: <span style={{ color: "var(--accent)" }}>{(result as any).skipped.aiRejected}</span></span>
                )}
              </div>
            )}

            {result.equityCurve.length > 1 && (
              <div className="rounded-lg border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                <p className="text-xs uppercase tracking-wider mb-3" style={{ color: "var(--text-subtle)" }}>
                  Cumulative P&L — {result.trades.length} trades ·{" "}
                  avg {result.avgTrade >= 0 ? "+" : ""}${result.avgTrade.toFixed(2)}/trade
                </p>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={result.equityCurve} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="curveGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={curveColor} stopOpacity={0.2} />
                          <stop offset="95%" stopColor={curveColor} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="date" tick={{ fontSize: 9, fill: "var(--text-subtle)" }} tickLine={false} />
                      <YAxis tickFormatter={v => `$${v.toFixed(0)}`}
                        tick={{ fontSize: 9, fill: "var(--text-subtle)" }} width={40} />
                      <Tooltip content={<CurveTip />} />
                      <ReferenceLine y={0} stroke="var(--border-strong)" strokeDasharray="4 4" />
                      <Area type="monotone" dataKey="cumPnl"
                        stroke={curveColor} strokeWidth={1.5} fill="url(#curveGrad)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <div className="rounded-lg border overflow-hidden"
              style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-2 px-3 py-2 border-b text-[10px] uppercase tracking-wider"
                style={{ borderColor: "var(--border)", color: "var(--text-subtle)" }}>
                <span>Market</span><span>Dir</span><span>Entry</span><span>P&L</span>
                <span>AI</span><span>Result</span>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {result.trades.length === 0 ? (
                  <p className="text-xs text-center py-6" style={{ color: "var(--text-subtle)" }}>
                    No trades — try lowering min edge or trend
                  </p>
                ) : (
                  result.trades.map((t, i) => <TradeRow key={i} t={t} />)
                )}
              </div>
            </div>

            <p className="text-[10px] text-center" style={{ color: "var(--text-subtle)" }}>
              Entry {result.config.entryDays}d · edge ≥ {(result.config.minEdge * 100).toFixed(1)}% ·
              trend ≥ {result.config.minTrendSignal.toFixed(4)}/day · ${result.config.sizeUsdc}/trade
              {(result.config as any).useAI && " · AI-filtered"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
