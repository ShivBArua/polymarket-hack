"use client";

import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, TooltipProps,
} from "recharts";
import { PriceHistoryPoint } from "@/types";

interface Props {
  data: PriceHistoryPoint[];
}

function CustomTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as PriceHistoryPoint;
  return (
    <div className="bg-white border rounded-lg px-3 py-2 text-xs shadow-lg" style={{ borderColor: "var(--border)" }}>
      <p style={{ color: "var(--text-subtle)" }}>{new Date(point.datetime).toLocaleString()}</p>
      <p className="font-semibold mt-0.5" style={{ color: "var(--accent)" }}>
        {(payload[0].value! * 100).toFixed(1)}%
      </p>
    </div>
  );
}

export function PriceHistoryChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-xs" style={{ color: "var(--text-subtle)" }}>
        No price history available
      </div>
    );
  }

  const latest = data[data.length - 1]?.price;
  const first  = data[0]?.price;
  const delta  = latest !== undefined && first !== undefined ? latest - first : 0;
  const strokeColor = delta >= 0 ? "#2563EB" : "#ef4444";

  const tickCount = Math.min(4, data.length);
  const stride = Math.floor(data.length / tickCount);
  const ticks  = data.filter((_, i) => i % stride === 0).map((d) => d.timestamp);

  return (
    <div className="h-full flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Price History</span>
        {latest !== undefined && (
          <span className={`text-xs font-semibold ${delta >= 0 ? "text-blue-600" : "text-red-500"}`}>
            {(latest * 100).toFixed(1)}%
            <span className="ml-1 font-normal" style={{ color: "var(--text-subtle)" }}>
              ({delta >= 0 ? "+" : ""}{(delta * 100).toFixed(1)}pp)
            </span>
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="histGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity={0.15} />
              <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="timestamp"
            ticks={ticks}
            tickFormatter={(v) => new Date(v * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            tick={{ fill: "#9CA3AF", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={["auto", "auto"]}
            tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
            tick={{ fill: "#9CA3AF", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#E2E6EC", strokeWidth: 1 }} />
          <Area
            type="monotone"
            dataKey="price"
            stroke={strokeColor}
            strokeWidth={2}
            fill="url(#histGrad)"
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
