/**
 * Polymarket CLOB order building, signing, and L2 auth header generation.
 *
 * References:
 *   - https://docs.polymarket.com/#order-structure
 *   - https://github.com/Polymarket/py-clob-client
 *
 * Order flow:
 *   1. Build the order struct (amounts, tokenId, side, etc.)
 *   2. Sign it with EIP-712 using the wallet private key
 *   3. Attach L2 HMAC headers (API key auth)
 *   4. POST to https://clob.polymarket.com/order
 */

import { ethers } from "ethers";
import { createHmac } from "crypto";

// ── Constants ─────────────────────────────────────────────────────────────────

const CLOB_BASE = "https://clob.polymarket.com";
const EXCHANGE_ADDRESS = "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E";
const NEG_RISK_EXCHANGE = "0xC5d563A36AE78145C45a50134d48A1215220f80a";
const CHAIN_ID = 137; // Polygon mainnet
const USDC_DECIMALS = 6;

// ── EIP-712 domain + types ────────────────────────────────────────────────────

const DOMAIN = {
  name: "Polymarket CTF Exchange",
  version: "1",
  chainId: CHAIN_ID,
  verifyingContract: EXCHANGE_ADDRESS,
};

const ORDER_TYPES = {
  Order: [
    { name: "salt",          type: "uint256" },
    { name: "maker",         type: "address" },
    { name: "signer",        type: "address" },
    { name: "taker",         type: "address" },
    { name: "tokenId",       type: "uint256" },
    { name: "makerAmount",   type: "uint256" },
    { name: "takerAmount",   type: "uint256" },
    { name: "expiration",    type: "uint256" },
    { name: "nonce",         type: "uint256" },
    { name: "feeRateBps",    type: "uint256" },
    { name: "side",          type: "uint8"   },
    { name: "signatureType", type: "uint8"   },
  ],
};

// ── L2 HMAC auth headers ──────────────────────────────────────────────────────

export function buildL2Headers(
  method: "GET" | "POST" | "DELETE",
  path: string,
  body = ""
): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const message = timestamp + method + path + body;
  const secretBytes = Buffer.from(process.env.POLY_API_SECRET!, "base64");
  const sig = createHmac("sha256", secretBytes)
    .update(message)
    .digest("base64");

  return {
    "POLY_ADDRESS":    deriveAddress(),
    "POLY_SIGNATURE":  sig,
    "POLY_TIMESTAMP":  timestamp,
    "POLY_NONCE":      "0",
    "POLY_API_KEY":    process.env.POLY_API_KEY!,
    "POLY_PASSPHRASE": process.env.POLY_API_PASSPHRASE!,
    "Content-Type":    "application/json",
  };
}

// ── Wallet helpers ────────────────────────────────────────────────────────────

function getWallet(): ethers.Wallet {
  const pk = process.env.POLY_PRIVATE_KEY!;
  return new ethers.Wallet(pk.startsWith("0x") ? pk : `0x${pk}`);
}

function deriveAddress(): string {
  return getWallet().address;
}

// ── Amount helpers ────────────────────────────────────────────────────────────

/** Convert a dollar amount to USDC micro-units (6 decimals) */
function toMicro(usdcAmount: number): bigint {
  return BigInt(Math.round(usdcAmount * 10 ** USDC_DECIMALS));
}

// ── Order building + signing ──────────────────────────────────────────────────

export interface OrderParams {
  tokenId: string;     // YES or NO token id
  side: "BUY" | "SELL";
  sizeUsdc: number;    // how many USDC to spend (BUY) or receive (SELL)
  price: number;       // probability price 0–1
}

export interface SignedOrder {
  order: Record<string, string | number>;
  signature: string;
  owner: string;
  orderType: string;
}

export async function buildAndSignOrder(params: OrderParams): Promise<SignedOrder> {
  const { tokenId, side, sizeUsdc, price } = params;
  const wallet = getWallet();
  const address = wallet.address;

  const sideInt = side === "BUY" ? 0 : 1;

  // For a BUY:  maker pays USDC, taker receives shares
  // For a SELL: maker gives shares, taker receives USDC
  const makerAmount = toMicro(sizeUsdc);
  // shares = USDC / price
  const takerAmount = toMicro(sizeUsdc / price);

  const orderStruct = {
    salt:          BigInt(Math.floor(Math.random() * 1e15)),
    maker:         address,
    signer:        address,
    taker:         "0x0000000000000000000000000000000000000000",
    tokenId:       BigInt(tokenId),
    makerAmount,
    takerAmount,
    expiration:    BigInt(0),          // 0 = no expiry
    nonce:         BigInt(0),
    feeRateBps:    BigInt(0),
    side:          sideInt,
    signatureType: 0,                  // EOA signature
  };

  const signature = await wallet.signTypedData(DOMAIN, ORDER_TYPES, orderStruct);

  // CLOB API expects string values for uint fields
  const orderForApi: Record<string, string | number> = {
    salt:          orderStruct.salt.toString(),
    maker:         address,
    signer:        address,
    taker:         "0x0000000000000000000000000000000000000000",
    tokenId:       tokenId,
    makerAmount:   makerAmount.toString(),
    takerAmount:   takerAmount.toString(),
    expiration:    "0",
    nonce:         "0",
    feeRateBps:    "0",
    side:          sideInt,
    signatureType: 0,
  };

  return { order: orderForApi, signature, owner: address, orderType: "GTC" };
}

// ── Order submission ──────────────────────────────────────────────────────────

export async function submitOrder(signed: SignedOrder): Promise<{ id: string; status: string }> {
  const body = JSON.stringify(signed);
  const headers = buildL2Headers("POST", "/order", body);

  const res = await fetch(`${CLOB_BASE}/order`, {
    method: "POST",
    headers,
    body,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.error ?? `CLOB error ${res.status}: ${JSON.stringify(data)}`);
  }

  return { id: data.orderID ?? data.id ?? "unknown", status: data.status ?? "submitted" };
}

// ── Account info ──────────────────────────────────────────────────────────────

export async function fetchBalance(): Promise<number> {
  const path = "/balance-allowance?asset_type=USDC";
  const headers = buildL2Headers("GET", path);
  const res = await fetch(`${CLOB_BASE}${path}`, { headers });
  if (!res.ok) return 0;
  const data = await res.json();
  return parseFloat(data?.balance ?? "0");
}

export async function fetchOpenOrders(): Promise<any[]> {
  const path = "/orders?status=live";
  const headers = buildL2Headers("GET", path);
  const res = await fetch(`${CLOB_BASE}${path}`, { headers });
  if (!res.ok) return [];
  return res.json();
}

export { deriveAddress };
