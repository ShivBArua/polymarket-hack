import { NextResponse } from "next/server";
import { fetchBalance, fetchOpenOrders, deriveAddress } from "@/lib/polymarket";

export async function GET() {
  try {
    const [balance, openOrders] = await Promise.allSettled([
      fetchBalance(),
      fetchOpenOrders(),
    ]);

    return NextResponse.json({
      address: deriveAddress(),
      balance: balance.status === "fulfilled" ? balance.value : 0,
      openOrders: openOrders.status === "fulfilled" ? openOrders.value : [],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
