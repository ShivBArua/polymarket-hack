# Polymarket Strategy Lab

A hackathon trading tool that brings TradFi-style P&L analysis to Polymarket prediction markets. Select any active market, build positions, and instantly visualize your payoff curve across all probability outcomes — like an options profit calculator, but for binary prediction markets.

## What It Does

- **Payoff curve chart** — see exactly how your position's P&L changes as the market probability moves from 0% to 100%, with green/red shading, a breakeven marker, and the current mid-price overlaid
- **Multi-position portfolio** — add YES and NO positions across markets; the chart shows the combined payoff profile of your entire book
- **Live order book** — real-time bids and asks from the Polymarket CLOB
- **Price history** — historical probability chart for the selected market
- **Stat cards** — unrealized P&L, max profit, max loss, and breakeven probability, all computed live

## The Math

For a YES position (size `$s`, entry price `p` as a decimal):
- Shares purchased: `s / p`
- Mark-to-market P&L at probability `q`: `s × (q/p − 1)`
- Max profit (resolves YES): `s × (1/p − 1)`
- Max loss (resolves NO): `−s`

For a NO position (entry `p` → NO token costs `1−p`):
- Mark-to-market P&L at probability `q`: `s × ((1−q)/(1−p) − 1)`
- Max profit (resolves NO): `s × (1/(1−p) − 1)`
- Max loss (resolves YES): `−s`

Both are linear in `q`, so the combined portfolio payoff is always a straight line — which makes breakeven trivially computable.

## Project Structure

```
polymarket-hack/
├── src/
│   ├── app/
│   │   ├── globals.css
│   │   ├── layout.tsx         Root layout
│   │   ├── page.tsx           Main dashboard (state orchestrator)
│   │   └── api/
│   │       ├── markets/       Proxy → Gamma API
│   │       ├── orderbook/     Proxy → CLOB API
│   │       └── history/       Proxy → CLOB prices-history
│   ├── components/
│   │   ├── MarketSelector.tsx Searchable market list
│   │   ├── PositionBuilder.tsx YES/NO form with implied odds
│   │   ├── PayoffChart.tsx    Recharts payoff curve (core viz)
│   │   ├── PortfolioPanel.tsx Position list with live P&L
│   │   ├── OrderBook.tsx      Bids/asks table
│   │   ├── PriceHistoryChart.tsx Area chart of price over time
│   │   └── StatCard.tsx       Metric display card
│   ├── lib/
│   │   ├── api.ts             Client-side fetch helpers
│   │   ├── payoff.ts          P&L math and portfolio stats
│   │   └── utils.ts           Formatting and small helpers
│   └── types/
│       └── index.ts           Shared TypeScript types
├── package.json
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
├── .env.example
└── README.md
```

## APIs Used

| API | Endpoint | Purpose |
|-----|----------|---------|
| Gamma | `gamma-api.polymarket.com/markets` | Active market list |
| CLOB | `clob.polymarket.com/book` | Live order book |
| CLOB | `clob.polymarket.com/prices-history` | Historical prices |

All requests are proxied through Next.js API routes to avoid CORS issues in the browser.

## Setup

### 1. Install dependencies

```bash
cd polymarket-hack
npm install
```

### 2. (Optional) Configure environment

```bash
cp .env.example .env.local
# Edit .env.local if needed
```

### 3. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 4. Build for production

```bash
npm run build
npm start
```

## How to Use

1. **Pick a market** from the left sidebar — use the search box to filter
2. **Build a position** — choose YES or NO, set a size in USDC, and set your entry price (defaults to the live mid-price)
3. **Read the chart** — the payoff curve shows your P&L at every probability from 0% to 100%; the blue dashed line is the current market price, the amber line is your breakeven
4. **Stack positions** — add multiple positions; the chart updates to show the combined portfolio payoff
5. **Check the order book and price history** — bottom panels show live depth and historical probability

## Roadmap / Potential Extensions

- **Correlated market hedging** — pair positions across related markets and visualize combined scenarios
- **Time-decay simulation** — model how value changes as resolution date approaches
- **Greeks-style sensitivities** — delta, expected value sensitivity to probability shifts
- **Order placement** — integrate CLOB client SDK with wallet auth for live trading
- **WebSocket updates** — real-time order book and price streaming
