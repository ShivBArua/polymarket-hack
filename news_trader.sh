#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# news_trader.sh  —  one-command launcher for the Polymarket news trader
#
# Run from anywhere inside polymarket-hack/:
#   ./news_trader.sh
#   ./news_trader.sh --live        (real money — needs credentials)
#   ./news_trader.sh --setup-only  (create venv + install deps, then exit)
#
# On first run this creates a Python venv at ../rt-engine/.venv and installs
# dependencies automatically.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
RT_ENGINE="$SCRIPT_DIR/../rt-engine"
NEWS_TRADER="$RT_ENGINE/news_trader"
VENV="$RT_ENGINE/.venv"
ENV_FILE="$SCRIPT_DIR/.env.local"

LIVE_MODE=false
SETUP_ONLY=false

for arg in "$@"; do
  case "$arg" in
    --live)        LIVE_MODE=true  ;;
    --setup-only)  SETUP_ONLY=true ;;
    --help|-h)
      echo "Usage: ./news_trader.sh [--live] [--setup-only]"
      echo "  --live        Real trading mode (requires Polymarket credentials in .env.local)"
      echo "  --setup-only  Create venv and install deps, then exit"
      exit 0 ;;
  esac
done

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[news_trader]${NC} $*"; }
success() { echo -e "${GREEN}[news_trader]${NC} $*"; }
warn()    { echo -e "${YELLOW}[news_trader]${NC} $*"; }
error()   { echo -e "${RED}[news_trader]${NC} $*" >&2; }

# ── Find Python 3.10+ ─────────────────────────────────────────────────────────
find_python() {
  for py in python3.13 python3.12 python3.11 python3.10 python3; do
    if command -v "$py" &>/dev/null; then
      ver=$("$py" -c "import sys; print(sys.version_info[:2])" 2>/dev/null)
      if "$py" -c "import sys; assert sys.version_info >= (3,10)" 2>/dev/null; then
        echo "$py"
        return
      fi
    fi
  done
  error "Python 3.10+ not found. Install with: brew install python@3.13"
  exit 1
}

PYTHON=$(find_python)
info "Using Python: $PYTHON ($($PYTHON --version))"

# ── Create venv if missing ────────────────────────────────────────────────────
if [ ! -d "$VENV" ]; then
  info "Creating virtual environment at $VENV ..."
  "$PYTHON" -m venv "$VENV"
  success "Virtual environment created"
fi

PY="$VENV/bin/python3"
PIP="$VENV/bin/pip"

# ── Install / upgrade deps ────────────────────────────────────────────────────
info "Checking dependencies..."
REQS="$NEWS_TRADER/requirements.txt"

# Core deps always needed
NEED_INSTALL=false
for pkg in aiohttp; do
  if ! "$PY" -c "import $pkg" &>/dev/null; then
    NEED_INSTALL=true; break
  fi
done

if $NEED_INSTALL; then
  info "Installing dependencies..."
  "$PIP" install --quiet --upgrade pip
  "$PIP" install --quiet aiohttp
  if $LIVE_MODE; then
    info "Installing py-clob-client for live trading..."
    "$PIP" install --quiet "py-clob-client>=0.16.0" || \
      warn "py-clob-client install failed — live order submission won't work"
  fi
  success "Dependencies installed"
else
  info "Dependencies already installed ✓"
fi

if $SETUP_ONLY; then
  success "Setup complete. Run './news_trader.sh' to start."
  exit 0
fi

# ── Load and validate .env.local ──────────────────────────────────────────────
if [ -f "$ENV_FILE" ]; then
  info "Loading credentials from .env.local"
  while IFS= read -r line || [ -n "$line" ]; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ -z "${line// }" ]] && continue
    key="${line%%=*}"
    val="${line#*=}"
    export "$key"="$val"
  done < "$ENV_FILE"
else
  warn ".env.local not found — set LAVA_API_KEY manually"
fi

if [ -z "${LAVA_API_KEY:-}" ]; then
  error "LAVA_API_KEY is not set."
  error "Add it to polymarket-hack/.env.local:"
  error "  LAVA_API_KEY=lava_sk_..."
  exit 1
fi

# ── Live mode guards ──────────────────────────────────────────────────────────
if $LIVE_MODE; then
  warn "═══════════════════════════════════════════════"
  warn " LIVE TRADING MODE — REAL USDC WILL BE SPENT  "
  warn "═══════════════════════════════════════════════"
  for key in POLY_PRIVATE_KEY POLY_API_KEY POLY_API_SECRET POLY_PASSPHRASE; do
    if [ -z "${!key:-}" ]; then
      error "Missing required credential: $key"
      error "Add it to polymarket-hack/.env.local"
      exit 1
    fi
  done
  read -rp "Type 'yes' to confirm live trading: " confirm
  [ "$confirm" = "yes" ] || { info "Aborted."; exit 0; }
  export PAPER_MODE=false
  export LIVE_TRADING_ENABLED=true
else
  export PAPER_MODE=true
  info "Running in PAPER mode (no real trades)"
fi

# ── Create log directory ──────────────────────────────────────────────────────
mkdir -p "$NEWS_TRADER/logs"

# ── Launch ────────────────────────────────────────────────────────────────────
success "Starting news trader..."
echo ""
cd "$NEWS_TRADER"
exec "$PY" main.py
