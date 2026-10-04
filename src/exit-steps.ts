import { CONVERSION_RESERVE } from "./funding-step";
import { AUSD, isNative, type Coin } from "./coins";
import type { RailReach } from "./rail-country";
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

/** A balance in units, cut to the cent: what a two-decimal screen can say of it, and what an order can move. */
export function toTheCent(units: bigint, decimals: number): bigint {
  return unitsOfTwoDecimals(twoDecimalsDown(units, decimals), decimals);
}

/**
 * The dollars an account holds, each coin cut to the cent before they are added. The two dollar coins are added
 * for one figure, and adding their six decimals first let dust under a cent tip the sum: an account holding
 * 10.13 of what a gift holds and 0.0096 left from a payout read "$10.14" above two cards computed on $10.13 (the
 * founder, 20 Sep 2026, D124). Cut first, added after, the figure is the money that can actually move.
 */
export function dollarsToTheCent(ausd: bigint, usdc: bigint, decimals = AUSD.decimals): bigint {
  return toTheCent(ausd, decimals) + toTheCent(usdc, decimals);
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

/**
 * Whether what the account holds of a coin is the money of the withdrawal it has open (src/open-withdrawal.ts): the
 * same coin, and at least what that way out gave back. A balance alone never says a withdrawal: a card payment
 * delivers the same coin, and it is money in the account, not money on its way out (the founder, 3 Oct 2026).
 */
export function heldForWithdrawal(open: Readonly<{ coin: string; atLeast: bigint }> | null | undefined, coin: string, held: bigint): boolean {
  return !!open && open.coin.toLowerCase() === coin.toLowerCase() && open.atLeast > 0n && held >= open.atLeast;
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

/**
 * What a payout service would leave of everything the account holds, in the currency it pays in, so the two ways out
 * can be compared by what reaches the person rather than by which card the country put first (the founder, 19 Sep
 * 2026, after the accent was found sitting on the order).
 *
 * It is an estimate and the screen says so in the two ways the house says it: "about", and the rate's own day. It
 * converts at the published rate and applies the published fee, and it knows nothing of the price the swap will get,
 * which is asked only once an amount is chosen. Nothing at all is answered when no rate was read, because a figure
 * with no rate behind it would be a number nobody read.
 */
export function netOfEverything(
  units: bigint,
  fee: PublishedFee,
  rates: { date: string; eurPerUsd: number } | undefined,
  /** The currency the service pays this person in, when it is not the euro: a bank in the United States is paid dollars. */
  paidIn: string = fee.currency,
): { net: number; currency: string; rateDate: string } | undefined {
  if (!rates || units <= 0n) return undefined;
  // Every payout service we carry publishes its fee in euros, and the conversion Viky reads is euros for dollars.
  if (fee.currency !== "EUR") return undefined;
  const euros = (Number(units) / 1_000_000) * rates.eurPerUsd;
  const left = feeApplied(euros, fee).net;
  if (paidIn === "EUR") return { net: left, currency: "EUR", rateDate: rates.date };
  // Anything else is said in dollars, which is what the account holds: the same fee, counted back at the same rate.
  return { net: Math.round((left / rates.eurPerUsd) * 100) / 100, currency: "USD", rateDate: rates.date };
}

/**
 * The ways out in the order the screen shows them (D124): a way whose own service says it does not serve this
 * country goes last (R1, and that is the only thing a country may do), and among the rest the one that leaves the
 * most reaches the top. A way with no figure, because no rate was read, keeps its place after those with one.
 * Nothing is removed: the screen shows every way, in this order.
 */
export function orderByWhatReaches<T extends { name: string }>(
  ways: readonly T[],
  reach: Readonly<Record<string, RailReach>>,
  netOf: (way: T) => number | undefined,
): readonly T[] {
  const rank = (way: T) => (reach[way.name] === "does-not" ? 1 : 0);
  const net = (way: T) => netOf(way) ?? -1;
  return [...ways].sort((left, right) => rank(left) - rank(right) || net(right) - net(left));
}

/** "$9.995586", as the quote route writes its floor, cut to the number the person will be able to order. */
export function floorToOrder(shown: string): string {
  const cleaned = shown.replace(/[^0-9.]/g, "");
  const [whole, fraction = ""] = cleaned.split(".");
  return `${whole || "0"}.${fraction.padEnd(2, "0").slice(0, 2)}`;
}
