import { AUSD } from "./coins";
import { dollarsToTheCent, toTheCent } from "./exit-steps";

/**
 * What an account can pay a gift with, as the pay sheet knows it at one moment (the founder, 5 Oct 2026). Browser
 * safe, pure.
 *
 * A tester who had the money read "Pay … by card". The sheet counted what the account holds as zero until it had been
 * read, and for ever when the reading failed, so its button named the card and a press led there. And it read one
 * coin: the dollars a card had already delivered were not counted, while Home counted them.
 *
 * So what the account holds is one of three things, and the card is the answer to one of them only: read and short.
 * And it is the amount Home says (`useMoneyHeld`, app/kit/money.ts): both dollar coins, each cut to the cent, what the
 * person's gifts have already paid them, and the chain's own coin at the exchange's quote. The screen that waits turns
 * each of them into what a gift holds, in that order (src/funding-step.ts).
 */
export type HeldParts = Readonly<{
  ausd: bigint;
  /** The other dollar coin, which a card delivers. Nothing where the step that changes it does not exist. */
  usdc: bigint;
  /** What the person's gifts have already paid them and still hold (D208). */
  inGifts: bigint;
  /** The chain's own coin above what the account keeps, when it is a payment worth changing; nothing otherwise. */
  coin: bigint;
  /** What the exchange quotes for that coin, in the units a gift holds; null when the quote did not answer. */
  coinWorth: bigint | null;
}>;

export type HeldReading = Readonly<{ state: "reading" } | { state: "unread" } | { state: "read"; parts: HeldParts }>;

/** The one amount, counted as Home counts it. A quote that did not answer leaves its coin out. */
export function unitsHeld(parts: HeldParts): bigint {
  return dollarsToTheCent(parts.ausd + parts.inGifts, parts.usdc) + (parts.coin > 0n && parts.coinWorth !== null ? toTheCent(parts.coinWorth, AUSD.decimals) : 0n);
}

/**
 * What pays for the gift: the account, the card, or nothing that can be named yet.
 *
 * - Nobody signed in holds nothing here: the card, and the press makes the account.
 * - "reading": the account has not been read. The button names no way and does not go.
 * - "unread": the reading failed, or the chain's coin is what the gift needs and its quote did not answer. It is said,
 *   with a way to read again. Never the card by default.
 */
export type PayWith = "account" | "card" | "reading" | "unread";

export function payWith(input: Readonly<{ signedIn: boolean; held: HeldReading; wanted: bigint | undefined }>): PayWith {
  if (!input.signedIn) return "card";
  if (input.held.state !== "read") return input.held.state;
  // A gift not filled in yet has no amount to cover: the button waits on the card's fields, as it did.
  if (input.wanted === undefined) return "card";
  const { parts } = input.held;
  if (unitsHeld(parts) >= input.wanted) return "account";
  return parts.coin > 0n && parts.coinWorth === null ? "unread" : "card";
}

/** The amount the sheet's lines count from the account: what is held once it is read, and nothing it has not read. */
export function heldForTheLines(signedIn: boolean, held: HeldReading): bigint {
  return signedIn && held.state === "read" ? unitsHeld(held.parts) : 0n;
}
