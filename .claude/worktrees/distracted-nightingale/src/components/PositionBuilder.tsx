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
    entryPrice !== ""
      ? parseFloat(entryPrice) / 100
      : midPrice ?? 0.5;

  const token = direction === "YES" ? market?.tokens[0] : market?.tokens[1];

  function handleAdd() {
    if (!market || !token) return;

    const sizeNum = parseFloat(size);
    if (isNaN(sizeNum) || sizeNum <= 0) return;

    const priceNum = clamp(resolvedEntry, 0.01, 0.99);

    onAdd({
      marketId: market.id,
      marketQuestion: market.question,
      tokenId: token.token_id,
      direction,
      size: sizeNum,
      entryPrice: priceNum,
      outcome: token.outcome,
    });

    setSize("100");
    setEntryPrice("");
  }

  const impliedOdds = resolvedEntry > 0 ? (1 / resolvedEntry).toFixed(2) : "—";

  return (
    <div className="px-4 py-4 border-b border-zinc-800 flex flex-col gap-3">
      <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
        Position Builder
      </p>

      {!market ? (
        <p className="text-xs text-zinc-600">Select a market to add a position</p>
      ) : (
        <>
          <div className="flex gap-2">
            <button
              onClick={() => setDirection("YES")}
              className={clsx(
                "flex-1 py-1.5 rounded-md text-xs font-medium transition-colors",
                direction === "YES"
                  ? "bg-green-500/20 text-green-400 border border-green-500/40"
                  : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-600"
              )}
            >
              YES
            </button>
            <button
              onClick={() => setDirection("NO")}
              className={clsx(
                "flex-1 py-1.5 rounded-md text-xs font-medium transition-colors",
                direction === "NO"
                  ? "bg-red-500/20 text-red-400 border border-red-500/40"
                  : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-600"
              )}
            >
              NO
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-zinc-500">Size (USDC)</label>
            <input
              type="number"
              min={1}
              value={size}
              onChange={(e) => setSize(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-md px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500 transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-zinc-500">
              Entry Price (%)&nbsp;
              {midPrice !== null && (
                <span className="text-zinc-600">
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
              className="bg-zinc-800 border border-zinc-700 rounded-md px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
            />
          </div>

          <div className="flex justify-between text-xs text-zinc-500 px-0.5">
            <span>Implied odds: {impliedOdds}x</span>
            <span>
              Max profit: $
              {(parseFloat(size || "0") * (1 / resolvedEntry - 1)).toFixed(2)}
            </span>
          </div>

          <button
            onClick={handleAdd}
            disabled={!market}
            className="w-full py-2 rounded-md text-xs font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Add Position
          </button>
        </>
      )}
    </div>
  );
}
