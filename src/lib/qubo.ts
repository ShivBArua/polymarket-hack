/**
 * Quantum-Inspired QUBO Portfolio Optimizer
 *
 * Solves the same QUBO formulation as the Qiskit notebook using
 * Simulated Annealing (SA) — the classical analogue of QAOA.
 *
 * QUBO objective (minimize):
 *   H(x) = −∑ edge_i·x_i
 *           + riskLambda · ∑ risk_i·x_i
 *           + corrLambda · ∑_{i<j} corr_ij·x_i·x_j
 *           + penalty · max(0, ∑ size_i·x_i − bankroll)²
 *           + penalty · max(0, ∑ x_i − maxPositions)²
 *
 * where x_i ∈ {0,1}.  SA explores the energy landscape by accepting
 * uphill moves with probability exp(−ΔH / T), with T annealed from
 * T_start → T_end.  Multiple restarts keep the best solution found.
 */

import { ScannerEntry, QUBOResult } from "@/types";

// ── Stop words ────────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "the","a","an","is","are","was","were","be","been","being","have","has",
  "had","do","does","did","will","would","could","should","may","might",
  "shall","can","to","of","in","on","at","by","for","with","from","this",
  "that","it","its","as","or","and","but","not","no","yes","if","than",
  "then","so","yet","both","also","just","over","before","after","when",
  "while","where","how","what","which","who","whom","all","each","any",
]);

function keywords(question: string): Set<string> {
  return new Set(
    question
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  a.forEach((w) => { if (b.has(w)) intersection++; });
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ── Correlation matrix ────────────────────────────────────────────────────────

export function buildCorrelationMatrix(entries: ScannerEntry[]): number[][] {
  const n = entries.length;
  const kw = entries.map((e) => keywords(e.question));
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) =>
      i === j ? 1 : jaccard(kw[i], kw[j])
    )
  );
}

// ── Derived trade attributes (mirrors notebook columns) ───────────────────────

/**
 * Risk score per trade: normalized bid-ask spread.
 * Wider spread → less liquid → riskier.  Capped at 1.0.
 */
export function buildRiskScores(entries: ScannerEntry[]): number[] {
  return entries.map((e) => Math.min(1.0, e.spread / 0.20));
}

/**
 * Position size in dollars: rough fractional-Kelly heuristic.
 * Mirrors the Live Trader sizing: clamp(edge × 100, $2, $25).
 */
export function buildSizeDollars(entries: ScannerEntry[]): number[] {
  return entries.map((e) => Math.max(2, Math.min(25, e.edge * 100)));
}

// ── QUBO energy function ──────────────────────────────────────────────────────

function computeEnergy(
  x: boolean[],
  edges: number[],
  risks: number[],
  sizes: number[],
  corr: number[][],
  riskLambda: number,
  corrLambda: number,
  bankroll: number,
  maxPositions: number,
  penalty: number
): number {
  const n = x.length;
  let reward = 0;
  let riskTerm = 0;
  let corrTerm = 0;
  let totalSize = 0;
  let totalCount = 0;

  for (let i = 0; i < n; i++) {
    if (x[i]) {
      reward += edges[i];
      riskTerm += riskLambda * risks[i];
      totalSize += sizes[i];
      totalCount++;
    }
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (x[i] && x[j]) {
        corrTerm += corrLambda * corr[i][j];
      }
    }
  }

  // Soft penalty for budget and position-count violations
  const budgetViol = Math.max(0, totalSize - bankroll);
  const posViol = Math.max(0, totalCount - maxPositions);

  return (
    -reward +
    riskTerm +
    corrTerm +
    penalty * budgetViol * budgetViol +
    penalty * posViol * posViol
  );
}

// ── Simulated Annealing solver ────────────────────────────────────────────────

const SA_RESTARTS = 5;
const T_START = 1.0;
const T_END = 0.001;

function simulatedAnnealing(
  entries: ScannerEntry[],
  corr: number[][],
  riskLambda: number,
  corrLambda: number,
  bankroll: number,
  maxPositions: number
): { mask: boolean[]; energy: number; totalIter: number } {
  const n = entries.length;
  const edges = entries.map((e) => e.edge);
  const risks = buildRiskScores(entries);
  const sizes = buildSizeDollars(entries);
  const penalty = 10.0;

  const maxIter = Math.max(5000, n * 500);
  const alpha = Math.pow(T_END / T_START, 1 / maxIter);

  let bestMask: boolean[] = new Array(n).fill(false);
  let bestEnergy = computeEnergy(
    bestMask, edges, risks, sizes, corr,
    riskLambda, corrLambda, bankroll, maxPositions, penalty
  );

  for (let r = 0; r < SA_RESTARTS; r++) {
    // Random initial solution with ~30% activation probability
    const x: boolean[] = Array.from({ length: n }, () => Math.random() < 0.3);
    let E = computeEnergy(x, edges, risks, sizes, corr, riskLambda, corrLambda, bankroll, maxPositions, penalty);
    let T = T_START;

    for (let iter = 0; iter < maxIter; iter++) {
      const i = Math.floor(Math.random() * n);
      x[i] = !x[i];
      const newE = computeEnergy(x, edges, risks, sizes, corr, riskLambda, corrLambda, bankroll, maxPositions, penalty);
      const dE = newE - E;

      if (dE < 0 || Math.random() < Math.exp(-dE / T)) {
        E = newE;
        if (E < bestEnergy) {
          bestEnergy = E;
          bestMask = [...x];
        }
      } else {
        x[i] = !x[i]; // revert
      }

      T *= alpha;
    }
  }

  return { mask: bestMask, energy: bestEnergy, totalIter: maxIter * SA_RESTARTS };
}

// ── Main exported optimizer ───────────────────────────────────────────────────

export function optimizePortfolio(
  candidates: ScannerEntry[],
  corrLambda: number,   // correlation penalty (was "lambda")
  maxPositions: number,
  riskLambda = 0.08,
  bankroll = 200
): QUBOResult {
  const corr = buildCorrelationMatrix(candidates);
  const { mask, energy, totalIter } = simulatedAnnealing(
    candidates, corr, riskLambda, corrLambda, bankroll, maxPositions
  );

  const selected = candidates.filter((_, i) => mask[i]);
  const rejected = candidates.filter((_, i) => !mask[i]);
  const edgeVector = candidates.map((c) => c.edge);

  const totalEdge = selected.reduce((s, c) => s + c.edge, 0);

  let totalRisk = 0;
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      if (mask[i] && mask[j]) {
        totalRisk += corr[i][j];
      }
    }
  }

  return {
    selected,
    rejected,
    totalEdge,
    totalRisk,
    correlationMatrix: corr,
    edgeVector,
    finalEnergy: energy,
    iterations: totalIter,
  };
}
