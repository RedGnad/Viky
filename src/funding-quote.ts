import type { Hex } from "viem";

/**
 * What a conversion the funder's own account sends must be, before it is sent (the audit of 1 Oct 2026). Browser safe.
 *
 * The exchange answers a transaction: where to send it, with how much of the coin the card bought, and the bytes.
 * The funder's account then sends exactly that, so an answer naming another destination, or another amount, would
 * move their money somewhere nobody chose. Two things are held: the destination is the one exchange Viky uses, and the
 * amount sent is the amount that was asked to be converted, neither more nor less. The server checks it before it
 * answers, and the browser checks it again before it sends, against the chain rather than against the server.
 */
export type FundingQuote = Readonly<{ to: Hex; data: Hex; value: string }>;

/** The amount the answer sends is the amount that was asked for. An amount that is not a whole number is not. */
export function sendsExactly(quote: Pick<FundingQuote, "value">, amount: bigint): boolean {
  try {
    return BigInt(quote.value) === amount;
  } catch {
    return false;
  }
}

/** The answer goes to that exchange and sends that amount. */
export function quoteIsFor(quote: Pick<FundingQuote, "to" | "value">, amount: bigint, exchange: string): boolean {
  return typeof quote.to === "string" && quote.to.toLowerCase() === exchange.toLowerCase() && sendsExactly(quote, amount);
}
