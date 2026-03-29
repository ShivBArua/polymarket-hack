# Polymarket Lab

A prediction market research and automated paper-trading system built on Polymarket's CLOB API. Four modules: **Strategy Lab** (manual position builder), **Scanner & Optimizer** (edge detection + de-correlated portfolio selection), **Backtester** (historical simulation), and **Live Trader** (real-time news-driven automated trading).

---

## Architecture

| Layer | Tech |
|---|---|
| Framework | Next.js 14 App Router |
| Styling | Tailwind CSS + CSS custom properties |
| Charts | Recharts |
| AI | Claude Sonnet (`claude-sonnet-4-6`) via Lava API |
| Market data | Polymarket CLOB + Gamma APIs |
| News | 18 RSS feeds (AP, Reuters, NYT, BBC, Guardian, Politico, Axios, ESPN, CNBC…) |
| Cross-exchange | Kalshi API |
| Low-latency engine | `rt-engine/` — C++ WebSocket + Python NLP/CV services |

---

## Modules

### Strategy Lab
Manual position builder. Select any of 42,000+ Polymarket markets, add YES/NO positions, and view live order book and price history. Portfolio stats (unrealised P&L, max profit/loss, breakeven probability) update in real time.

### Scanner & Optimizer
**Scanner** scans active markets for mispriced tokens using a fair-value model and momentum signal. For each signal, a research drawer shows:
- AI Analysis — Claude Sonnet reads live news and estimates the true probability
- Web Sources — Google News articles that fed the AI
- Statistical breakdown — mid price, fair-value, edge calculation
- Related Markets — similar markets on Polymarket and Kalshi with price diffs

**Optimizer** takes selected scanner signals and builds a diversified trade basket using greedy de-correlation (Jaccard keyword similarity + threshold parameter λ).

### Backtester
Simulates the strategy on active markets using real CLOB price history. Runs a 125-combination parameter grid search (entry days × min edge × min trend signal), ranks by Sharpe ratio, and returns an equity curve, per-trade P&L, and performance stats.

### Live Trader
Continuously monitors 18 RSS news feeds in parallel and automatically paper-trades matching Polymarket markets. Fully wired into the GUI with a real-time streaming UI.

---

## Live Trader Architecture

```
RSS Feeds (18 sources, 15s poll)
        │
        ▼
  Pre-filter            regex keyword match, <1ms, no API call
        │
        ▼
  TF-IDF Ranking        scores 16,835 markets against headline, <1ms
        │
        ▼
  Claude Sonnet         validates match, determines YES/NO, estimates
                        post-news probability, returns confidence score (~1-2s)
        │
        ▼
  Risk Engine           checks exposure limits, per-market cooldown,
                        slippage, kill switch
        │
        ▼
  Paper Trade           logs order with size, price, edge, reasoning
        │
        ▼
  SSE Stream            pushes all events to the Live Trader tab in real time
```

**News sources:** AP, Reuters, NYT (Home/Politics/World), BBC (Top/World/Sport), Guardian (World/US), Politico, The Hill, Axios, CNBC, ESPN, MarketWatch.

**Latency breakdown:**

| Stage | Latency |
|---|---|
| RSS publication lag | 30s – 3min (dominant) |
| Feed fetch (18 feeds, parallel) | 100 – 400ms |
| Pre-filter + TF-IDF | < 1ms |
| Claude API via Lava | 800ms – 2s |
| Risk check | < 1ms |
| SSE delivery to browser | < 5ms |

---

## Methodology

### 1. Fair-Value Edge

```
spread_uncertainty = min(1, (ask − bid) / 0.12)

fair_price = ltp × (1 − unc) + mid × unc   [if LTP within 20¢ of mid]
           = mid                              [if LTP is stale or absent]

edge = min(0.12, |fair_price − mid|)
```

`ltp` = last traded price. Given more weight when the spread is tight (low uncertainty), less when wide. Edge capped at 12¢ to suppress stale-LTP outliers.

### 2. Momentum Signal (OLS slope)

```
slope = Σ[(tᵢ − t̄)(pᵢ − p̄)] / Σ[(tᵢ − t̄)²]   (per millisecond)
      × 86,400,000  →  price change per day
```

Computed on the 7-day window before the simulated entry date. Only markets with `|slope| ≥ minTrendSignal` are considered.

### 3. Signal Agreement Filter

Both signals must point in the same direction:

```
fair_direction  = "YES" if fair_price > entry_price,  else "NO"
trend_direction = "YES" if slope > 0,                 else "NO"

if fair_direction ≠ trend_direction → skip
```

Without this, an OR condition created a systematic YES bias (enter YES if either signal is bullish). Requiring agreement gives symmetric YES/NO trades and eliminates the most common source of false backtester profitability.

### 4. Sharpe Ratio

```
Sharpe = (mean(returns) / std(returns)) × √252
```

`returns` = per-trade return as fraction of position size. √252 annualises assuming one trade per business day (approximation — holding periods vary). Use Sharpe to compare parameter combinations, not as an absolute return estimate.

### 5. Portfolio De-Correlation

```
keywords(q) = {words in q | len > 3} \ stop_words
jaccard(A, B) = |A ∩ B| / |A ∪ B|
corrThreshold = max(0.05, 1 − λ)
```

Greedy selection: sort candidates by edge (desc), accept each if `max_pairwise_jaccard < corrThreshold`. λ slider in the UI controls diversification aggressiveness (0 = pure edge, 1 = maximum diversity).

### 6. Live Trader Signal (Claude)

For each article passing the pre-filter:
1. TF-IDF scores all 16,835 markets against the headline text
2. Top 10 candidates sent to Claude with the prompt:
   - Market questions, current mid prices
   - Article headline + snippet
3. Claude returns: matched market ID, direction (YES/NO), post-news fair value, confidence (0–1), one-sentence reasoning
4. Trade only if `confidence ≥ 0.65` and `|fair_value − mid| ≥ 0.03`

### 7. Kelly Sizing

```
kelly_estimate = confidence × |edge| × 100
size = clamp(kelly_estimate, min=$2, max=$25)
```

Rough fractional Kelly heuristic. Hard cap at $25/trade, $500 gross exposure total.

---

## Why Backtests Are Sometimes Unprofitable

1. **Spread cost not modelled** — entry at historical mid price, not ask. Live entry costs ~half the spread each way; on a 10¢ spread market this is 10¢ round-trip, often exceeding the signal.
2. **Stale CSV data** — `markets.csv` is a snapshot. LTP used in fair-value may be hours old.
3. **Small sample size** — with strict filters (edge + trend + signal agreement), typical runs produce 3–10 trades. Sharpe and win rate are unreliable at this scale.
4. **In-sample optimisation** — Auto-tune picks parameters on the same data used to evaluate them.
5. **No news within the hold window** — prediction markets move on discrete events. A 14-day hold without relevant news leads to mean reversion.
6. **Resolution-proximity collapse** — markets approaching deadline converge rapidly to 0 or 1; a small directional error near resolution produces a large loss.

---

## Project Structure

```
polymarket-hack/               Next.js GUI + API routes
├── src/
│   ├── app/
│   │   ├── page.tsx           Main dashboard (4 tabs)
│   │   └── api/
│   │       ├── news-trader/stream/   SSE live trader stream
│   │       ├── scanner/       Edge detection from markets.csv
│   │       ├── sentiment/     Claude AI + Google News
│   │       ├── related/       Polymarket CSV + Kalshi search
│   │       ├── quantum/       Portfolio optimizer
│   │       ├── backtest/      Historical simulation
│   │       ├── optimize/      Parameter grid search (125 combos)
│   │       ├── trade/         Live order submission (EIP-712)
│   │       ├── balance/       USDC balance + open orders
│   │       └── …
│   ├── components/
│   │   ├── LiveTraderPanel.tsx    Real-time news trading UI (SSE)
│   │   ├── ScannerPanel.tsx       Signal list + research drawer
│   │   ├── QuantumPanel.tsx       Portfolio optimizer UI
│   │   ├── BacktestPanel.tsx      Historical simulation UI
│   │   └── …
│   └── lib/
│       ├── newsTrader.ts      Core live trader engine (singleton)
│       ├── qubo.ts            Greedy de-correlated optimizer
│       ├── polymarket.ts      CLOB auth + EIP-712 signing
│       └── …
├── data/markets.csv           Active markets snapshot (42k+ markets)
└── news_trader.sh             One-command launcher for standalone Python trader

rt-engine/                     Low-latency C++ + Python engine
├── cpp/
│   ├── market_data/           WebSocket CLOB client
│   ├── orderbook/             In-memory L2 order book
│   ├── signals/               Stale-quote + resolve-now scoring
│   ├── execution/             Aggressive/passive order router
│   ├── risk/                  Hard limit risk engine
│   └── replay/                Event replay for backtesting
├── python/
│   ├── nlp/classifier.py      ZeroMQ NLP headline classifier
│   └── cv/scoreboard_ocr.py   OpenCV scoreboard OCR for sports
├── news_trader/               Standalone Python news trader
│   ├── main.py                Async event loop
│   ├── scraper.py             RSS poller (18 feeds)
│   ├── matcher.py             Claude market matcher
│   ├── executor.py            Paper + live CLOB executor
│   └── risk.py                Risk engine
└── docs/
    ├── architecture.md
    ├── strategy.md
    ├── risk_controls.md
    └── research_basis.md
```

---

## Setup

```bash
cd polymarket-hack
npm install
npm run dev        # opens on http://localhost:3000
```

### Environment Variables (`.env.local`)

```env
LAVA_API_KEY=lava_sk_...        # Required: Claude AI via Lava proxy
POLY_API_KEY=...                 # Live trading: Polymarket CLOB key
POLY_API_SECRET=...              # Live trading: HMAC secret
POLY_PASSPHRASE=...              # Live trading: passphrase
POLY_PRIVATE_KEY=0x...           # Live trading: Ethereum wallet
```

`LAVA_API_KEY` is required for AI sentiment (Scanner) and Live Trader matching. The scanner, optimizer, and backtester work without it.

### Standalone Python News Trader

```bash
cd polymarket-hack
./news_trader.sh               # paper mode — reads .env.local automatically
./news_trader.sh --live        # real money (requires Polymarket credentials)
```

---

## APIs Used

| API | Purpose |
|---|---|
| Polymarket CLOB (`clob.polymarket.com`) | Order book, price history, order submission |
| Polymarket Gamma (`gamma-api.polymarket.com`) | Market metadata, resolution criteria |
| Lava → Claude Sonnet (`api.lava.so/v1/messages`) | AI matching, sentiment, probability estimation |
| Google News RSS | Article headlines and snippets |
| Kalshi (`trading-api.kalshi.com`) | Cross-market comparison |
| 18 RSS feeds | Real-time news for Live Trader |
