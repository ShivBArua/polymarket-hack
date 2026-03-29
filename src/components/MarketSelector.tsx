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
    <div className="flex flex-col border-b" style={{ borderColor: "var(--border)" }}>
      <div className="px-4 pt-4 pb-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-subtle)" }}>
          Markets
        </p>
        <input
          type="text"
          placeholder="Search 42k+ markets…"
          onChange={(e) => onSearch(e.target.value)}
          className="w-full border rounded px-3 py-1.5 text-xs focus:outline-none focus:border-[var(--accent)] transition-colors"
          style={{
            background: "var(--surface-2)",
            borderColor: "var(--border)",
            color: "var(--text)",
          }}
        />
      </div>

      <ul className="overflow-y-auto max-h-52">
        {loading && (
          <li className="px-4 py-3 text-xs" style={{ color: "var(--text-subtle)" }}>Loading markets…</li>
        )}
        {!loading && markets.length === 0 && (
          <li className="px-4 py-3 text-xs" style={{ color: "var(--text-subtle)" }}>No markets found</li>
        )}
        {!loading && markets.map((market) => (
          <li key={market.id}>
            <button
              onClick={() => onSelect(market)}
              className={clsx(
                "w-full text-left px-4 py-2.5 text-xs leading-snug transition-colors border-l-2",
                selected?.id === market.id
                  ? "border-[var(--accent)]"
                  : "border-transparent hover:bg-[var(--surface-2)]"
              )}
              style={
                selected?.id === market.id
                  ? { background: "var(--accent-bg)", color: "var(--accent)" }
                  : { color: "var(--text-muted)" }
              }
            >
              {shortQuestion(market.question, 72)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
