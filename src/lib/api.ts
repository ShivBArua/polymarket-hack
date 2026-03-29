import { Market, OrderBook, PriceHistoryPoint } from "@/types";

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`Request failed: ${res.status} ${url}`);
  return res.json();
}

export async function fetchMarkets(limit = 50, query = ""): Promise<Market[]> {
  const q = query.trim();
  const url = q
    ? `/api/markets?limit=${limit}&q=${encodeURIComponent(q)}`
    : `/api/markets?limit=${limit}`;
  return get<Market[]>(url);
}

export async function fetchOrderBook(tokenId: string): Promise<OrderBook> {
  return get<OrderBook>(`/api/orderbook?tokenId=${encodeURIComponent(tokenId)}`);
}

export async function fetchPriceHistory(tokenId: string): Promise<PriceHistoryPoint[]> {
  return get<PriceHistoryPoint[]>(`/api/history?tokenId=${encodeURIComponent(tokenId)}`);
}
