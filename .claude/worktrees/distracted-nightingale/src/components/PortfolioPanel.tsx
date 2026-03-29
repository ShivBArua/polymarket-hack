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
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
          Positions ({positions.length})
        </p>
        {positions.length > 0 && (
          <button
            onClick={() => positions.forEach((p) => onRemove(p.id))}
            className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {positions.length === 0 ? (
        <div className="px-4 py-3 text-xs text-zinc-600">No positions added yet</div>
      ) : (
        <ul className="overflow-y-auto flex-1 divide-y divide-zinc-800/60">
          {positions.map((pos) => {
            const q = currentProbability !== null ? currentProbability * 100 : 50;
            const pnl = computePositionPnl(pos, q);
            const isProfit = pnl >= 0;

            return (
              <li key={pos.id} className="px-4 py-3 flex flex-col gap-1">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs text-zinc-300 leading-snug">
                    {shortQuestion(pos.marketQuestion, 50)}
                  </span>
                  <button
                    onClick={() => onRemove(pos.id)}
                    className="text-zinc-700 hover:text-red-400 transition-colors flex-shrink-0 text-xs mt-0.5"
                    title="Remove position"
                  >
                    ✕
                  </button>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={clsx(
                      "text-xs px-1.5 py-0.5 rounded font-medium",
                      pos.direction === "YES"
                        ? "bg-green-500/15 text-green-400"
                        : "bg-red-500/15 text-red-400"
                    )}
                  >
                    {pos.direction}
                  </span>
                  <span className="text-xs text-zinc-500">
                    ${pos.size} @ {(pos.entryPrice * 100).toFixed(1)}%
                  </span>
                  <span
                    className={clsx(
                      "text-xs font-medium ml-auto",
                      isProfit ? "text-green-400" : "text-red-400"
                    )}
                  >
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
