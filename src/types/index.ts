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
