/**
 * QAOA + SA Portfolio Optimizer
 *
 * Implements the QAOA circuit described in "QAOA Circuit Interpretation"
 * (Luis Mendez, 2026) as a classical state-vector simulation.
 *
 * QAOA pipeline (p = 1):
 *   1. |ψ₀⟩ = H^⊗n |0…0⟩          — equal superposition over all 2^n bitstrings
 *   2. UC(γ) = e^{-iγC}             — Rz gates (linear hᵢ) + ZZ gates (quadratic Jᵢⱼ)
 *   3. UM(β) = e^{-iβ∑Xᵢ}          — Rx(β) mixer on each qubit
 *   4. Measure → highest-probability feasible bitstring
 *
 * Ising mapping from QUBO (maximise C(z)):
 *   hᵢ   = edgeᵢ − λ_risk·riskᵢ  − P·(sizeᵢ²−2·bankroll·sizeᵢ) − P·(1−2·K)
 *   Jᵢⱼ = −λ_corr·corrᵢⱼ          − 2P·sizeᵢ·sizeⱼ             − 2P
 *
 * where K = maxPositions and P = penalty.
 *
 * For n > QAOA_MAX_QUBITS the solver falls back to Simulated Annealing
 * (same QUBO energy function, classical exploration).
 */

import { ScannerEntry, QUBOResult } from "@/types";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Max qubits for exact state-vector QAOA simulation (2^n states in memory). */
const QAOA_MAX_QUBITS = 16;

/** γ grid points over [0, π] */
const GAMMA_STEPS = 6;
/** β grid points over [0, π/2] */
const BETA_STEPS = 6;

/** Penalty coefficient for constraint violations embedded in Ising operator. */
const PENALTY = 1.5;

/** SA hyper-parameters (fallback for large n) */
const SA_RESTARTS = 5;
const T_START = 1.0;
const T_END = 0.001;

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

// ── Derived trade attributes ──────────────────────────────────────────────────

/** Risk score: normalised bid-ask spread. Capped at 1.0. */
export function buildRiskScores(entries: ScannerEntry[]): number[] {
  return entries.map((e) => Math.min(1.0, e.spread / 0.20));
}

/** Position size ($): fractional Kelly, clamped to [$2, $25]. */
export function buildSizeDollars(entries: ScannerEntry[]): number[] {
  return entries.map((e) => Math.max(2, Math.min(25, e.edge * 100)));
}

// ── Ising coefficients (from QUBO → Ising mapping) ───────────────────────────
//
// Constraints encoded as soft penalties expanded over z_i ∈ {0,1}:
//   (∑ sᵢzᵢ − B)² = ∑ᵢ(sᵢ²−2Bsᵢ)zᵢ + 2∑ᵢ<ⱼ sᵢsⱼzᵢzⱼ + B²   (z²=z for bits)
//   (∑ zᵢ − K)²   = ∑ᵢ(1−2K)zᵢ    + 2∑ᵢ<ⱼ zᵢzⱼ              + K²

function buildIsing(
  n: number,
  edges: number[],
  risks: number[],
  sizes: number[],
  corr: number[][],
  riskLambda: number,
  corrLambda: number,
  bankroll: number,
  maxPositions: number
): { h: number[]; J: number[][] } {
  const h: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    h[i] =
      edges[i] - riskLambda * risks[i]
      - PENALTY * (sizes[i] * sizes[i] - 2 * bankroll * sizes[i])
      - PENALTY * (1 - 2 * maxPositions);
  }

  const J: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      J[i][j] =
        -corrLambda * corr[i][j]
        - 2 * PENALTY * sizes[i] * sizes[j]
        - 2 * PENALTY;
    }
  }

  return { h, J };
}

// ── Objective value C(z) ─────────────────────────────────────────────────────

function objectiveC(z: number, h: number[], J: number[][], n: number): number {
  let C = 0;
  for (let i = 0; i < n; i++) {
    const zi = (z >> i) & 1;
    C += h[i] * zi;
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      C += J[i][j] * ((z >> i) & 1) * ((z >> j) & 1);
    }
  }
  return C;
}

// ── QAOA state-vector simulator (p = 1) ──────────────────────────────────────

/**
 * Simulates one QAOA layer on n qubits.
 * Returns probability distribution over all 2^n bitstrings.
 *
 * Step 1: |ψ₁⟩ = H^⊗n |0⟩  →  uniform amplitudes 1/√N
 * Step 2: UC(γ): ψ[z] *= e^{-iγC(z)}
 * Step 3: UM(β): Rx(β) on each qubit  →  entangles amplitudes
 * Step 4: return |ψ[z]|²
 */
function qaoaSimulate(
  n: number,
  h: number[],
  J: number[][],
  gamma: number,
  beta: number
): Float64Array {
  const N = 1 << n;
  const invSqrtN = 1 / Math.sqrt(N);

  // Step 1: equal superposition
  const re = new Float64Array(N).fill(invSqrtN);
  const im = new Float64Array(N);   // all zero

  // Step 2: cost unitary UC(γ) — phase rotation per bitstring
  for (let z = 0; z < N; z++) {
    const angle = -gamma * objectiveC(z, h, J, n);
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const r = re[z];
    // im[z] is 0 initially, so no need to read it
    re[z] = r * cosA;
    im[z] = r * sinA;
  }

  // Step 3: mixer UM(β) — Rx(β) on each qubit independently
  // Rx(β): |0⟩ → cosβ|0⟩ − i sinβ|1⟩
  //         |1⟩ → −i sinβ|0⟩ + cosβ|1⟩
  // Applied bitwise: for each qubit i, mix pairs (z with bit i=0, z with bit i=1)
  const cosB = Math.cos(beta);
  const sinB = Math.sin(beta);

  for (let i = 0; i < n; i++) {
    const bit = 1 << i;
    for (let z = 0; z < N; z++) {
      if (z & bit) continue; // only process each pair once (z0 < z1)
      const z0 = z;
      const z1 = z | bit;

      const a = re[z0], b_ = im[z0]; // amplitude at z0 (bit i = 0)
      const c = re[z1], d = im[z1];  // amplitude at z1 (bit i = 1)

      // new_z0 = cosβ·(a+ib) + (−i sinβ)·(c+id) = (cosβ·a + sinβ·d) + i(cosβ·b − sinβ·c)
      // new_z1 = (−i sinβ)·(a+ib) + cosβ·(c+id) = (sinβ·b + cosβ·c) + i(−sinβ·a + cosβ·d)
      re[z0] = cosB * a + sinB * d;
      im[z0] = cosB * b_ - sinB * c;
      re[z1] = sinB * b_ + cosB * c;
      im[z1] = -sinB * a + cosB * d;
    }
  }

  // Step 4: probabilities
  const probs = new Float64Array(N);
  for (let z = 0; z < N; z++) {
    probs[z] = re[z] * re[z] + im[z] * im[z];
  }
  return probs;
}

/** Expected value ⟨ψ|C|ψ⟩ = ∑_z P(z)·C(z) */
function expectedValue(
  probs: Float64Array,
  h: number[],
  J: number[][],
  n: number
): number {
  const N = 1 << n;
  let ev = 0;
  for (let z = 0; z < N; z++) {
    ev += probs[z] * objectiveC(z, h, J, n);
  }
  return ev;
}

/** Run QAOA with grid search over γ ∈ (0,π] and β ∈ (0,π/2]. */
function runQAOA(
  entries: ScannerEntry[],
  corr: number[][],
  riskLambda: number,
  corrLambda: number,
  bankroll: number,
  maxPositions: number
): { mask: boolean[]; energy: number; gamma: number; beta: number } {
  const n = entries.length;
  const edges = entries.map((e) => e.edge);
  const risks = buildRiskScores(entries);
  const sizes = buildSizeDollars(entries);
  const { h, J } = buildIsing(n, edges, risks, sizes, corr, riskLambda, corrLambda, bankroll, maxPositions);

  // Grid search: find (γ*, β*) maximising ⟨C⟩
  let bestGamma = Math.PI / 2;
  let bestBeta = Math.PI / 4;
  let bestEV = -Infinity;

  for (let gi = 0; gi < GAMMA_STEPS; gi++) {
    for (let bi = 0; bi < BETA_STEPS; bi++) {
      const gamma = (Math.PI * (gi + 0.5)) / GAMMA_STEPS;
      const beta  = (Math.PI / 2 * (bi + 0.5)) / BETA_STEPS;
      const probs = qaoaSimulate(n, h, J, gamma, beta);
      const ev = expectedValue(probs, h, J, n);
      if (ev > bestEV) {
        bestEV = ev;
        bestGamma = gamma;
        bestBeta = beta;
      }
    }
  }

  // Final measurement with optimal parameters
  const probs = qaoaSimulate(n, h, J, bestGamma, bestBeta);
  const N = 1 << n;

  // Pick highest-probability bitstring that satisfies hard constraints
  let bestZ = 0;
  let bestProb = -1;
  for (let z = 0; z < N; z++) {
    if (probs[z] <= bestProb) continue;
    let totalSize = 0;
    for (let i = 0; i < n; i++) if ((z >> i) & 1) totalSize += sizes[i];
    if (totalSize <= bankroll && countBits(z) <= maxPositions) {
      bestProb = probs[z];
      bestZ = z;
    }
  }

  const mask = Array.from({ length: n }, (_, i) => Boolean((bestZ >> i) & 1));

  // Re-compute true QUBO energy for reporting
  const energy = computeQUBOEnergy(mask, edges, risks, sizes, corr, riskLambda, corrLambda, bankroll, maxPositions);

  return { mask, energy, gamma: bestGamma, beta: bestBeta };
}

function countBits(z: number): number {
  let c = 0;
  while (z) { c += z & 1; z >>>= 1; }
  return c;
}

// ── QUBO energy (for reporting and SA) ───────────────────────────────────────

function computeQUBOEnergy(
  x: boolean[],
  edges: number[],
  risks: number[],
  sizes: number[],
  corr: number[][],
  riskLambda: number,
  corrLambda: number,
  bankroll: number,
  maxPositions: number
): number {
  const n = x.length;
  let reward = 0, riskTerm = 0, corrTerm = 0, totalSize = 0, totalCount = 0;

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
      if (x[i] && x[j]) corrTerm += corrLambda * corr[i][j];
    }
  }

  const budgetViol = Math.max(0, totalSize - bankroll);
  const posViol = Math.max(0, totalCount - maxPositions);

  return (
    -reward + riskTerm + corrTerm +
    10 * budgetViol * budgetViol +
    10 * posViol * posViol
  );
}

// ── Simulated Annealing (fallback for n > QAOA_MAX_QUBITS) ───────────────────

function runSA(
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

  const maxIter = Math.max(5000, n * 500);
  const alpha = Math.pow(T_END / T_START, 1 / maxIter);

  let bestMask: boolean[] = new Array(n).fill(false);
  let bestEnergy = computeQUBOEnergy(bestMask, edges, risks, sizes, corr, riskLambda, corrLambda, bankroll, maxPositions);

  for (let r = 0; r < SA_RESTARTS; r++) {
    const x: boolean[] = Array.from({ length: n }, () => Math.random() < 0.3);
    let E = computeQUBOEnergy(x, edges, risks, sizes, corr, riskLambda, corrLambda, bankroll, maxPositions);
    let T = T_START;

    for (let iter = 0; iter < maxIter; iter++) {
      const i = Math.floor(Math.random() * n);
      x[i] = !x[i];
      const newE = computeQUBOEnergy(x, edges, risks, sizes, corr, riskLambda, corrLambda, bankroll, maxPositions);
      const dE = newE - E;

      if (dE < 0 || Math.random() < Math.exp(-dE / T)) {
        E = newE;
        if (E < bestEnergy) {
          bestEnergy = E;
          bestMask = [...x];
        }
      } else {
        x[i] = !x[i];
      }
      T *= alpha;
    }
  }

  return { mask: bestMask, energy: bestEnergy, totalIter: maxIter * SA_RESTARTS };
}

// ── Main exported optimizer ───────────────────────────────────────────────────

export function optimizePortfolio(
  candidates: ScannerEntry[],
  corrLambda: number,
  maxPositions: number,
  riskLambda = 0.08,
  bankroll = 200
): QUBOResult {
  const n = candidates.length;
  const corr = buildCorrelationMatrix(candidates);
  const edgeVector = candidates.map((c) => c.edge);

  let selected: ScannerEntry[];
  let rejected: ScannerEntry[];
  let finalEnergy: number;
  let iterations: number;
  let solver: "qaoa" | "sa";
  let gamma: number | undefined;
  let beta: number | undefined;

  if (n <= QAOA_MAX_QUBITS) {
    // ── QAOA path ──
    const res = runQAOA(candidates, corr, riskLambda, corrLambda, bankroll, maxPositions);
    selected = candidates.filter((_, i) => res.mask[i]);
    rejected = candidates.filter((_, i) => !res.mask[i]);
    finalEnergy = res.energy;
    iterations = GAMMA_STEPS * BETA_STEPS; // grid evaluations
    solver = "qaoa";
    gamma = res.gamma;
    beta = res.beta;
  } else {
    // ── SA fallback ──
    const res = runSA(candidates, corr, riskLambda, corrLambda, bankroll, maxPositions);
    selected = candidates.filter((_, i) => res.mask[i]);
    rejected = candidates.filter((_, i) => !res.mask[i]);
    finalEnergy = res.energy;
    iterations = res.totalIter;
    solver = "sa";
  }

  const totalEdge = selected.reduce((s, c) => s + c.edge, 0);
  let totalRisk = 0;
  selected.forEach((a, ai) => {
    selected.forEach((b, bi) => {
      if (bi > ai) {
        const i = candidates.indexOf(a);
        const j = candidates.indexOf(b);
        totalRisk += corr[i][j];
      }
    });
  });

  return {
    selected,
    rejected,
    totalEdge,
    totalRisk,
    correlationMatrix: corr,
    edgeVector,
    finalEnergy,
    iterations,
    solver,
    gamma,
    beta,
    numQubits: n,
  };
}
