"use client";

import { OrderBook as OrderBookType } from "@/types";

interface Props {
  orderBook: OrderBookType | null;
}

function BookSide({ entries, side }: { entries: { price: string; size: string }[]; side: "bid" | "ask" }) {
  const color = side === "bid" ? "text-emerald-600" : "text-red-500";

  return (
    <div className="flex-1 min-w-0">
      <div className="flex justify-between text-[10px] font-medium uppercase tracking-wider mb-1.5 px-1" style={{ color: "var(--text-subtle)" }}>
        <span>Price</span>
        <span>Size</span>
      </div>
      {entries.length === 0 ? (
        <p className="text-xs px-1" style={{ color: "var(--text-subtle)" }}>—</p>
      ) : (
        <ul className="space-y-0.5">
          {entries.map((e, i) => (
            <li key={i} className="flex justify-between text-xs px-1 py-0.5 rounded transition-colors hover:bg-[var(--surface-2)]">
              <span className={`font-mono font-medium ${color}`}>{parseFloat(e.price).toFixed(3)}</span>
              <span className="tabular-nums" style={{ color: "var(--text-muted)" }}>
                {parseFloat(e.size).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function OrderBook({ orderBook }: Props) {
  if (!orderBook) {
    return (
      <div className="h-full flex items-center justify-center text-xs" style={{ color: "var(--text-subtle)" }}>
        Select a market to view the order book
      </div>
    );
  }

  const spread =
    orderBook.asks[0] && orderBook.bids[0]
      ? (parseFloat(orderBook.asks[0].price) - parseFloat(orderBook.bids[0].price)).toFixed(3)
      : null;

  return (
    <div className="h-full flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Order Book</span>
        {spread !== null && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border" style={{ color: "var(--text-subtle)", borderColor: "var(--border)", background: "var(--surface-2)" }}>
            spread {spread}
          </span>
        )}
      </div>
      <div className="flex gap-4 overflow-hidden flex-1">
        <BookSide entries={orderBook.bids} side="bid" />
        <div className="w-px" style={{ background: "var(--border)" }} />
        <BookSide entries={orderBook.asks} side="ask" />
      </div>
    </div>
  );
}
