/**
 * Quantum-Inspired QUBO Optimizer API
 *
 * POST body: {
 *   candidates:    ScannerEntry[]
 *   lambda:        number   – correlation penalty (corrLambda)
 *   maxPositions:  number
 *   riskLambda?:   number   – per-trade risk penalty (default 0.08)
 *   bankroll?:     number   – total budget in dollars (default 200)
 * }
 * Returns: QUBOResult
 *
 * Solves the QUBO via Simulated Annealing — same formulation as the
 * Qiskit/QAOA notebook, classical SA instead of quantum circuit.
 */

import { NextRequest, NextResponse } from "next/server";
import { optimizePortfolio } from "@/lib/qubo";
import { ScannerEntry } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const candidates: ScannerEntry[] = body.candidates ?? [];
    const lambda: number = typeof body.lambda === "number" ? body.lambda : 0.5;
    const maxPositions: number =
      typeof body.maxPositions === "number" ? body.maxPositions : 5;
    const riskLambda: number =
      typeof body.riskLambda === "number" ? body.riskLambda : 0.08;
    const bankroll: number =
      typeof body.bankroll === "number" ? body.bankroll : 200;

    if (candidates.length === 0) {
      return NextResponse.json({ error: "No candidates provided" }, { status: 400 });
    }

    if (candidates.length > 50) {
      return NextResponse.json(
        { error: "Too many candidates (max 50)" },
        { status: 400 }
      );
    }

    const result = optimizePortfolio(candidates, lambda, maxPositions, riskLambda, bankroll);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
