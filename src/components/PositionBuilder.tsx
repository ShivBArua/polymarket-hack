"use client";

import { useState } from "react";
import clsx from "clsx";
import { Market, Direction, Position } from "@/types";
import { clamp } from "@/lib/utils";

interface Props {
  market: Market | null;
  midPrice: number | null;
  onAdd: (position: Omit<Position, "id">) => void;
}

export function PositionBuilder({ market, midPrice, onAdd }: Props) {
  const [direction, setDirection] = useState<Direction>("YES");
  const [size, setSize] = useState("100");
  const [entryPrice, setEntryPrice] = useState("");

  const resolvedEntry =
    entryPrice !== "" ? parseFloat(entryPrice) / 100 : midPrice ?? 0.5;

  const token = direction === "YES" ? market?.tokens[0] : market?.tokens[1];

  function handleAdd() {
    if (!market || !token) return;
    const sizeNum = parseFloat(size);
    if (isNaN(sizeNum) || sizeNum <= 0) return;
    onAdd({
      marketId: market.id,
      marketQuestion: market.question,
      tokenId: token.token_id,
      direction,
      size: sizeNum,
      entryPrice: clamp(resolvedEntry, 0.01, 0.99),
      outcome: token.outcome,
    });
    setSize("100");
    setEntryPrice("");
  }

  const impliedOdds = resolvedEntry > 0 ? (1 / resolvedEntry).toFixed(2) : "—";

  return (
    <div className="px-4 py-4 border-b flex flex-col gap-3" style={{ borderColor: "var(--border)" }}>
      <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>
        Position Builder
      </p>

      {!market ? (
        <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Select a market to add a position</p>
      ) : (
        <>
          <div className="flex gap-2">
            <button
              onClick={() => setDirection("YES")}
              className={clsx(
                "flex-1 py-1.5 rounded text-xs font-semibold transition-colors border",
                direction === "YES"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                  : "text-[var(--text-muted)] border-[var(--border)] hover:border-[var(--border-strong)]"
              )}
              style={direction !== "YES" ? { background: "var(--surface-2)" } : {}}
            >
              YES
            </button>
            <button
              onClick={() => setDirection("NO")}
              className={clsx(
                "flex-1 py-1.5 rounded text-xs font-semibold transition-colors border",
                direction === "NO"
                  ? "bg-red-50 text-red-600 border-red-300"
                  : "text-[var(--text-muted)] border-[var(--border)] hover:border-[var(--border-strong)]"
              )}
              style={direction !== "NO" ? { background: "var(--surface-2)" } : {}}
            >
              NO
            </button>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium" style={{ color: "var(--text-subtle)" }}>Size (USDC)</label>
            <input
              type="number"
              min={1}
              value={size}
              onChange={(e) => setSize(e.target.value)}
              className="border rounded px-3 py-1.5 text-sm focus:outline-none transition-colors"
              style={{
                background: "var(--surface-2)",
                borderColor: "var(--border)",
                color: "var(--text)",
              }}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium" style={{ color: "var(--text-subtle)" }}>
              Entry Price (%)
              {midPrice !== null && (
                <span className="ml-1" style={{ color: "var(--text-subtle)" }}>
                  — mid: {(midPrice * 100).toFixed(1)}%
                </span>
              )}
            </label>
            <input
              type="number"
              min={1}
              max={99}
              step={0.1}
              placeholder={midPrice !== null ? `${(midPrice * 100).toFixed(1)}` : "50"}
              value={entryPrice}
              onChange={(e) => setEntryPrice(e.target.value)}
              className="border rounded px-3 py-1.5 text-sm focus:outline-none transition-colors"
              style={{
                background: "var(--surface-2)",
                borderColor: "var(--border)",
                color: "var(--text)",
              }}
            />
          </div>

          <div className="flex justify-between text-[10px] px-0.5" style={{ color: "var(--text-subtle)" }}>
            <span>Implied: {impliedOdds}x</span>
            <span>Max profit: ${(parseFloat(size || "0") * (1 / resolvedEntry - 1)).toFixed(2)}</span>
          </div>

          <button
            onClick={handleAdd}
            disabled={!market}
            className="w-full py-2 rounded text-xs font-semibold text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "var(--accent)" }}
          >
            Add Position
          </button>
        </>
      )}
    </div>
  );
}
