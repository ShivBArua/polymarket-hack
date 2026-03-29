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
import { OrderBook as OrderBookComponent } from "@/components/OrderBook";
import { PriceHistoryChart } from "@/components/PriceHistoryChart";
import { StatCard } from "@/components/StatCard";
import { ScannerPanel } from "@/components/ScannerPanel";
import { QuantumPanel } from "@/components/QuantumPanel";
import { BacktestPanel } from "@/components/BacktestPanel";

type Tab = "lab" | "scanner" | "backtest";

export default function HomePage() {
  const [tab, setTab] = useState<Tab>("lab");

  const [markets, setMarkets] = useState<Market[]>([]);
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [orderBook, setOrderBook] = useState<OrderBook | null>(null);
  const [priceHistory, setPriceHistory] = useState<PriceHistoryPoint[]>([]);
  const [midPrice, setMidPrice] = useState<number | null>(null);
  const [loadingMarkets, setLoadingMarkets] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [optimizerCandidates, setOptimizerCandidates] = useState<ScannerEntry[]>([]);

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
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: "var(--bg)", color: "var(--text)" }}>

      {/* Nav */}
      <header className="h-12 border-b flex items-center gap-4 px-5 flex-shrink-0 bg-white"
        style={{ borderColor: "var(--border)" }}>
        <span className="font-bold text-sm tracking-tight" style={{ color: "var(--accent)" }}>
          Polymarket Lab
        </span>

        <nav className="flex items-center gap-0.5 ml-2">
          {([
            { id: "lab",      label: "Strategy Lab" },
            { id: "scanner",  label: "Scanner & Optimizer" },
            { id: "backtest", label: "Backtester" },
          ] as { id: Tab; label: string }[]).map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={clsx(
                "px-3 py-1 text-xs rounded transition-colors font-medium border",
                tab === id
                  ? "border-[var(--accent-border)] text-[var(--accent)]"
                  : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]"
              )}
              style={tab === id ? { background: "var(--accent-bg)" } : {}}
            >
              {label}
            </button>
          ))}
        </nav>

        {tab === "lab" && positions.length > 0 && stats && (
          <div className="ml-auto flex items-center gap-4 text-xs">
            <span style={{ color: "var(--text-subtle)" }}>
              {positions.length} position{positions.length !== 1 ? "s" : ""}
            </span>
            <span className={stats.currentPnl >= 0 ? "text-emerald-700 font-medium" : "text-red-600 font-medium"}>
              {formatPnl(stats.currentPnl)} unrealized
            </span>
          </div>
        )}
      </header>

      {/* Strategy Lab */}
      {tab === "lab" && (
        <div className="flex flex-1 overflow-hidden">
          <aside className="w-72 flex flex-col overflow-hidden flex-shrink-0 border-r bg-white"
            style={{ borderColor: "var(--border)" }}>
            <MarketSelector
              markets={markets}
              selected={selectedMarket}
              onSelect={handleSelectMarket}
              onSearch={handleSearch}
              loading={loadingMarkets}
            />
            <PositionBuilder market={selectedMarket} midPrice={midPrice} onAdd={handleAddPosition} />
            <PortfolioPanel positions={positions} currentProbability={midPrice} onRemove={handleRemovePosition} />
          </aside>

          <main className="flex-1 flex flex-col overflow-hidden p-4 gap-3 min-w-0">
            <div className="grid grid-cols-4 gap-3 flex-shrink-0">
              <StatCard label="Unrealized P&L"
                value={stats ? formatPnl(stats.currentPnl) : "—"}
                sub={midPrice !== null ? `at ${(midPrice * 100).toFixed(1)}% mid` : undefined}
                positive={stats ? stats.currentPnl >= 0 : undefined} />
              <StatCard label="Max Profit (YES)"
                value={stats ? `$${stats.maxProfit.toFixed(2)}` : "—"}
                sub="if market resolves YES" positive={stats !== null} />
              <StatCard label="Max Loss (NO)"
                value={stats ? `$${stats.maxLoss.toFixed(2)}` : "—"}
                sub="if market resolves NO" positive={false} />
              <StatCard label="Breakeven"
                value={stats?.breakevenProb != null ? `${stats.breakevenProb.toFixed(1)}%` : "—"}
                sub="probability to break even" />
            </div>

            <div className="flex-1 grid grid-cols-2 gap-3 min-h-0">
              {[orderBook, priceHistory].map((_, i) => (
                <div key={i} className="bg-white border rounded-lg p-4 overflow-hidden"
                  style={{ borderColor: "var(--border)" }}>
                  {loadingData ? (
                    <div className="h-full flex items-center justify-center text-xs"
                      style={{ color: "var(--text-subtle)" }}>Loading…</div>
                  ) : i === 0 ? (
                    <OrderBookComponent orderBook={orderBook} />
                  ) : (
                    <PriceHistoryChart data={priceHistory} />
                  )}
                </div>
              ))}
            </div>
          </main>
        </div>
      )}

      {/* Scanner & Optimizer */}
      {tab === "scanner" && (
        <div className="flex flex-1 overflow-hidden">
          <div className="w-1/2 flex flex-col overflow-hidden border-r" style={{ borderColor: "var(--border)" }}>
            <ScannerPanel onSelectCandidates={setOptimizerCandidates} />
          </div>
          <div className="w-1/2 flex flex-col overflow-hidden">
            {optimizerCandidates.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
                <div className="w-10 h-10 rounded-lg border-2 flex items-center justify-center mb-1"
                  style={{ borderColor: "var(--border-strong)", color: "var(--text-subtle)" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
                    <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
                  </svg>
                </div>
                <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Portfolio Optimizer</p>
                <p className="text-xs leading-relaxed max-w-xs" style={{ color: "var(--text-muted)" }}>
                  Select trades from the scanner and click{" "}
                  <span style={{ color: "var(--accent)" }}>Optimize N selected</span> to run the
                  greedy de-correlated portfolio optimizer.
                </p>
                <p className="text-[11px] leading-relaxed max-w-xs" style={{ color: "var(--text-subtle)" }}>
                  Sorts candidates by edge, accepts each trade only if its keyword correlation
                  with all selected trades is below the threshold.
                </p>
              </div>
            ) : (
              <QuantumPanel candidates={optimizerCandidates} onClear={() => setOptimizerCandidates([])} />
            )}
          </div>
        </div>
      )}

      {/* Backtester */}
      {tab === "backtest" && (
        <div className="flex flex-1 min-w-0 overflow-hidden">
          <BacktestPanel />
        </div>
      )}
    </div>
  );
}
