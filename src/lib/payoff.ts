import { Position, PayoffPoint, PortfolioStats } from "@/types";

export function computePositionPnl(position: Position, probability: number): number {
  const q = probability / 100;
  const { direction, size, entryPrice } = position;

  if (direction === "YES") {
    if (entryPrice <= 0) return -size;
    return size * (q / entryPrice - 1);
  }

  const noPrice = 1 - entryPrice;
  if (noPrice <= 0) return -size;
  return size * ((1 - q) / noPrice - 1);
}

export function buildPayoffCurve(positions: Position[]): PayoffPoint[] {
  return Array.from({ length: 101 }, (_, i) => {
    const pnl = positions.reduce((sum, pos) => sum + computePositionPnl(pos, i), 0);
    const rounded = parseFloat(pnl.toFixed(4));
    return {
      probability: i,
      pnl: rounded,
      profit: rounded >= 0 ? rounded : 0,
      loss: rounded < 0 ? rounded : 0,
    };
  });
}

export function findBreakevenProb(positions: Position[]): number | null {
  const curve = buildPayoffCurve(positions);

  for (let i = 0; i < curve.length - 1; i++) {
    const curr = curve[i].pnl;
    const next = curve[i + 1].pnl;
    const crossesZero = (curr <= 0 && next >= 0) || (curr >= 0 && next <= 0);

    if (crossesZero && Math.abs(curr - next) > 0.0001) {
      const t = Math.abs(curr) / (Math.abs(curr) + Math.abs(next));
      return parseFloat((curve[i].probability + t).toFixed(1));
    }
  }

  return null;
}

export function computePortfolioStats(
  positions: Position[],
  currentProbability: number | null
): PortfolioStats | null {
  if (positions.length === 0) return null;

  const q = currentProbability !== null ? currentProbability * 100 : 50;

  const currentPnl = positions.reduce((sum, pos) => sum + computePositionPnl(pos, q), 0);
  const pnlAtYes = positions.reduce((sum, pos) => sum + computePositionPnl(pos, 100), 0);
  const pnlAtNo = positions.reduce((sum, pos) => sum + computePositionPnl(pos, 0), 0);
  const totalInvested = positions.reduce((sum, pos) => sum + pos.size, 0);

  return {
    totalInvested,
    currentPnl: parseFloat(currentPnl.toFixed(2)),
    maxProfit: parseFloat(Math.max(pnlAtYes, pnlAtNo).toFixed(2)),
    maxLoss: parseFloat(Math.min(pnlAtYes, pnlAtNo).toFixed(2)),
    breakevenProb: findBreakevenProb(positions),
  };
}
