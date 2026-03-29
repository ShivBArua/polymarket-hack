"use client";

interface Props {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
}

export function StatCard({ label, value, sub, positive }: Props) {
  const valueColor =
    positive === true  ? "text-emerald-600" :
    positive === false ? "text-red-500"     : "";

  return (
    <div className="bg-white border rounded-lg px-4 py-3 flex flex-col gap-1" style={{ borderColor: "var(--border)" }}>
      <span className="text-[9px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--text-subtle)" }}>
        {label}
      </span>
      <span
        className={`text-xl font-semibold tabular-nums font-mono ${valueColor}`}
        style={!valueColor ? { color: "var(--text)" } : {}}
      >
        {value}
      </span>
      {sub && <span className="text-[10px]" style={{ color: "var(--text-subtle)" }}>{sub}</span>}
    </div>
  );
}
