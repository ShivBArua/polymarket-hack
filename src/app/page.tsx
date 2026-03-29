"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
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

// ── Panel section header ───────────────────────────────────────────────────────
function PanelHeader({
  title,
  sub,
  accent = "blue",
}: {
  title: string;
  sub?: string;
  accent?: "blue" | "green" | "amber" | "red";
}) {
  const colors: Record<string, string> = {
    blue:  "var(--accent)",
    green: "#059669",
    amber: "#D97706",
    red:   "#DC2626",
  };
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 border-b flex-shrink-0"
      style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
    >
      <span className="w-0.5 h-4 rounded-full flex-shrink-0" style={{ background: colors[accent] }} />
      <span className="text-[9px] font-bold tracking-[0.16em] uppercase" style={{ color: colors[accent] }}>
        {title}
      </span>
      {sub && (
        <span className="ml-auto text-[9px] font-mono tabular-nums" style={{ color: "var(--text-subtle)" }}>
          {sub}
        </span>
      )}
    </div>
  );
}

// ── Quote Monitor Strip ────────────────────────────────────────────────────────
function QuoteMonitor({
  orderBook,
  priceHistory,
  market,
}: {
  orderBook: OrderBook | null;
  priceHistory: PriceHistoryPoint[];
  market: Market | null;
}) {
  const bid    = orderBook?.bids?.[0]  ? parseFloat(orderBook.bids[0].price)  : null;
  const ask    = orderBook?.asks?.[0]  ? parseFloat(orderBook.asks[0].price)  : null;
  const spread = bid && ask ? ((ask - bid) * 100).toFixed(1) : null;
  const last   = priceHistory.length > 0 ? priceHistory[priceHistory.length - 1].price : null;
  const prev   = priceHistory.length > 1 ? priceHistory[priceHistory.length - 2].price : null;
  const chg    = last && prev ? (last - prev) * 100 : null;
  const bidDepth = orderBook?.bids?.reduce((s, e) => s + parseFloat(e.size), 0) ?? null;
  const askDepth = orderBook?.asks?.reduce((s, e) => s + parseFloat(e.size), 0) ?? null;

  const Cell = ({
    label, value, color, wide,
  }: {
    label: string; value: string | null; color?: string; wide?: boolean;
  }) => (
    <div
      className={clsx("flex flex-col justify-center gap-0.5 px-3 border-r h-full flex-shrink-0", wide && "min-w-[180px] max-w-[280px]")}
      style={{ borderColor: "var(--border)" }}
    >
      <span className="text-[8.5px] font-bold tracking-[0.14em] uppercase" style={{ color: "var(--text-subtle)" }}>
        {label}
      </span>
      <span className="text-[12px] font-mono font-semibold tabular-nums truncate" style={{ color: color ?? "var(--text)" }}>
        {value ?? "—"}
      </span>
    </div>
  );

  return (
    <div
      className="flex items-stretch flex-shrink-0 h-12 border-b overflow-x-auto"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <Cell label="INSTRUMENT" value={market?.question ?? "No market selected"} wide />
      <Cell label="BID"        value={bid  ? `${(bid  * 100).toFixed(2)}¢` : null} color="#059669" />
      <Cell label="ASK"        value={ask  ? `${(ask  * 100).toFixed(2)}¢` : null} color="#DC2626" />
      <Cell label="LAST"       value={last ? `${(last * 100).toFixed(2)}¢` : null} />
      <Cell
        label="CHG"
        value={chg !== null ? `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}¢` : null}
        color={chg === null ? undefined : chg >= 0 ? "#059669" : "#DC2626"}
      />
      <Cell label="SPREAD"    value={spread    ? `${spread}¢` : null} color="#D97706" />
      <Cell label="BID DEPTH" value={bidDepth  ? bidDepth.toLocaleString(undefined, { maximumFractionDigits: 0 }) : null} color="#059669" />
      <Cell label="ASK DEPTH" value={askDepth  ? askDepth.toLocaleString(undefined, { maximumFractionDigits: 0 }) : null} color="#DC2626" />
      <Cell label="TICKS"     value={priceHistory.length > 0 ? String(priceHistory.length) : null} />
      <div className="ml-auto flex items-center gap-1.5 px-4 flex-shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-[9px] font-bold tracking-wider" style={{ color: "#059669" }}>LIVE</span>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [tab, setTab] = useState<Tab>("lab");
  const [markets, setMarkets]               = useState<Market[]>([]);
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
  const [positions, setPositions]           = useState<Position[]>([]);
  const [orderBook, setOrderBook]           = useState<OrderBook | null>(null);
  const [priceHistory, setPriceHistory]     = useState<PriceHistoryPoint[]>([]);
  const [midPrice, setMidPrice]             = useState<number | null>(null);
  const [loadingMarkets, setLoadingMarkets] = useState(true);
  const [loadingData, setLoadingData]       = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [optimizerCandidates, setOptimizerCandidates] = useState<ScannerEntry[]>([]);

  // UTC clock
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const loadMarkets = useCallback((query: string) => {
    setLoadingMarkets(true);
    fetchMarkets(50, query)
      .then(setMarkets)
      .catch(console.error)
      .finally(() => setLoadingMarkets(false));
  }, []);

  useEffect(() => { loadMarkets(""); }, [loadMarkets]);

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
    if (!tokenId) { setLoadingData(false); return; }
    const [book, history] = await Promise.allSettled([fetchOrderBook(tokenId), fetchPriceHistory(tokenId)]);
    if (book.status    === "fulfilled") { setOrderBook(book.value); setMidPrice(getMidPrice(book.value)); }
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

  const tabs = [
    { id: "lab"      as Tab, label: "Strategy Lab",             icon: "M3 12 L6 7 L9 9.5 L12 4 L14 6" },
    { id: "scanner"  as Tab, label: "Analyze Individual Trades", icon: "M5 5 m-2.5 0 a2.5 2.5 0 1 0 5 0 a2.5 2.5 0 1 0 -5 0 M9 9 L13 13" },
    { id: "backtest" as Tab, label: "Backtester",               icon: "M2 8 L5 4 L8 6 L11 2 L13 4 M2 12 h11" },
    { id: "live"     as Tab, label: "Live Trader",              icon: "M12 3 C12 3 9 6 9 9 C9 12 12 13 12 13 C12 13 15 12 15 9 C15 6 12 3 12 3" },
  ];

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: "var(--bg)", color: "var(--text)" }}>

      {/* Nav */}
      <header className="flex-shrink-0 border-b" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <div className="h-14 flex items-center gap-4 px-5">

          {/* QEdge AI Logo */}
          <div className="flex items-center gap-2.5 select-none flex-shrink-0">
            <div className="w-9 h-9 flex-shrink-0 drop-shadow-sm">
              <Image src="/qedge-logo.svg" alt="QEdge AI" width={36} height={36} priority />
            </div>
            <div className="flex flex-col leading-none gap-0.5">
              <div className="flex items-baseline gap-0.5">
                <span className="text-[15px] font-bold tracking-tight" style={{ color: "var(--text)" }}>QEdge</span>
                <span className="text-[15px] font-bold tracking-tight" style={{ color: "var(--accent)" }}>AI</span>
              </div>
              <span className="text-[8px] font-semibold tracking-[0.2em] uppercase" style={{ color: "var(--text-subtle)" }}>
                Prediction Markets
              </span>
            </div>
          </div>

          {/* Divider */}
          <div className="h-6 w-px flex-shrink-0" style={{ background: "var(--border)" }} />

          {/* Tabs */}
          <nav className="flex items-stretch h-full gap-0.5">
            {tabs.map(({ id, label, icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={clsx(
                  "relative flex items-center gap-1.5 px-3 text-[11px] font-semibold tracking-wide transition-colors whitespace-nowrap",
                  tab === id
                    ? "text-[var(--accent)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text)]",
                )}
              >
                <svg width="11" height="11" viewBox="0 0 15 15" fill="none" className="flex-shrink-0">
                  <path d={icon} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {label}
                {id === "live" && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
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
          <div className="ml-auto flex items-center gap-3 flex-shrink-0">
            {/* UTC clock */}
            {tab === "lab" && (
              <div className="flex flex-col items-end leading-none gap-0.5">
                <span className="text-[11px] font-mono font-semibold tabular-nums" style={{ color: "var(--accent)" }}>
                  {now.toUTCString().slice(17, 25)} UTC
                </span>
                <span className="text-[8.5px] font-mono" style={{ color: "var(--text-subtle)" }}>
                  {now.toDateString()}
                </span>
              </div>
            )}

            {tab === "lab" && positions.length > 0 && stats ? (
              <>
                <div
                  className="flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1 rounded-full border"
                  style={{ borderColor: "var(--border)", color: "var(--text-muted)", background: "var(--surface-2)" }}
                >
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "var(--accent)" }} />
                  {positions.length} position{positions.length !== 1 ? "s" : ""}
                </div>
                <div
                  className={clsx(
                    "text-[11px] font-mono font-bold px-2.5 py-1 rounded-full border",
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
                style={{ borderColor: "var(--border)", color: "var(--text-subtle)", background: "var(--surface-2)" }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                Live
              </div>
            )}
          </div>
        </div>
      </header>

      {/* STRATEGY LAB */}
      {tab === "lab" && (
        <div className="flex flex-1 overflow-hidden">
          <aside
            className="w-72 flex flex-col overflow-hidden flex-shrink-0 border-r"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
          >
            <PanelHeader title="Market Search" sub="POLYMARKET · GAMMA" accent="blue" />
            <MarketSelector
              markets={markets}
              selected={selectedMarket}
              onSelect={handleSelectMarket}
              onSearch={handleSearch}
              loading={loadingMarkets}
            />
            <PanelHeader title="Position Builder" accent="amber" />
            <PositionBuilder
              market={selectedMarket}
              midPrice={midPrice}
              onAdd={handleAddPosition}
            />
            <PanelHeader
              title="Portfolio"
              sub={positions.length > 0 ? `${positions.length} POS` : undefined}
              accent="green"
            />
            <PortfolioPanel
              positions={positions}
              currentProbability={midPrice}
              onRemove={handleRemovePosition}
            />
          </aside>

          <main className="flex-1 flex flex-col overflow-hidden min-w-0">
            <QuoteMonitor orderBook={orderBook} priceHistory={priceHistory} market={selectedMarket} />

            <div className="grid grid-cols-4 gap-3 p-3 flex-shrink-0" style={{ background: "var(--bg)" }}>
              <StatCard
                label="Unrealized P&L"
                value={stats ? formatPnl(stats.currentPnl) : "—"}
                sub={midPrice !== null ? `at ${(midPrice * 100).toFixed(2)}¢ mid` : undefined}
                positive={stats ? stats.currentPnl >= 0 : undefined}
              />
              <StatCard
                label="Max Profit (YES)"
                value={stats ? `+$${stats.maxProfit.toFixed(2)}` : "—"}
                sub="if market resolves YES"
                positive={stats !== null}
              />
              <StatCard
                label="Max Loss (NO)"
                value={stats ? `-$${Math.abs(stats.maxLoss).toFixed(2)}` : "—"}
                sub="if market resolves NO"
                positive={false}
              />
              <StatCard
                label="Breakeven Prob"
                value={stats?.breakevenProb != null ? `${stats.breakevenProb.toFixed(1)}%` : "—"}
                sub="probability to break even"
              />
            </div>

            <div className="flex-1 grid grid-cols-2 gap-3 px-3 pb-3 min-h-0">
              <div
                className="flex flex-col overflow-hidden rounded-lg border"
                style={{ background: "var(--surface)", borderColor: "var(--border)" }}
              >
                <PanelHeader title="Order Book" sub={selectedMarket ? "YES TOKEN · L2 DEPTH" : undefined} accent="green" />
                <div className="flex-1 overflow-auto p-3">
                  {loadingData ? (
                    <div className="h-full flex items-center justify-center text-xs" style={{ color: "var(--text-subtle)" }}>Loading…</div>
                  ) : (
                    <OrderBookComponent orderBook={orderBook} />
                  )}
                </div>
              </div>

              <div
                className="flex flex-col overflow-hidden rounded-lg border"
                style={{ background: "var(--surface)", borderColor: "var(--border)" }}
              >
                <PanelHeader title="Price History" sub={priceHistory.length > 0 ? `${priceHistory.length} ticks · 1D CLOB` : undefined} accent="blue" />
                <div className="flex-1 overflow-hidden p-3">
                  {loadingData ? (
                    <div className="h-full flex items-center justify-center text-xs" style={{ color: "var(--text-subtle)" }}>Loading…</div>
                  ) : (
                    <PriceHistoryChart data={priceHistory} />
                  )}
                </div>
              </div>
            </div>

            {/* Status bar */}
            <div
              className="flex items-center gap-3 px-4 h-6 flex-shrink-0 border-t text-[9px] font-mono"
              style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-subtle)" }}
            >
              <span className="font-bold" style={{ color: "var(--accent)" }}>QEDGE AI</span>
              <span>STRATEGY LAB</span>
              <span style={{ color: "var(--border-strong)" }}>|</span>
              {selectedMarket ? (
                <span className="truncate max-w-xs" style={{ color: "var(--text-muted)" }}>
                  {selectedMarket.conditionId ? `COND: ${selectedMarket.conditionId.slice(0, 16)}…` : selectedMarket.question}
                </span>
              ) : (
                <span>NO MARKET SELECTED</span>
              )}
              <span className="ml-auto flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span style={{ color: "#059669" }}>PAPER MODE · CONNECTED</span>
              </span>
            </div>
          </main>
        </div>
      )}

      {/* ANALYZE INDIVIDUAL TRADES */}
      {tab === "scanner" && (
        <div className="flex flex-1 overflow-hidden">
          <div className="w-1/2 flex flex-col overflow-hidden border-r" style={{ borderColor: "var(--border)" }}>
            <ScannerPanel onSelectCandidates={setOptimizerCandidates} />
          </div>
          <div className="w-1/2 flex flex-col overflow-hidden">
            {optimizerCandidates.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
                <div
                  className="w-10 h-10 rounded-lg border-2 flex items-center justify-center mb-1"
                  style={{ borderColor: "var(--border-strong)", color: "var(--text-subtle)" }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" />
                  </svg>
                </div>
                <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Portfolio Optimizer</p>
                <p className="text-xs leading-relaxed max-w-xs" style={{ color: "var(--text-muted)" }}>
                  Select trades from the scanner and click{" "}
                  <span style={{ color: "var(--accent)" }}>Optimize N selected</span>{" "}
                  to run the greedy de-correlated portfolio optimizer.
                </p>
                <p className="text-[11px] leading-relaxed max-w-xs" style={{ color: "var(--text-subtle)" }}>
                  Sorts candidates by edge, accepts each trade only if its keyword correlation with all selected trades is below the threshold.
                </p>
              </div>
            ) : (
              <QuantumPanel candidates={optimizerCandidates} onClear={() => setOptimizerCandidates([])} />
            )}
          </div>
        </div>
      )}

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
