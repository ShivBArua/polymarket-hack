/**
 * GET /api/news-trader/stream
 * Server-Sent Events endpoint — streams live trader events to the UI.
 * Starts the background polling loop on first connection.
 */

import { NextResponse } from "next/server";
import { startTrader, getTrader, NTEvent } from "@/lib/newsTrader";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const trader = startTrader();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: NTEvent) => {
        try {
          const line = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
          controller.enqueue(encoder.encode(line));
        } catch {
          trader.emitter.removeListener("event", send);
        }
      };

      // Flush current state immediately on connect
      const flush = () => {
        // Last 20 articles
        for (const a of [...trader.articles].slice(0, 20).reverse()) {
          send({ type: "article", data: a });
        }
        // Last 10 matches
        for (const m of [...trader.matches].slice(0, 10).reverse()) {
          send({ type: "match", data: m });
        }
        // Last 10 trades
        for (const t of [...trader.trades].slice(0, 10).reverse()) {
          send({ type: "trade", data: t });
        }
        // Current status
        send({ type: "status", data: trader.status });
      };

      flush();
      trader.emitter.on("event", send);

      // Heartbeat every 20s to keep connection alive through proxies
      const hb = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          clearInterval(hb);
        }
      }, 20_000);

      return () => {
        trader.emitter.removeListener("event", send);
        clearInterval(hb);
      };
    },

    cancel() {
      // Client disconnected — loop keeps running for other subscribers
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":                "text/event-stream",
      "Cache-Control":               "no-cache, no-transform",
      "Connection":                  "keep-alive",
      "X-Accel-Buffering":           "no",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
