import { NextRequest, NextResponse } from "next/server";

const CLOB_BASE = "https://clob.polymarket.com";

export async function GET(req: NextRequest) {
  const tokenId = req.nextUrl.searchParams.get("tokenId");

  if (!tokenId) {
    return NextResponse.json({ error: "tokenId is required" }, { status: 400 });
  }

  try {
    const res = await fetch(`${CLOB_BASE}/book?token_id=${encodeURIComponent(tokenId)}`, {
      next: { revalidate: 10 },
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Upstream error" }, { status: res.status });
    }

    const data = await res.json();

    const sortedBids = [...(data.bids ?? [])]
      .sort((a: any, b: any) => parseFloat(b.price) - parseFloat(a.price))
      .slice(0, 10)
      .map((e: any) => ({ price: String(e.price), size: String(e.size) }));

    const sortedAsks = [...(data.asks ?? [])]
      .sort((a: any, b: any) => parseFloat(a.price) - parseFloat(b.price))
      .slice(0, 10)
      .map((e: any) => ({ price: String(e.price), size: String(e.size) }));

    return NextResponse.json({
      bids: sortedBids,
      asks: sortedAsks,
      last_trade_price: data.last_trade_price ?? null,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
