/**
 * Strategy 2 — Quantum-Inspired QUBO Optimizer API
 *
 * POST body: { candidates: ScannerEntry[], lambda: number, maxPositions: number }
 * Returns:   QUBOResult
 *
 * Runs simulated annealing on the QUBO formulation to select the optimal
 * basket of trades that maximises total edge while penalising correlated risk.
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

    if (candidates.length === 0) {
      return NextResponse.json({ error: "No candidates provided" }, { status: 400 });
    }

    if (candidates.length > 50) {
      return NextResponse.json(
        { error: "Too many candidates (max 50)" },
        { status: 400 }
      );
    }

    const result = optimizePortfolio(candidates, lambda, maxPositions);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
