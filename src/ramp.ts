import { getAddress, type Hex } from "viem";
import { GiftApiError } from "./gift-api";

/**
 * What the payout service will take today, asked of the service rather than remembered (D76).
 *
 * Their smallest and largest sale are published in euros and move with the rate: read twice on 16 Sep, USDC on
 * Monad was 6.51 EUR to 14,738.33 EUR, while their buy endpoint said 6.25 at the same moment. A sentence on a
 * screen saying "from 6.50 EUR" would therefore be wrong on most days, so nothing says it: the screen prints
 * what this returns.
 *
 * Their endpoint takes no country, so what comes back is the euro-zone list and not an answer about any one
 * person: who may sell from where is decided further along their own flow, and Viky does not pretend to know
 * it. What we do know, and refuse early, is an amount their own list puts out of range.
 */

const ASSETS = "https://api.ramp.network/api/host-api/v3/offramp/assets";
const CHAIN = "MONAD";

export type PayoutAsset = Readonly<{
  /** The coin's contract, which must be the one we send: their list names it, and we check ours against it. */
  address: Hex;
  decimals: number;
  /** Their smallest and largest sale, in the currency they quote (euros for this list). */
  minFiat: number;
  maxFiat: number;
  currency: string;
  /** What one coin is worth in that currency, by their own price, which is how an amount is compared. */
  price: number;
}>;

type RampAsset = {
  symbol?: string;
  chain?: string;
  address?: string | null;
  decimals?: number;
  enabled?: boolean;
  hidden?: boolean;
  minPurchaseAmount?: number;
  maxPurchaseAmount?: number;
  price?: Record<string, number>;
};

/**
 * Read at each quote rather than cached for long: their figures move with the rate, and a stale one would be a
 * sentence about money that was true an hour ago. Short enough to spare their endpoint a burst, short enough
 * that nobody reads yesterday's minimum.
 */
const FRESH_MS = 60_000;
let cached: { at: number; asset: PayoutAsset; symbol: string } | undefined;

export async function payoutAsset(symbol = "USDC", currency = "EUR"): Promise<PayoutAsset> {
  const now = Date.now();
  if (cached && cached.symbol === symbol && now - cached.at < FRESH_MS) return cached.asset;

  let list: RampAsset[];
  try {
    const response = await fetch(ASSETS, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`status ${response.status}`);
    const body = (await response.json()) as { assets?: RampAsset[] };
    list = body.assets ?? [];
  } catch {
    throw new GiftApiError("PAYOUT_SERVICE_SILENT", "The payout service is not answering. Try again shortly.", 503);
  }

  const found = list.find((asset) => asset.symbol === symbol && asset.chain === CHAIN);
  if (!found || !found.address || found.enabled !== true) {
    throw new GiftApiError("PAYOUT_ASSET_CLOSED", "The payout service is not taking this coin right now.", 503);
  }
  const price = found.price?.[currency];
  if (typeof price !== "number" || price <= 0 || typeof found.minPurchaseAmount !== "number" || typeof found.maxPurchaseAmount !== "number") {
    throw new GiftApiError("PAYOUT_SERVICE_SILENT", "The payout service is not answering. Try again shortly.", 503);
  }

  const asset: PayoutAsset = {
    address: getAddress(found.address),
    decimals: found.decimals ?? 6,
    minFiat: found.minPurchaseAmount,
    maxFiat: found.maxPurchaseAmount,
    currency,
    price,
  };
  cached = { at: now, asset, symbol };
  return asset;
}

/** What an amount of the coin is worth in their currency, by their own price. */
export function inFiat(units: bigint, asset: PayoutAsset): number {
  return (Number(units) / 10 ** asset.decimals) * asset.price;
}

export type PayoutRange = { tooSmall: boolean; tooLarge: boolean; fiat: number };

/** Whether they would take a sale of this size today, said before the person leaves Viky to place one. */
export function withinPayoutRange(units: bigint, asset: PayoutAsset): PayoutRange {
  const fiat = inFiat(units, asset);
  return { tooSmall: fiat < asset.minFiat, tooLarge: fiat > asset.maxFiat, fiat };
}
