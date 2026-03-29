"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import clsx from "clsx";
import {
  Market,
  Position,
  OrderBook,
  PriceHistoryPoint,
  ScannerEntry,
} from "@/types";
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
import { LiveTraderPanel } from "@/components/LiveTraderPanel";

type Tab = "lab" | "scanner" | "backtest" | "live";

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

  const [optimizerCandidates, setOptimizerCandidates] = useState<
    ScannerEntry[]
  >([]);

  const loadMarkets = useCallback((query: string) => {
    setLoadingMarkets(true);
    fetchMarkets(50, query)
      .then(setMarkets)
      .catch(console.error)
      .finally(() => setLoadingMarkets(false));
  }, []);

  useEffect(() => {
    loadMarkets("");
  }, [loadMarkets]);

  const handleSearch = useCallback(
    (query: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => loadMarkets(query), 300);
    },
    [loadMarkets],
  );

  const handleSelectMarket = useCallback(async (market: Market) => {
    setSelectedMarket(market);
    setOrderBook(null);
    setPriceHistory([]);
    setMidPrice(null);
    setLoadingData(true);

    const tokenId = market.tokens[0]?.token_id;
    if (!tokenId) {
      setLoadingData(false);
      return;
    }

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
    <div
      className="h-screen flex flex-col overflow-hidden"
      style={{ background: "var(--bg)", color: "var(--text)" }}
    >
      {/* Nav */}
      <header
        className="flex-shrink-0 border-b"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div className="h-14 flex items-center gap-5 px-6">
          {/* Logo */}
          <div className="flex items-center gap-2.5 select-none flex-shrink-0">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shadow-sm"
              style={{ background: "var(--accent)" }}
            >
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                <path
                  d="M2 13 L5.5 6.5 L8.5 9.5 L11.5 3 L13.5 5.5"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div className="flex flex-col leading-none gap-0.5">
              <span
                className="text-[13px] font-bold tracking-tight"
                style={{ color: "var(--text)" }}
              >
                Polymarket
              </span>
              <span
                className="text-[9px] font-semibold tracking-[0.12em] uppercase"
                style={{ color: "var(--accent)" }}
              >
                Strategy Lab
              </span>
            </div>
          </div>

          {/* Divider */}
          <div
            className="h-6 w-px flex-shrink-0"
            style={{ background: "var(--border)" }}
          />

          {/* Tabs — underline style, flush with bottom border */}
          <nav className="flex items-stretch h-full gap-1">
            {(
              [
                {
                  id: "lab",
                  label: "Strategy Lab",
                  icon: "M3 12 L6 7 L9 9.5 L12 4 L14 6",
                },
                {
                  id: "scanner",
                  label: "Scanner & Optimizer",
                  icon: "M5 5 m-2.5 0 a2.5 2.5 0 1 0 5 0 a2.5 2.5 0 1 0 -5 0 M9 9 L13 13",
                },
                {
                  id: "backtest",
                  label: "Backtester",
                  icon: "M2 8 L5 4 L8 6 L11 2 L13 4 M2 12 h11",
                },
                {
                  id: "live",
                  label: "Live Trader",
                  icon: "M12 3 C12 3 9 6 9 9 C9 12 12 13 12 13 C12 13 15 12 15 9 C15 6 12 3 12 3 M4 12 h2 M10 12 h2",
                },
              ] as { id: Tab; label: string; icon: string }[]
            ).map(({ id, label, icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={clsx(
                  "relative flex items-center gap-1.5 px-3 text-xs font-medium transition-colors",
                  tab === id
                    ? "text-[var(--accent)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text)]",
                )}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 15 15"
                  fill="none"
                  className="flex-shrink-0"
                >
                  <path
                    d={icon}
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {label}
                {id === "live" && (
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                )}
                {tab === id && (
                  <span
                    className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full"
                    style={{ background: "var(--accent)" }}
                  />
                )}
              </button>
            ))}
          </nav>

          {/* Right side */}
          <div className="ml-auto flex items-center gap-3">
            {tab === "lab" && positions.length > 0 && stats ? (
              <>
                <div
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border"
                  style={{
                    borderColor: "var(--border)",
                    color: "var(--text-muted)",
                    background: "var(--surface-2)",
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: "var(--accent)" }}
                  />
                  {positions.length} position{positions.length !== 1 ? "s" : ""}
                </div>
                <div
                  className={clsx(
                    "text-xs font-semibold px-2.5 py-1 rounded-full border",
                    stats.currentPnl >= 0
                      ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                      : "text-red-600 bg-red-50 border-red-200",
                  )}
                >
                  {formatPnl(stats.currentPnl)} P&amp;L
                </div>
              </>
            ) : (
              <div
                className="flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1 rounded-full border"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--text-subtle)",
                  background: "var(--surface-2)",
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                Live
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Strategy Lab */}
      {tab === "lab" && (
        <div className="flex flex-1 overflow-hidden">
          <aside
            className="w-72 flex flex-col overflow-hidden flex-shrink-0 border-r bg-white"
            style={{ borderColor: "var(--border)" }}
          >
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
                sub={
                  midPrice !== null
                    ? `at ${(midPrice * 100).toFixed(1)}% mid`
                    : undefined
                }
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
                value={
                  stats?.breakevenProb != null
                    ? `${stats.breakevenProb.toFixed(1)}%`
                    : "—"
                }
                sub="probability to break even"
              />
            </div>

            <div className="flex-1 grid grid-cols-2 gap-3 min-h-0">
              {[orderBook, priceHistory].map((_, i) => (
                <div
                  key={i}
                  className="bg-white border rounded-lg p-4 overflow-hidden"
                  style={{ borderColor: "var(--border)" }}
                >
                  {loadingData ? (
                    <div
                      className="h-full flex items-center justify-center text-xs"
                      style={{ color: "var(--text-subtle)" }}
                    >
                      Loading…
                    </div>
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
          <div
            className="w-1/2 flex flex-col overflow-hidden border-r"
            style={{ borderColor: "var(--border)" }}
          >
            <ScannerPanel onSelectCandidates={setOptimizerCandidates} />
          </div>
          <div className="w-1/2 flex flex-col overflow-hidden">
            {optimizerCandidates.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
                <div
                  className="w-10 h-10 rounded-lg border-2 flex items-center justify-center mb-1"
                  style={{
                    borderColor: "var(--border-strong)",
                    color: "var(--text-subtle)",
                  }}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" />
                  </svg>
                </div>
                <p
                  className="text-sm font-semibold"
                  style={{ color: "var(--text)" }}
                >
                  Portfolio Optimizer
                </p>
                <p
                  className="text-xs leading-relaxed max-w-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  Select trades from the scanner and click{" "}
                  <span style={{ color: "var(--accent)" }}>
                    Optimize N selected
                  </span>{" "}
                  to run the greedy de-correlated portfolio optimizer.
                </p>
                <p
                  className="text-[11px] leading-relaxed max-w-xs"
                  style={{ color: "var(--text-subtle)" }}
                >
                  Sorts candidates by edge, accepts each trade only if its
                  keyword correlation with all selected trades is below the
                  threshold.
                </p>
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

      {/* Backtester */}
      {tab === "backtest" && (
        <div className="flex flex-1 min-w-0 overflow-hidden">
          <BacktestPanel />
        </div>
      )}

      {tab === "live" && (
        <div className="flex flex-1 min-w-0 overflow-hidden">
          <LiveTraderPanel />
        </div>
      )}
    </div>
  );
}
