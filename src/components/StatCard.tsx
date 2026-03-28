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
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 flex flex-col gap-1">
      <span className="text-xs text-zinc-500 uppercase tracking-wider">{label}</span>
      <span
        className={clsx("text-xl font-semibold tabular-nums", {
          "text-green-400": positive === true,
          "text-red-400": positive === false,
          "text-zinc-100": positive === undefined,
        })}
      >
        {value}
      </span>
      {sub && <span className="text-xs text-zinc-500">{sub}</span>}
    </div>
  );
}
