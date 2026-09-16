import type { Hex } from "viem";
import { AUSD_ADDRESS, USDC_ADDRESS } from "./monad/chain";

/**
 * The coins a person can hold in Viky, in one place, because the send route, the browser, the amount field and
 * the way out each used to carry their own copy of the same facts and only one of them was ever updated.
 *
 * A gift holds AUSD. The way out changes it into what a payout service takes, and the two services take
 * different ones (D77): a stablecoin for the euro rail, the chain's own coin for the card rail. So from the
 * moment the way out exists, an account can hold three different things and every one of them has to be
 * readable, formattable and sendable.
 *
 * **The two kinds are not the same mechanism, and that is not a detail.** A token with EIP-3009 can be moved by
 * a signature alone, which Viky's relayer submits and pays for, so the person's account needs nothing. The
 * chain's own coin has no such thing: nobody can move it on somebody else's behalf, so the person sends it
 * themselves and pays the fee out of it. That is the one place where "nothing to pay" stops being true, and a
 * screen that says otherwise would be wrong.
 */

export type Coin = Readonly<{
  /** What the person sees. Not a ticker for its own sake: they have to pick the right one on a payout page. */
  symbol: string;
  /** Zero is the chain's own coin, exactly as `ExitTerms.tokenOut` names it. */
  address: Hex;
  decimals: number;
  /** How money of this kind is written: a dollar sign for the stablecoins, the symbol after for the rest. */
  dollars: boolean;
  /**
   * The EIP-3009 domain, measured on chain, or undefined when there is nothing to sign against. A wrong name
   * or version here is not a small error: every signature would be refused by the token and nobody could be
   * paid, which is why these are read rather than remembered.
   */
  domain?: Readonly<{ name: string; version: string }>;
}>;

export const NATIVE_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

/** What a gift holds. Domain measured on mainnet (D5). */
export const AUSD: Coin = {
  symbol: "AUSD",
  address: AUSD_ADDRESS,
  decimals: 6,
  dollars: true,
  domain: { name: "Agora Dollar", version: "1" },
};

/**
 * What the euro payout service takes. Read on chain on 16 Sep 2026 at https://rpc.monad.xyz: `name` USDC,
 * `version` 2, six decimals, and `transferWithAuthorization` present (an empty probe reverts with
 * "FiatTokenV2: authorization is expired", which proves the function is there and which implementation it is).
 * So it moves on a signature exactly as AUSD does, under its own domain.
 */
export const USDC: Coin = {
  symbol: "USDC",
  address: USDC_ADDRESS,
  decimals: 6,
  dollars: true,
  domain: { name: "USDC", version: "2" },
};

/**
 * What the card payout service takes. The chain's own coin, so there is **no domain and no signature path**:
 * an authorization is a feature of a token contract, and this is not one. The person sends it themselves, out
 * of the coin they just received, and the fee comes out of the same place.
 */
export const MON: Coin = {
  symbol: "MON",
  address: NATIVE_ADDRESS,
  decimals: 18,
  dollars: false,
};

export const COINS: readonly Coin[] = [AUSD, USDC, MON];

export function isNative(coin: Coin): boolean {
  return coin.address === NATIVE_ADDRESS;
}

/** Whether Viky's relayer can move this on the person's behalf. False for the chain's own coin, always. */
export function movesOnASignature(coin: Coin): boolean {
  return coin.domain !== undefined && !isNative(coin);
}

/** The coin at an address, or undefined. Used to refuse anything that is not one of ours before it goes far. */
export function coinAt(address: string): Coin | undefined {
  const wanted = address.trim().toLowerCase();
  return COINS.find((coin) => coin.address.toLowerCase() === wanted);
}

/**
 * An amount written out in full, to the last decimal the coin has, with trailing zeros dropped but never below
 * two. This is the one place a figure is written exactly, because a payout service is ordered for a quantity
 * and expects exactly that quantity to arrive (D75).
 */
export function exactly(units: bigint, coin: Coin): string {
  const scale = 10n ** BigInt(coin.decimals);
  const whole = units / scale;
  const raw = (units % scale).toString().padStart(coin.decimals, "0");
  // Trimmed one zero at a time rather than with a fixed-width pattern: the old one assumed six decimals, and
  // against eighteen it would have cut a real digit off the end of somebody's money.
  let fraction = raw;
  while (fraction.length > 2 && fraction.endsWith("0")) fraction = fraction.slice(0, -1);
  return coin.dollars ? `$${whole}.${fraction}` : `${whole}.${fraction} ${coin.symbol}`;
}
