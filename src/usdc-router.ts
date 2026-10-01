import { getAddress, type Hex } from "viem";
import { exitNonce, type ExitTerms } from "./exit-terms";
import { AUSD_ADDRESS } from "./monad/chain";

/**
 * The converter's USDC half (the founder, 1 Oct 2026): a card payment that arrives as USDC becomes what a gift holds.
 *
 * Browser safe. The contract is a second copy of `ExitRouter`, set at its deployment on USDC where the way out's is
 * set on what a gift holds: nothing in the contract changes, and the coin that comes back is named in the signed
 * terms as it always was (D77). It exists for the same rule of the chain the way out exists for (D53): an account
 * under ten of the chain's coin can call no contract, and a funder whose card just bought USDC holds none. So they
 * sign once, the relayer submits, and the router hands them everything that came back.
 *
 * **It is not deployed.** Its address is `NEXT_PUBLIC_USDC_ROUTER_ADDRESS`, which nobody has set, and while it is
 * absent nothing here runs: the waiting screen reads no USDC and both routes answer that Viky is not ready. The
 * address is public on purpose, because the browser signs for the address this code knows and never for one a server
 * answer names (the audit of 29 Sep 2026, as `src/client/exit.ts` does for the way out).
 */
export function usdcRouterAddress(): Hex | undefined {
  const value = process.env.NEXT_PUBLIC_USDC_ROUTER_ADDRESS?.trim() ?? "";
  return /^0x[0-9a-fA-F]{40}$/.test(value) ? getAddress(value) : undefined;
}

/**
 * The least a conversion may give back, for each ten thousand taken. Nobody is shown a rate here, because nobody is
 * asked anything: one dollar coin becomes another and the gift starts by itself. So the floor is not the person's own
 * reading of a quote, as it is on the way out, it is a rule: under ninety-nine for a hundred, nothing moves. The server
 * refuses to prepare such terms and the browser refuses to sign them, each on its own count.
 */
export const CONVERSION_FLOOR_PER_TEN_THOUSAND = 9_900n;

/** Both coins count six decimals, so the floor is counted in the same units as what is taken. */
export function conversionFloor(amount: bigint): bigint {
  return (amount * CONVERSION_FLOOR_PER_TEN_THOUSAND) / 10_000n;
}

/** Under one dollar nothing is converted: the relayer would pay more to carry it than a gift could use of it. */
export const SMALLEST_CONVERSION = 1_000_000n;

/** How long terms may have left to live when the browser is asked to sign them: the way out's window, and a margin. */
const LONGEST_WINDOW_SECONDS = 20 * 60;

/**
 * Why the browser will not sign these terms, or nothing when it will.
 *
 * The signature is an authorization whose nonce is the hash of the terms, so what is signed is whatever the terms say.
 * The way out signs the nonce a server answer gives it, having read the floor on a screen first. Here no screen showed
 * anything, so the terms themselves come back with the nonce and are read: whose money, how much, which coin comes
 * back, the least of it, until when, and that the nonce is theirs.
 */
export function conversionRefusal(
  terms: ExitTerms,
  expected: Readonly<{ payer: Hex; amount: bigint; nonce: Hex; value: bigint; nowSeconds: number }>,
): string | null {
  if (getAddress(terms.payer) !== getAddress(expected.payer)) return "the terms name another account";
  if (terms.amount !== expected.amount || expected.value !== expected.amount) return "the terms take another amount";
  if (getAddress(terms.tokenOut) !== getAddress(AUSD_ADDRESS)) return "the terms give back another coin";
  if (terms.minOut < conversionFloor(terms.amount)) return "the terms give back too little";
  if (terms.deadline <= BigInt(expected.nowSeconds)) return "the terms have expired";
  if (terms.deadline > BigInt(expected.nowSeconds + LONGEST_WINDOW_SECONDS)) return "the terms stay open too long";
  if (exitNonce(terms).toLowerCase() !== expected.nonce.toLowerCase()) return "the nonce is not these terms'";
  return null;
}

/** The terms as they travel in JSON: every figure as text, since a balance has more digits than a number holds. */
export type TermsInJson = Readonly<{ payer: Hex; amount: string; tokenOut: Hex; minOut: string; exchange: Hex; callHash: Hex; deadline: string; salt: Hex }>;

export function termsToJson(terms: ExitTerms): TermsInJson {
  return { ...terms, amount: terms.amount.toString(), minOut: terms.minOut.toString(), deadline: terms.deadline.toString() };
}

export function termsFromJson(terms: TermsInJson): ExitTerms {
  return { ...terms, amount: BigInt(terms.amount), minOut: BigInt(terms.minOut), deadline: BigInt(terms.deadline) };
}
