"use client";

import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, TooltipProps,
} from "recharts";
import { Position } from "@/types";
import { buildPayoffCurve, findBreakevenProb } from "@/lib/payoff";

interface Props {
  positions: Position[];
  currentProbability: number | null;
}

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const pnl = payload.find((p) => p.dataKey === "pnl")?.value ?? 0;
  const isProfit = (pnl as number) >= 0;

  return (
    <div className="bg-white border rounded-lg px-3 py-2 text-xs shadow-lg" style={{ borderColor: "var(--border)" }}>
      <p className="mb-1" style={{ color: "var(--text-subtle)" }}>Probability: {label}%</p>
      <p className={`font-semibold ${isProfit ? "text-emerald-600" : "text-red-500"}`}>
        P&amp;L: {(pnl as number) >= 0 ? "+" : ""}${(pnl as number).toFixed(2)}
      </p>
    </div>
  );
}

export function PayoffChart({ positions, currentProbability }: Props) {
  if (positions.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 select-none" style={{ color: "var(--border-strong)" }}>
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <path d="M4 36 L14 18 L22 26 L30 10 L36 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p className="text-sm" style={{ color: "var(--text-subtle)" }}>Add a position to see the payoff curve</p>
      </div>
    );
  }

  const data = buildPayoffCurve(positions);
  const currentX = currentProbability !== null ? Math.round(currentProbability * 100) : null;
  const breakevenProb = findBreakevenProb(positions);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 12, right: 24, left: 8, bottom: 24 }}>
        <defs>
          <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity={0.15} />
            <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="lossGrad" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#ef4444" stopOpacity={0.15} />
            <stop offset="100%" stopColor="#ef4444" stopOpacity={0.02} />
          </linearGradient>
        </defs>

        <CartesianGrid strokeDasharray="3 3" stroke="#E2E6EC" vertical={false} />

        <XAxis
          dataKey="probability"
          tickFormatter={(v) => `${v}%`}
          tick={{ fill: "#9CA3AF", fontSize: 11 }}
          axisLine={{ stroke: "#E2E6EC" }}
          tickLine={false}
          label={{ value: "Market Probability", position: "insideBottom", offset: -14, fill: "#9CA3AF", fontSize: 11 }}
        />

        <YAxis
          tickFormatter={(v) => `$${v}`}
          tick={{ fill: "#9CA3AF", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={56}
        />

        <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#E2E6EC", strokeWidth: 1 }} />

        <ReferenceLine y={0} stroke="#E2E6EC" strokeWidth={1} />

        {currentX !== null && (
          <ReferenceLine
            x={currentX}
            stroke="#2563EB"
            strokeDasharray="4 4"
            strokeWidth={1.5}
            label={{ value: `${currentX}% (mid)`, position: "insideTopRight", fill: "#2563EB", fontSize: 10, offset: 6 }}
          />
        )}

        {breakevenProb !== null && (
          <ReferenceLine
            x={Math.round(breakevenProb)}
            stroke="#f59e0b"
            strokeDasharray="3 3"
            strokeWidth={1}
            label={{ value: `BE ${breakevenProb.toFixed(0)}%`, position: "insideTopLeft", fill: "#f59e0b", fontSize: 10, offset: 6 }}
          />
        )}

        <Area type="linear" dataKey="profit" fill="url(#profitGrad)" stroke="none" baseValue={0} isAnimationActive={false} />
        <Area type="linear" dataKey="loss"   fill="url(#lossGrad)"  stroke="none" baseValue={0} isAnimationActive={false} />
        <Line type="linear" dataKey="pnl" stroke="#2563EB" strokeWidth={2.5} dot={false} isAnimationActive={false} name="Portfolio P&L" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
