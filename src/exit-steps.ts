import { CONVERSION_RESERVE } from "./funding-step";
import { AUSD, isNative, type Coin } from "./coins";
import type { PublishedFee, WayOut } from "./rails";

/**
 * The arithmetic of the three numbered steps of the way out, kept out of the screen so it can be tested.
 *
 * The rule under all of it (design pass, 17 Sep 2026, screen 3.2): a payout service is ordered for a number
 * with two decimals, so the person only ever meets two-decimal numbers, cut down and never rounded up. What is
 * changed is read from the account and never from a flag in memory, which is what makes a reload land on the
 * same step. The dust between the exact balance and the two-decimal number stays in the account, and the
 * screen says so.
 */

/** A balance cut to two decimals, never rounded up: 9.999586 gives 9.99 and 9.99 stays 9.99. */
export function twoDecimalsDown(units: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals);
  const cents = (units * 100n) / scale;
  const whole = cents / 100n;
  const fraction = (cents % 100n).toString().padStart(2, "0");
  return `${whole}.${fraction}`;
}

/** The units of a two-decimal number in a coin: "9.99" in a six-decimal coin is 9,990,000. */
export function unitsOfTwoDecimals(text: string, decimals: number): bigint {
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(2, "0")) * 10n ** BigInt(decimals - 2);
}

export type Ready = Readonly<{
  /** The number to type at the payout service, two decimals, from what the account actually holds. */
  number: string;
  /** Exactly that number in the coin's units, which is what leaves. */
  units: bigint;
  /** What stays behind, in units. */
  dust: bigint;
}>;

/**
 * What is ready to send down one way out, from the balance of the coin that service buys, or nothing when the
 * account holds less than a cent of it. The chain's own coin keeps the reserve an account cannot spend (D53),
 * so only what sits above it counts.
 */
export function readyFor(way: WayOut, coin: Coin, held: bigint): Ready | undefined {
  const spendable = isNative(coin) ? held - CONVERSION_RESERVE : held;
  if (spendable <= 0n) return undefined;
  const number = twoDecimalsDown(spendable, coin.decimals);
  const units = unitsOfTwoDecimals(number, coin.decimals);
  if (units <= 0n) return undefined;
  return { number, units, dust: spendable - units };
}

export type ChangeAmount = Readonly<{ units: bigint; refusal?: undefined } | { units?: undefined; refusal: string }>;

/** The two-decimal dollar amount to get ready, read from the text, against what a gift holds. */
export function dollarsToChange(text: string, held: bigint, refusals: { shape: string; tooMuch: (max: string) => string }): ChangeAmount {
  const match = /^(\d{1,9})(?:[.,](\d{1,2}))?$/.exec(String(text).trim());
  if (!match) return { refusal: refusals.shape };
  const units = BigInt(match[1]) * 1_000_000n + BigInt((match[2] ?? "").padEnd(2, "0")) * 10_000n;
  if (units <= 0n) return { refusal: refusals.shape };
  if (units > held) return { refusal: refusals.tooMuch(twoDecimalsDown(held, AUSD.decimals)) };
  return { units };
}

/**
 * What the payout service keeps on a sale worth this much, and what reaches the bank: the larger of their share
 * and their minimum, both as they publish them (src/rails.ts). Said on the review so the person reads the net
 * and not only a gross minus a fee (founder, 17 Sep 2026).
 */
export function feeApplied(worth: number, fee: PublishedFee): { fee: number; net: number } {
  const applied = Math.max((worth * fee.percent) / 100, fee.minimum);
  const rounded = Math.round(applied * 100) / 100;
  return { fee: rounded, net: Math.max(0, Math.round((worth - rounded) * 100) / 100) };
}

/** "$9.995586", as the quote route writes its floor, cut to the number the person will be able to order. */
export function floorToOrder(shown: string): string {
  const cleaned = shown.replace(/[^0-9.]/g, "");
  const [whole, fraction = ""] = cleaned.split(".");
  return `${whole || "0"}.${fraction.padEnd(2, "0").slice(0, 2)}`;
}
