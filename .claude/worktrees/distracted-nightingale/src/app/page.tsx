"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import clsx from "clsx";
import { Market, Position, OrderBook, PriceHistoryPoint, ScannerEntry } from "@/types";
import { fetchMarkets, fetchOrderBook, fetchPriceHistory } from "@/lib/api";
import { getMidPrice, formatPnl } from "@/lib/utils";
import { computePortfolioStats } from "@/lib/payoff";
import { MarketSelector } from "@/components/MarketSelector";
import { PositionBuilder } from "@/components/PositionBuilder";
import { PortfolioPanel } from "@/components/PortfolioPanel";
import { PayoffChart } from "@/components/PayoffChart";
import { OrderBook as OrderBookComponent } from "@/components/OrderBook";
import { PriceHistoryChart } from "@/components/PriceHistoryChart";
import { StatCard } from "@/components/StatCard";
import { ScannerPanel } from "@/components/ScannerPanel";
import { QuantumPanel } from "@/components/QuantumPanel";

type Tab = "lab" | "scanner";

export default function HomePage() {
  const [tab, setTab] = useState<Tab>("lab");

  // ── Strategy Lab state ────────────────────────────────────────────────────
  const [markets, setMarkets] = useState<Market[]>([]);
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [orderBook, setOrderBook] = useState<OrderBook | null>(null);
  const [priceHistory, setPriceHistory] = useState<PriceHistoryPoint[]>([]);
  const [midPrice, setMidPrice] = useState<number | null>(null);
  const [loadingMarkets, setLoadingMarkets] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Scanner / Optimizer state ─────────────────────────────────────────────
  const [optimizerCandidates, setOptimizerCandidates] = useState<ScannerEntry[]>([]);

  // ── Market loading ────────────────────────────────────────────────────────
  const loadMarkets = useCallback((query: string) => {
    setLoadingMarkets(true);
    fetchMarkets(50, query)
      .then(setMarkets)
      .catch(console.error)
      .finally(() => setLoadingMarkets(false));
  }, []);

  useEffect(() => { loadMarkets(""); }, [loadMarkets]);

  const handleSearch = useCallback((query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadMarkets(query), 300);
  }, [loadMarkets]);

  const handleSelectMarket = useCallback(async (market: Market) => {
    setSelectedMarket(market);
    setOrderBook(null);
    setPriceHistory([]);
    setMidPrice(null);
    setLoadingData(true);

    const tokenId = market.tokens[0]?.token_id;
    if (!tokenId) { setLoadingData(false); return; }

    const [book, history] = await Promise.allSettled([
      fetchOrderBook(tokenId),
      fetchPriceHistory(tokenId),
    ]);

    if (book.status === "fulfilled") {
      setOrderBook(book.value);
      setMidPrice(getMidPrice(book.value));
    }
    if (history.status === "fulfilled") setPriceHistory(history.value);
    setLoadingData(false);
  }, []);

  const handleAddPosition = useCallback((position: Omit<Position, "id">) => {
    setPositions((prev) => [...prev, { ...position, id: crypto.randomUUID() }]);
  }, []);

  const handleRemovePosition = useCallback((id: string) => {
    setPositions((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const stats = computePortfolioStats(positions, midPrice);

  return (
    <div className="h-screen flex flex-col bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* ── Nav bar ────────────────────────────────────────────────────────── */}
      <header className="h-12 border-b border-zinc-800 px-5 flex items-center gap-4 flex-shrink-0">
        <span className="text-indigo-400 font-bold text-base">◈</span>
        <span className="font-semibold text-sm tracking-tight">Polymarket Strategy Lab</span>

        {/* Tab switcher */}
        <nav className="flex items-center gap-0.5 ml-4">
          {(
            [
              { id: "lab", label: "Strategy Lab" },
              { id: "scanner", label: "Scanner & Optimizer" },
            ] as { id: Tab; label: string }[]
          ).map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={clsx(
                "px-3 py-1 text-xs rounded-md transition-colors font-medium",
                tab === id
                  ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                  : "text-zinc-500 hover:text-zinc-300 border border-transparent"
              )}
            >
              {label}
            </button>
          ))}
        </nav>

        {/* Portfolio summary (Lab tab only) */}
        {tab === "lab" && positions.length > 0 && stats && (
          <div className="ml-auto flex items-center gap-4 text-xs">
            <span className="text-zinc-500">
              {positions.length} position{positions.length !== 1 ? "s" : ""}
            </span>
            <span className={stats.currentPnl >= 0 ? "text-green-400 font-medium" : "text-red-400 font-medium"}>
              {formatPnl(stats.currentPnl)} unrealized
            </span>
          </div>
        )}
      </header>

      {/* ── Strategy Lab ───────────────────────────────────────────────────── */}
      {tab === "lab" && (
        <div className="flex flex-1 overflow-hidden">
          <aside className="w-72 border-r border-zinc-800 flex flex-col overflow-hidden flex-shrink-0">
            <MarketSelector
              markets={markets}
              selected={selectedMarket}
              onSelect={handleSelectMarket}
              onSearch={handleSearch}
              loading={loadingMarkets}
            />
            <PositionBuilder
              market={selectedMarket}
              midPrice={midPrice}
              onAdd={handleAddPosition}
            />
            <PortfolioPanel
              positions={positions}
              currentProbability={midPrice}
              onRemove={handleRemovePosition}
            />
          </aside>

          <main className="flex-1 flex flex-col overflow-hidden p-4 gap-3 min-w-0">
            <div className="grid grid-cols-4 gap-3 flex-shrink-0">
              <StatCard
                label="Unrealized P&L"
                value={stats ? formatPnl(stats.currentPnl) : "—"}
                sub={midPrice !== null ? `at ${(midPrice * 100).toFixed(1)}% mid` : undefined}
                positive={stats ? stats.currentPnl >= 0 : undefined}
              />
              <StatCard
                label="Max Profit (YES)"
                value={stats ? `$${stats.maxProfit.toFixed(2)}` : "—"}
                sub="if market resolves YES"
                positive={stats !== null}
              />
              <StatCard
                label="Max Loss (NO)"
                value={stats ? `$${stats.maxLoss.toFixed(2)}` : "—"}
                sub="if market resolves NO"
                positive={false}
              />
              <StatCard
                label="Breakeven"
                value={stats?.breakevenProb != null ? `${stats.breakevenProb.toFixed(1)}%` : "—"}
                sub="probability to break even"
              />
            </div>

            <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-1 flex-shrink-0">
                <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                  Portfolio Payoff Curve
                </span>
                {positions.length > 0 && (
                  <span className="text-xs text-zinc-600">P&L as market probability moves 0 → 100%</span>
                )}
              </div>
              <div className="flex-1 min-h-0">
                <PayoffChart positions={positions} currentProbability={midPrice} />
              </div>
            </div>

            <div className="h-52 grid grid-cols-2 gap-3 flex-shrink-0">
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 overflow-hidden">
                {loadingData ? (
                  <div className="h-full flex items-center justify-center text-xs text-zinc-600">Loading…</div>
                ) : (
                  <OrderBookComponent orderBook={orderBook} />
                )}
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 overflow-hidden">
                {loadingData ? (
                  <div className="h-full flex items-center justify-center text-xs text-zinc-600">Loading…</div>
                ) : (
                  <PriceHistoryChart data={priceHistory} />
                )}
              </div>
            </div>
          </main>
        </div>
      )}

      {/* ── Scanner & Optimizer ─────────────────────────────────────────────── */}
      {tab === "scanner" && (
        <div className="flex flex-1 overflow-hidden">
          {/* Strategy 1 — Scanner */}
          <div className="w-1/2 border-r border-zinc-800 flex flex-col overflow-hidden">
            <ScannerPanel
              onSelectCandidates={(entries) => setOptimizerCandidates(entries)}
            />
          </div>

          {/* Strategy 2 — Optimizer */}
          <div className="w-1/2 flex flex-col overflow-hidden">
            {optimizerCandidates.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
                <span className="text-3xl text-zinc-700">◫</span>
                <p className="text-sm text-zinc-400 font-medium">Portfolio Optimizer</p>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Select trades from the scanner (left) and click{" "}
                  <span className="text-indigo-400">Optimize N selected →</span> to run the
                  greedy de-correlated portfolio optimizer.
                </p>
                <div className="mt-2 text-[11px] text-zinc-700 leading-relaxed max-w-xs">
                  Algorithm: sort candidates by edge → greedily accept if pairwise keyword
                  correlation with any selected trade is below the threshold.
                </div>
              </div>
            ) : (
              <QuantumPanel
                candidates={optimizerCandidates}
                onClear={() => setOptimizerCandidates([])}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
