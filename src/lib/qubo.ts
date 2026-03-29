/**
 * Classical Portfolio Optimizer
 *
 * Selects the best basket of prediction-market trades by:
 *   1. Ranking candidates by estimated edge
 *   2. Building a keyword-based correlation matrix (Jaccard similarity)
 *   3. Greedy selection: add a trade only if its max pairwise correlation
 *      with already-selected trades is below a threshold, and the
 *      position count limit has not been reached
 *
 * This is the classical analogue of quantum annealing / QUBO optimization.
 * The correlation matrix and objective function structure mirror the QUBO
 * formulation described in quantum portfolio optimization literature:
 *
 *   H(x) = −∑ edge_i·x_i  +  λ · ∑_{i<j} corr_ij·x_i·x_j
 *
 * where x_i ∈ {0,1} is solved greedily here rather than via annealing.
 */

import { ScannerEntry, QUBOResult } from "@/types";

// ── Keyword-based Jaccard similarity ─────────────────────────────────────────

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

// ── Greedy optimizer ──────────────────────────────────────────────────────────

/**
 * Greedy forward selection:
 *   Sort by edge desc → iterate candidates →
 *   accept if max corr with any already-selected trade < corrThreshold
 */
function greedySelect(
  entries: ScannerEntry[],
  correlations: number[][],
  maxPositions: number,
  corrThreshold: number
): boolean[] {
  const n = entries.length;
  // rank by edge descending
  const order = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => entries[b].edge - entries[a].edge
  );

  const selected = new Array(n).fill(false);
  const selectedIdxs: number[] = [];

  for (const i of order) {
    if (selectedIdxs.length >= maxPositions) break;
    // check max correlation with currently selected trades
    const maxCorr =
      selectedIdxs.length === 0
        ? 0
        : Math.max(...selectedIdxs.map((j) => correlations[i][j]));
    if (maxCorr < corrThreshold) {
      selected[i] = true;
      selectedIdxs.push(i);
    }
  }

  return selected;
}

// ── Main exported optimizer ───────────────────────────────────────────────────

export function optimizePortfolio(
  candidates: ScannerEntry[],
  lambda: number,      // repurposed as correlation threshold (0–1)
  maxPositions: number
): QUBOResult {
  const correlations = buildCorrelationMatrix(candidates);
  // lambda controls how strict the de-correlation filter is
  // lambda=0 → accept all (pure edge), lambda=1 → reject any overlap
  const corrThreshold = Math.max(0.05, 1 - lambda);

  const selected_mask = greedySelect(
    candidates,
    correlations,
    maxPositions,
    corrThreshold
  );

  const selected = candidates.filter((_, i) => selected_mask[i]);
  const rejected = candidates.filter((_, i) => !selected_mask[i]);
  const edgeVector = candidates.map((c) => c.edge);

  const totalEdge = selected.reduce((s, c) => s + c.edge, 0);

  let totalRisk = 0;
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      if (selected_mask[i] && selected_mask[j]) {
        totalRisk += correlations[i][j];
      }
    }
  }

  // Objective value: H = -totalEdge + lambda * totalRisk (lower = better)
  const finalEnergy = -totalEdge + lambda * totalRisk;

  return {
    selected,
    rejected,
    totalEdge,
    totalRisk,
    correlationMatrix: correlations,
    edgeVector,
    finalEnergy,
    iterations: candidates.length, // greedy passes = n
  };
}
