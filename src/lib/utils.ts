import { OrderBook } from "@/types";

export function getMidPrice(orderBook: OrderBook): number | null {
  const bidPrices = orderBook.bids.map((e) => parseFloat(e.price)).filter(isFinite);
  const askPrices = orderBook.asks.map((e) => parseFloat(e.price)).filter(isFinite);

  const bestBid = bidPrices.length ? Math.max(...bidPrices) : null;
  const bestAsk = askPrices.length ? Math.min(...askPrices) : null;

  if (bestBid !== null && bestAsk !== null) return (bestBid + bestAsk) / 2;
  if (bestBid !== null) return bestBid;
  if (bestAsk !== null) return bestAsk;
  return null;
}

export function formatPnl(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}$${value.toFixed(2)}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function shortQuestion(question: string, maxLength = 60): string {
  return question.length > maxLength ? question.slice(0, maxLength) + "…" : question;
}
