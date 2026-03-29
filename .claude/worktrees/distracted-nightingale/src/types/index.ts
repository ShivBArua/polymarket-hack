export interface Token {
  token_id: string;
  outcome: string;
}

export interface Market {
  id: string;
  question: string;
  tokens: Token[];
  volume: number;
  conditionId: string;
}

export type Direction = "YES" | "NO";

export interface Position {
  id: string;
  marketId: string;
  marketQuestion: string;
  tokenId: string;
  direction: Direction;
  size: number;
  entryPrice: number;
  outcome: string;
}

export interface OrderBookEntry {
  price: string;
  size: string;
}

export interface OrderBook {
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
}

export interface PriceHistoryPoint {
  timestamp: number;
  datetime: string;
  price: number;
}

export interface PayoffPoint {
  probability: number;
  pnl: number;
  profit: number;
  loss: number;
}

export interface PortfolioStats {
  totalInvested: number;
  currentPnl: number;
  maxProfit: number;
  maxLoss: number;
  breakevenProb: number | null;
}

// ── Strategy 1: Low-Latency Scanner ──────────────────────────────────────────

export type Urgency = "critical" | "high" | "medium" | "low";

export interface ScannerEntry {
  id: string;
  question: string;
  conditionId: string;
  tokenIdYes: string;
  tokenIdNo: string;
  volume: number;
  best_bid: number;
  best_ask: number;
  last_trade_price: number | null;
  end_date: string | null;
  mid: number;
  spread: number;
  edge: number;
  direction: Direction;
  daysToResolution: number | null;
  urgency: Urgency;
}

// ── Strategy 2: Quantum-Inspired QUBO Optimizer ───────────────────────────────

export interface QUBOInput {
  candidates: ScannerEntry[];
  lambda: number;
  maxPositions: number;
}

export interface QUBOResult {
  selected: ScannerEntry[];
  rejected: ScannerEntry[];
  totalEdge: number;
  totalRisk: number;
  correlationMatrix: number[][];
  edgeVector: number[];
  finalEnergy: number;
  iterations: number;
}
