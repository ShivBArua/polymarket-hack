/**
 * POST /api/trade
 *
 * Body: { tokenId, side, sizeUsdc, price }
 *   tokenId  — YES or NO token id from the market
 *   side     — "BUY" | "SELL"
 *   sizeUsdc — dollar amount to trade
 *   price    — current market price (0–1)
 *
 * Builds an EIP-712 signed order and submits it to the Polymarket CLOB.
 */

import { NextRequest, NextResponse } from "next/server";
import { buildAndSignOrder, submitOrder } from "@/lib/polymarket";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tokenId, side, sizeUsdc, price } = body;

    if (!tokenId || !side || !sizeUsdc || !price) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (!["BUY", "SELL"].includes(side)) {
      return NextResponse.json({ error: "side must be BUY or SELL" }, { status: 400 });
    }
    if (sizeUsdc < 1) {
      return NextResponse.json({ error: "Minimum trade size is $1" }, { status: 400 });
    }
    if (!process.env.POLY_PRIVATE_KEY) {
      return NextResponse.json({ error: "POLY_PRIVATE_KEY not set" }, { status: 500 });
    }

    const signed = await buildAndSignOrder({ tokenId, side, sizeUsdc, price });
    const result = await submitOrder(signed);

    return NextResponse.json({
      success: true,
      orderId: result.id,
      status: result.status,
      tokenId,
      side,
      sizeUsdc,
      price,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 500 });
  }
}
