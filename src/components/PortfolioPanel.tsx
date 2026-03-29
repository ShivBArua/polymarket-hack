"use client";

import clsx from "clsx";
import { Position } from "@/types";
import { computePositionPnl } from "@/lib/payoff";
import { shortQuestion, formatPnl } from "@/lib/utils";

interface Props {
  positions: Position[];
  currentProbability: number | null;
  onRemove: (id: string) => void;
}

export function PortfolioPanel({ positions, currentProbability, onRemove }: Props) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b" style={{ borderColor: "var(--border)" }}>
        <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>
          Positions ({positions.length})
        </p>
        {positions.length > 0 && (
          <button
            onClick={() => positions.forEach((p) => onRemove(p.id))}
            className="text-[10px] transition-colors hover:text-red-500"
            style={{ color: "var(--text-subtle)" }}
          >
            Clear all
          </button>
        )}
      </div>

      {positions.length === 0 ? (
        <div className="px-4 py-3 text-xs" style={{ color: "var(--text-subtle)" }}>No positions added yet</div>
      ) : (
        <ul className="overflow-y-auto flex-1 divide-y" style={{ borderColor: "var(--border)" }}>
          {positions.map((pos) => {
            const q = currentProbability !== null ? currentProbability * 100 : 50;
            const pnl = computePositionPnl(pos, q);
            const isProfit = pnl >= 0;

            return (
              <li key={pos.id} className="px-4 py-2.5 flex flex-col gap-1.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs leading-snug" style={{ color: "var(--text)" }}>
                    {shortQuestion(pos.marketQuestion, 50)}
                  </span>
                  <button
                    onClick={() => onRemove(pos.id)}
                    className="flex-shrink-0 text-xs mt-0.5 transition-colors hover:text-red-500"
                    style={{ color: "var(--text-subtle)" }}
                    title="Remove position"
                  >
                    ✕
                  </button>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <span className={clsx(
                    "text-[10px] px-1.5 py-0.5 rounded border font-semibold",
                    pos.direction === "YES"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-red-50 text-red-600 border-red-200"
                  )}>
                    {pos.direction}
                  </span>
                  <span className="text-[10px]" style={{ color: "var(--text-subtle)" }}>
                    ${pos.size} @ {(pos.entryPrice * 100).toFixed(1)}%
                  </span>
                  <span className={clsx("text-xs font-semibold ml-auto", isProfit ? "text-emerald-600" : "text-red-500")}>
                    {formatPnl(pnl)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
