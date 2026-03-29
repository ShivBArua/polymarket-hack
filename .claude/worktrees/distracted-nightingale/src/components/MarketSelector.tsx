"use client";

import clsx from "clsx";
import { Market } from "@/types";
import { shortQuestion } from "@/lib/utils";

interface Props {
  markets: Market[];
  selected: Market | null;
  onSelect: (market: Market) => void;
  onSearch: (query: string) => void;
  loading: boolean;
}

export function MarketSelector({ markets, selected, onSelect, onSearch, loading }: Props) {
  return (
    <div className="flex flex-col border-b border-zinc-800">
      <div className="px-4 pt-4 pb-3">
        <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
          Markets
        </p>
        <input
          type="text"
          placeholder="Search 42k+ markets…"
          onChange={(e) => onSearch(e.target.value)}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-500 transition-colors"
        />
      </div>

      <ul className="overflow-y-auto max-h-52">
        {loading && (
          <li className="px-4 py-3 text-xs text-zinc-500">Loading markets…</li>
        )}
        {!loading && markets.length === 0 && (
          <li className="px-4 py-3 text-xs text-zinc-500">No markets found</li>
        )}
        {!loading && markets.map((market) => (
          <li key={market.id}>
            <button
              onClick={() => onSelect(market)}
              className={clsx(
                "w-full text-left px-4 py-2.5 text-xs leading-snug transition-colors",
                selected?.id === market.id
                  ? "bg-blue-500/10 text-blue-300 border-l-2 border-blue-500"
                  : "text-zinc-300 hover:bg-zinc-800 border-l-2 border-transparent"
              )}
            >
              {shortQuestion(market.question, 72)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
