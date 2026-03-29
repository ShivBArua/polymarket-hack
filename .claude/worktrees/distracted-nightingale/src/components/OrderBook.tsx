"use client";

import { OrderBook as OrderBookType } from "@/types";

interface Props {
  orderBook: OrderBookType | null;
}

function BookSide({
  entries,
  side,
}: {
  entries: { price: string; size: string }[];
  side: "bid" | "ask";
}) {
  const color = side === "bid" ? "text-green-400" : "text-red-400";

  return (
    <div className="flex-1 min-w-0">
      <div className="flex justify-between text-xs text-zinc-600 mb-1 px-1">
        <span>Price</span>
        <span>Size</span>
      </div>
      {entries.length === 0 ? (
        <p className="text-xs text-zinc-700 px-1">—</p>
      ) : (
        <ul className="space-y-0.5">
          {entries.map((e, i) => (
            <li key={i} className="flex justify-between text-xs px-1 py-0.5 rounded hover:bg-zinc-800/50">
              <span className={color}>{parseFloat(e.price).toFixed(3)}</span>
              <span className="text-zinc-400 tabular-nums">
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
      <div className="h-full flex items-center justify-center text-xs text-zinc-700">
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
        <span className="text-xs font-medium text-zinc-400">Order Book</span>
        {spread !== null && (
          <span className="text-xs text-zinc-600">Spread: {spread}</span>
        )}
      </div>
      <div className="flex gap-4 overflow-hidden flex-1">
        <BookSide entries={orderBook.bids} side="bid" />
        <div className="w-px bg-zinc-800" />
        <BookSide entries={orderBook.asks} side="ask" />
      </div>
    </div>
  );
}
