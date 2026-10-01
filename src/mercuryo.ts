import { parseUnits } from "viem";
import { GiftApiError } from "./gift-api";

/**
 * What the card payout service will take today, asked of the service rather than remembered (D60, and the audit of
 * 1 Oct 2026 which found the check gone since commit a11823e).
 *
 * `GET https://api.mercuryo.io/v1.6/lib/limits/sell` answers one row per coin, network and currency. For the chain's
 * own coin on Monad in euros it read, on 1 Oct 2026: `fiat_limits.min` "15.00", and `crypto_limits.min` about 636 of
 * the coin, which moves with its price. A sale under it is refused on their page, after the person's money has been
 * changed into a coin nothing else here takes: so it is refused here first, before anything is changed.
 */

const SELL_LIMITS = "https://api.mercuryo.io/v1.6/lib/limits/sell";

export type CardSellLimits = Readonly<{
  /** Their smallest and largest sale in the currency they pay in, as they publish it. */
  fiatMin: number;
  fiatMax: number;
  currency: string;
  /** The same two bounds counted in the coin's own units. */
  coinMin: bigint;
  coinMax: bigint;
}>;

type Row = { network?: string; crypto?: string; fiat?: string; fiat_limits?: { min?: string; max?: string }; crypto_limits?: { min?: string; max?: string } };

/** As short as the bank service's figures are held (src/ramp.ts): they move with the price. */
const FRESH_MS = 60_000;
let cached: { at: number; limits: CardSellLimits } | undefined;

/** A decimal figure as the coin's units, cut to its eighteen decimals rather than rounded. */
function inUnits(text: string | undefined): bigint | null {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(String(text ?? "").trim());
  if (!match) return null;
  return parseUnits(`${match[1]}.${(match[2] ?? "0").slice(0, 18)}`, 18);
}

/** The row for one coin, network and currency, from their answer, or nothing when it is not there or not readable. */
export function sellLimitsFrom(body: unknown, crypto = "MON", network = "MONAD", fiat = "EUR"): CardSellLimits | null {
  const rows = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(rows)) return null;
  const row = (rows as Row[]).find((one) => one.crypto === crypto && one.network === network && one.fiat === fiat);
  if (!row) return null;
  const fiatMin = Number(row.fiat_limits?.min);
  const fiatMax = Number(row.fiat_limits?.max);
  const coinMin = inUnits(row.crypto_limits?.min);
  const coinMax = inUnits(row.crypto_limits?.max);
  if (!(fiatMin > 0) || !(fiatMax > 0) || coinMin === null || coinMax === null || coinMin <= 0n) return null;
  return { fiatMin, fiatMax, currency: fiat, coinMin, coinMax };
}

/** Their limits now, or a typed refusal when they do not answer: nothing is changed on a limit nobody read. */
export async function cardSellLimits(now = Date.now()): Promise<CardSellLimits> {
  if (cached && now >= cached.at && now - cached.at < FRESH_MS) return cached.limits;
  let body: unknown;
  try {
    const response = await fetch(SELL_LIMITS, { headers: { accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`status ${response.status}`);
    body = await response.json();
  } catch {
    throw new GiftApiError("PAYOUT_SERVICE_SILENT", "The payout service is not answering. Try again shortly.", 503);
  }
  const limits = sellLimitsFrom(body);
  if (!limits) throw new GiftApiError("PAYOUT_ASSET_CLOSED", "The payout service is not taking this right now.", 503);
  cached = { at: now, limits };
  return limits;
}

/** The same read for a screen that only says the figure: nothing rather than a refusal when they do not answer. */
export async function cardSellMinimum(): Promise<Readonly<{ amount: number; currency: string }> | null> {
  try {
    const limits = await cardSellLimits();
    return { amount: limits.fiatMin, currency: limits.currency };
  } catch {
    return null;
  }
}

/**
 * What must stay in the account of the coin that comes back, and what is left to sell (D53): an account under the
 * reserve can send nothing, so the first time, the reserve is kept out of what the exchange gives. An account that
 * already holds it keeps nothing more.
 */
export function afterTheReserve(floor: bigint, held: bigint, reserve: bigint): Readonly<{ kept: bigint; sendable: bigint }> {
  const kept = held >= reserve ? 0n : reserve - held;
  return { kept, sendable: floor > kept ? floor - kept : 0n };
}

/**
 * The dollars to send so that at least the service's smallest sale is left once the reserve is kept, at the rate this
 * very quote gave, a hundredth added and cut up to the cent. Said in dollars, since that is what the person decides on.
 */
export function dollarsForTheMinimum(input: Readonly<{ amount: bigint; floor: bigint; kept: bigint; coinMin: bigint }>): bigint {
  if (input.floor <= 0n) return 0n;
  const needed = ((input.coinMin + input.kept) * input.amount * 101n) / (input.floor * 100n);
  return ((needed + 9_999n) / 10_000n) * 10_000n;
}
