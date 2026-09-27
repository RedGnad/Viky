import { getAddress, type Hex } from "viem";
import { AUSD_ADDRESS, MONAD_CHAIN_ID } from "./monad/chain";

/**
 * The way a phone or gift card order is paid without a float (the founder, 28 Sep 2026): the person's AUSD, on Monad,
 * pays Bitrefill's invoice in USDC on Base through Relay (relay.link), a cross-chain solver network. Relay gives a
 * strict deposit address for one order: an exact transfer of AUSD to it on Monad has exactly the invoice's USDC
 * delivered to Bitrefill's payment address on Base, in about two seconds; too little, or a fill that cannot complete,
 * is refunded to the treasury on Monad (docs.relay.link, "Deposit Addresses" and "Refunds", read 28 Sep 2026).
 */

export const RELAY_API = "https://api.relay.link";
export const BASE_CHAIN_ID = 8453;
export const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

export type BridgeQuote = Readonly<{ depositAddress: Hex; ausdUnits: bigint; requestId: string }>;

export class BridgeError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "BridgeError";
  }
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * The AUSD an order costs on Monad for exactly `usdcUnits` of USDC to reach `payTo` on Base, and where to send it.
 * Everything Relay answers is checked against what was asked: the chains, the coins, the exact output, the recipient.
 */
export async function quoteAusdToBaseUsdc(input: Readonly<{ usdcUnits: bigint; payTo: string; treasury: Hex }>, fetchImpl: Fetch = fetch): Promise<BridgeQuote> {
  const payTo = getAddress(input.payTo);
  let response: Response;
  try {
    response = await fetchImpl(`${RELAY_API}/quote/v2`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        user: input.treasury,
        originChainId: MONAD_CHAIN_ID,
        destinationChainId: BASE_CHAIN_ID,
        originCurrency: AUSD_ADDRESS,
        destinationCurrency: BASE_USDC,
        amount: input.usdcUnits.toString(),
        tradeType: "EXACT_OUTPUT",
        recipient: payTo,
        useDepositAddress: true,
        strict: true,
        refundTo: input.treasury,
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new BridgeError("Relay could not be reached", { cause: error });
  }
  const body = (await response.json().catch(() => ({}))) as {
    steps?: Array<{ depositAddress?: unknown; requestId?: unknown }>;
    details?: { currencyIn?: { amount?: unknown; currency?: { address?: unknown; chainId?: unknown } }; currencyOut?: { amount?: unknown; minimumAmount?: unknown; currency?: { address?: unknown; chainId?: unknown } }; recipient?: unknown };
    message?: unknown;
  };
  if (!response.ok) throw new BridgeError(`Relay refused the quote: ${typeof body.message === "string" ? body.message : response.status}`);
  const step = body.steps?.[0];
  const into = body.details?.currencyIn;
  const out = body.details?.currencyOut;
  const same = (a: unknown, b: string) => typeof a === "string" && a.toLowerCase() === b.toLowerCase();
  if (
    !step || typeof step.depositAddress !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(step.depositAddress) || typeof step.requestId !== "string" ||
    !into || !same(into.currency?.address, AUSD_ADDRESS) || into.currency?.chainId !== MONAD_CHAIN_ID || typeof into.amount !== "string" || !/^\d+$/.test(into.amount) ||
    !out || !same(out.currency?.address, BASE_USDC) || out.currency?.chainId !== BASE_CHAIN_ID || String(out.amount) !== input.usdcUnits.toString() || String(out.minimumAmount ?? out.amount) !== input.usdcUnits.toString() ||
    !same(body.details?.recipient, payTo)
  ) {
    throw new BridgeError("Relay answered a quote that is not the one asked for");
  }
  return { depositAddress: getAddress(step.depositAddress) as Hex, ausdUnits: BigInt(into.amount), requestId: step.requestId };
}

export type BridgeStatus = "waiting" | "pending" | "success" | "refund" | "failure" | "unknown";

/** Where one of Relay's requests stands (docs.relay.link, "Get Status"); anything unreadable is "unknown", never a failure. */
export async function bridgeStatus(requestId: string, fetchImpl: Fetch = fetch): Promise<BridgeStatus> {
  try {
    const response = await fetchImpl(`${RELAY_API}/intents/status/v3?requestId=${encodeURIComponent(requestId)}`, { signal: AbortSignal.timeout(10_000) });
    const body = (await response.json().catch(() => ({}))) as { status?: unknown };
    const status = String(body.status ?? "");
    if (status === "depositing") return "pending";
    return (["waiting", "pending", "success", "refund", "failure"] as const).find((known) => known === status) ?? "unknown";
  } catch {
    return "unknown";
  }
}
