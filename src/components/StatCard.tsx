"use client";

import clsx from "clsx";

interface Props {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
}

export function StatCard({ label, value, sub, positive }: Props) {
  return (
    <div className="bg-white border rounded-lg px-4 py-3 flex flex-col gap-1" style={{ borderColor: "var(--border)" }}>
      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>{label}</span>
      <span
        className={clsx("text-xl font-semibold tabular-nums", {
          "text-emerald-600": positive === true,
          "text-red-500":     positive === false,
        })}
        style={positive === undefined ? { color: "var(--text)" } : {}}
      >
        {value}
      </span>
      {sub && <span className="text-[10px]" style={{ color: "var(--text-subtle)" }}>{sub}</span>}
    </div>
  );
}
