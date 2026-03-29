# Polymarket Lab

A prediction market research and paper-trading tool for Polymarket. Three modules: **Scanner** (live edge detection), **Portfolio Optimizer** (de-correlated position sizing), and **Backtester** (historical simulation with parameter search).

---

## Architecture

| Layer | Tech |
|---|---|
| Framework | Next.js 14 App Router |
| Styling | Tailwind CSS + CSS custom properties |
| Charts | Recharts |
| AI | Claude Sonnet (`claude-sonnet-4-6`) via Lava API |
| Market data | Polymarket CLOB + Gamma APIs |
| News | Google News RSS |
| Cross-exchange | Kalshi API |

---

## Methodology

### 1. Fair-Value Edge

For each market the scanner computes a **fair price** blending the last traded price (LTP) with the order-book mid, weighted by spread uncertainty:

```
spread_uncertainty = min(1, (ask − bid) / 0.12)

fair_price = ltp × (1 − unc) + mid × unc   [if LTP within 20¢ of mid]
           = mid                              [if LTP is stale or absent]
```

- **`mid`** = (best_bid + best_ask) / 2 — current order-book centre.
- **`ltp`** — last traded price. A recent trade is a stronger signal than a stale quote, so it is weighted more when the spread is tight and less when wide.
- **`spread_uncertainty`** grows from 0 (tight spread) to 1 (spread ≥ 12¢). At 12¢+ the LTP is treated as untrustworthy and the mid is used alone.

The **raw edge** is:

```
edge = min(0.12, |fair_price − mid|)
```

Capped at 12¢ to prevent stale LTP from generating artificially large edges. Only markets with `edge ≥ minEdge` (default 3%) pass the first filter.

**Limitation:** `markets.csv` is a point-in-time snapshot. If the market moved significantly since the snapshot, the LTP will be stale and computed edge will be misleading. The 20¢ guard mitigates but does not eliminate this.

---

### 2. Momentum Signal

The backtester computes a **price slope** over the 7 days preceding the simulated entry using OLS linear regression on historical CLOB data:

```
slope = Σ[(tᵢ − t̄)(pᵢ − p̄)] / Σ[(tᵢ − t̄)²]
```

Multiplied by 86,400,000 to convert to **price change per day**. Only markets where `|slope| ≥ minTrendSignal` (default 0.001/day) pass this filter.

Polymarket prices exhibit short-term autocorrelation: informed traders push prices gradually as news develops. The momentum signal captures this drift.

---

### 3. Signal Agreement Filter

Both signals must point in the same direction before a trade is entered:

```
fair_direction  = "YES" if fair_price > entry_price, else "NO"
trend_direction = "YES" if slope > 0,                else "NO"

if fair_direction ≠ trend_direction → skip
```

**Why this matters:** Without this filter the model previously used an OR condition — entering YES whenever *either* signal was bullish. This created a systematic YES bias: YES was accepted if fair value *or* momentum was bullish, but NO required *both* to be bearish. Because the two signals frequently disagree (e.g. fair value says YES is cheap but price is trending down), the OR logic produced mostly YES trades regardless of the actual market setup, inflating simulated win rates via survivorship. Requiring agreement means roughly equal YES/NO trades and a cleaner, more honest signal.

---

### 4. P&L Calculation

The backtester is a **paper / unrealised P&L** simulation:

```
shares    = sizeUsdc / entryPrice
priceMove = currentPrice − entryPrice   (YES trade)
          = entryPrice − currentPrice   (NO trade)
pnl       = shares × priceMove
returnPct = pnl / sizeUsdc
```

Exit is always the **most recent CLOB price**, not resolution. This tests signal quality in the short-to-medium term, not ultimate resolution accuracy.

**Spread cost is not modelled.** Entry is simulated at the historical mid price. In live trading you buy at the ask (for YES) and exit at the bid equivalent. For a 10¢ spread market this is roughly 10¢ round-trip cost, which is often larger than the edge signal. Live results will be materially worse than simulated results.

---

### 5. Performance Metrics

#### Sharpe Ratio

```
Sharpe = (mean(returns) / std(returns)) × √252
```

`returns` is the per-trade return as a fraction of `sizeUsdc`. The √252 annualisation assumes one trade per business day — a rough approximation since holding periods vary. Use Sharpe to **compare parameter combinations against each other**, not as an absolute risk-adjusted return estimate.

- Sharpe > 1.0: generally considered good
- Sharpe > 2.0: strong
- Sharpe < 0: negative expected return regardless of volatility

#### Max Drawdown

```
drawdown = max( (peak_cumPnl − current_cumPnl) / peak_cumPnl )
```

Computed on the cumulative P&L series in entry-date order. Only meaningful once the equity curve has gone positive at least once.

#### Win Rate

Fraction of trades where `pnl > 0`. A win rate above 50% does not guarantee profitability if losing trades are larger.

---

### 6. Auto-tune Parameter Grid Search

Sweeps 125 parameter combinations:

| Parameter | Values |
|---|---|
| `entryDays` | 3, 7, 14, 21, 30 |
| `minEdge` | 1%, 3%, 5%, 8%, 10% |
| `minTrendSignal` | 0.0005, 0.001, 0.003, 0.006, 0.010 /day |

Combinations producing fewer than 3 trades are discarded. The remainder are ranked by Sharpe. Top 15 are returned and can be applied to the backtester with one click.

**Caution:** This is in-sample optimisation. The best parameters are chosen on the same data they are evaluated on. Out-of-sample Sharpe will typically be lower.

---

### 7. Portfolio De-Correlation

The optimizer selects a portfolio that maximises total edge subject to a pairwise correlation constraint.

**Correlation measure:** Jaccard similarity of keyword sets from market question text.

```
keywords(q) = {words in q | len > 3} \ stop_words
jaccard(A, B) = |A ∩ B| / |A ∪ B|
```

**Greedy selection:**
1. Sort candidates by edge (descending).
2. For each candidate: compute Jaccard with every already-selected trade.
3. Accept if `max_pairwise_similarity < corrThreshold`.
4. Repeat until `maxPositions` selected.

**Threshold:**

```
corrThreshold = max(0.05, 1 − λ)
```

| λ | corrThreshold | Behaviour |
|---|---|---|
| 0.0 | 0.95 | Pure edge — almost no rejection |
| 0.5 | 0.50 | Moderate diversification |
| 0.9 | 0.10 | Aggressive diversity — near-zero keyword overlap required |

**Why diversify?** Five markets all correlated to "US strikes Iran" are one bet, not five. A single headline wipes the book. De-correlation forces independent events.

---

### 8. AI Sentiment Analysis

The sentiment endpoint (`/api/sentiment`) fetches up to 6 Google News RSS headlines + snippets, then passes them with the Polymarket resolution criteria to Claude Sonnet:

- `probability` — estimated YES probability (0–1)
- `confidence` — `"low"` / `"medium"` / `"high"`
- `reasoning` — two-sentence explanation citing specific articles
- `keyFactor` — single most important piece of evidence

In the backtester, AI acts as a **second-pass filter**: a trade already passing the statistical filter is only entered if Claude's probability estimate points in the same direction. Disabled by default (adds latency and API cost).

---

## Why Backtests Are Sometimes Unprofitable

Several structural factors cause losses even when the signal looks strong:

### 1. Markets don't move within the hold window

Prediction market prices are driven by discrete information events. A 14-day hold may contain no relevant news, in which case prices revert to prior. A statistically attractive entry can stay cheap because nothing happened.

### 2. Spread cost erases the edge

A 3¢ fair-value edge is a ~3% expected return. Typical Polymarket spreads on mid-liquidity markets are 5–10¢. Round-trip spread cost (entry at ask + exit at bid equivalent) can exceed the signal entirely. **The backtester does not model this** — it enters at the historical mid price, so live results are always worse than simulated.

### 3. Stale CSV data

`markets.csv` is a point-in-time snapshot. The `last_trade_price` used in the fair-value calculation may be hours old. Stale LTP inflates apparent edge on markets the crowd has already arbitraged.

### 4. Small sample size

With 20–40 markets and strict filters (edge + trend + signal agreement), a typical run produces 3–10 trades. Sharpe and win rate are highly unreliable at this scale. A single bad trade flips a profitable backtest negative. Auto-tune requires ≥3 trades per combination for this reason, but even 10 trades is far below statistical confidence.

### 5. In-sample overfitting

Auto-tune picks parameters on the same data used to evaluate them. The "best" combination shown will almost always overstate forward performance.

### 6. Resolution-proximity collapse

As a market approaches its deadline, prices converge rapidly to 0 or 1. A small directional error near resolution produces a large loss. The `entryPrice < 0.04 || > 0.96` filter skips the most extreme cases but not markets that moved to extremes during the hold period.

---

## Project Structure

```
polymarket-hack/
├── src/
│   ├── app/
│   │   ├── page.tsx                 Main dashboard (3 tabs)
│   │   └── api/
│   │       ├── scanner/             Edge detection from markets.csv
│   │       ├── sentiment/           Claude AI + Google News scraper
│   │       ├── related/             Polymarket CSV + Kalshi keyword search
│   │       ├── quantum/             Portfolio optimizer (greedy de-correlation)
│   │       ├── backtest/            Historical simulation
│   │       ├── optimize/            Parameter grid search (125 combinations)
│   │       ├── trade/               Live order submission (EIP-712)
│   │       ├── balance/             USDC balance + open orders
│   │       ├── news/                Google News RSS proxy
│   │       ├── history/             CLOB price history proxy
│   │       ├── orderbook/           Order book snapshot
│   │       └── markets/             Gamma API proxy
│   ├── components/
│   │   ├── ScannerPanel.tsx         Signal list + research drawer
│   │   ├── QuantumPanel.tsx         Portfolio optimizer UI
│   │   ├── BacktestPanel.tsx        Historical simulation UI
│   │   ├── PriceHistoryChart.tsx    CLOB price chart
│   │   ├── OrderBook.tsx            Bid/ask ladder
│   │   ├── MarketSelector.tsx       Market search sidebar
│   │   ├── PositionBuilder.tsx      Manual position entry
│   │   ├── PortfolioPanel.tsx       Position list
│   │   └── StatCard.tsx             Stat display card
│   ├── lib/
│   │   ├── qubo.ts                  Greedy de-correlated optimizer
│   │   ├── polymarket.ts            CLOB auth + EIP-712 signing
│   │   ├── payoff.ts                Portfolio P&L calculations
│   │   ├── api.ts                   Frontend API wrappers
│   │   └── utils.ts                 Formatting helpers
│   └── types/index.ts               Shared TypeScript types
├── data/
│   └── markets.csv                  Active markets snapshot
└── .env.local                       API keys (not committed)
```

---

## Setup

```bash
cd polymarket-hack
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment Variables

```env
LAVA_API_KEY=lava_sk_...        # Required for AI analysis
POLY_API_KEY=...                 # Polymarket CLOB key
POLY_API_SECRET=...              # HMAC signing secret
POLY_PASSPHRASE=...              # Passphrase
POLY_PRIVATE_KEY=0x...           # Ethereum wallet for order signing
```

`LAVA_API_KEY` is required for AI sentiment. The scanner, optimizer, and backtester work without it (turn off "AI filter" in backtester).

---

## APIs Used

| API | Base URL | Purpose |
|---|---|---|
| Polymarket CLOB | `clob.polymarket.com` | Order book, price history, order submission |
| Polymarket Gamma | `gamma-api.polymarket.com` | Market metadata, resolution criteria |
| Google News RSS | `news.google.com/rss/search` | Article headlines and snippets |
| Kalshi | `trading-api.kalshi.com` | Cross-market comparison |
| Lava (→ Claude) | `api.lava.so/v1/messages` | AI probability estimates |
