import { NextRequest, NextResponse } from "next/server";

const CLOB_BASE = "https://clob.polymarket.com";

export async function GET(req: NextRequest) {
  const tokenId = req.nextUrl.searchParams.get("tokenId");

  if (!tokenId) {
    return NextResponse.json({ error: "tokenId is required" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `${CLOB_BASE}/prices-history?market=${encodeURIComponent(tokenId)}&interval=1m&fidelity=60`,
      { next: { revalidate: 60 } }
    );

    if (!res.ok) {
      return NextResponse.json([], { status: 200 });
    }

    const data = await res.json();
    const records: any[] = data?.history ?? [];

    const points = records
      .filter((r) => r.t && r.p)
      .map((r) => ({
        timestamp: Number(r.t),
        datetime: new Date(Number(r.t) * 1000).toISOString(),
        price: parseFloat(r.p),
      }))
      .sort((a, b) => a.timestamp - b.timestamp);

    return NextResponse.json(points);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
