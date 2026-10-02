import { getAddress, type Hex, type LocalAccount } from "viem";
import { receiveAuthorizationTypedData, type ReceiveAuthorizationMessage } from "../ausd-authorization";
import { EXIT_ROUTER } from "../viky-contracts";
import { ApiError, postJson } from "./api";

/**
 * The way out, from the browser: ask what an exchange would give, then sign once.
 *
 * One signature does everything, because the nonce of the AUSD authorization is the hash of the terms
 * themselves (src/exit-terms.ts). The person's own account calls no contract and needs no MON, which on Monad
 * is not a nicety: an account below the 10 MON reserve cannot make a contract call at all (D53), and a
 * recipient holds a gift and nothing else.
 *
 * What this does NOT do is pay anybody. The proceeds come back to the person, and sending the payout service
 * its coin is a second, separate signature they make themselves, from their own account, because a transfer
 * made by a contract is one no deposit detector is known to read (D76).
 */

export type WayOutQuote = Readonly<{
  /** The least that will come back, in the coin the chosen way out takes, written to its last decimal. */
  shown: string;
  /** What that way out buys, in the words the screen shows. */
  sells: string;
  name: string;
  /**
   * Their own figures, when that service publishes them somewhere we can read. Absent rather than guessed for
   * one that does not: a number nobody read is exactly what this project refuses to print.
   */
  payout?: Readonly<{ currency: string; worth: number; smallest: number; largest: number }>;
  /**
   * The dollars' worth that stays in the account, when the coin that comes back is one an account must keep some of
   * to be able to send at all (D53). Already taken out of `shown`. Absent when nothing is kept.
   */
  kept?: string;
  /** Carries the floor and the coin back to the next step, signed by us so neither can be changed on the way. */
  ticket: string;
}>;

/** What an exchange would give for this much, down the corridor they chose: for a mobile money payout, its country's. */
export function quoteWayOut(input: { amount: bigint; coin: Hex; mobileMoneyIn?: string }): Promise<WayOutQuote> {
  return postJson<WayOutQuote>("/api/exit/quote", {
    amount: input.amount.toString(),
    coin: input.coin,
    ...(input.mobileMoneyIn ? { purpose: "mobile-money", country: input.mobileMoneyIn } : {}),
  });
}

type PreparedTerms = {
  id: string;
  shown: string;
  /** True when this account already signed these exact terms: the same one is relayed again, never a second. */
  signed: boolean;
  authorization: { to: Hex; value: string; validAfter: string; validBefore: string; nonce: Hex };
};

export type WayOutResult = Readonly<{ paid: boolean; hash: Hex | null; shown: string }>;

/**
 * Signs the exchange and has it relayed, or relays the signature already given.
 *
 * Asking again for the same thing returns the terms already signed rather than making new ones, and this
 * follows that: a second live authorization for the same money would mean only one of the two needs to land
 * for the account to be debited, and if both land it is debited twice (src/exit-plan.ts).
 */
/**
 * How many times the whole thing is attempted, signature included.
 *
 * The exchange engraves a minimum into its own bytes that sits 0.040 % under what it quotes, and that margin
 * does not survive a human delay: the attempt of 16 Sep lost 0.3 % between the quote and the relay, seven times
 * it, and the exchange refused its own bytes (D81). Asking that exchange for more slippage returns a minimum
 * equal to the output, no margin at all, so nothing can be bought here. What works is asking again: across
 * fifteen pairs of quotes taken thirty seconds apart, not one was unfillable, so a single retry collapses the
 * chance of a run of them. Three attempts, because the second costs a passkey prompt and the third is already
 * charity to a very unlucky minute.
 */
const ATTEMPTS = 3;

export async function takeTheWayOut(input: { account: LocalAccount; ticket: string }): Promise<WayOutResult> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await oneAttempt(input);
    } catch (error) {
      // Only a route that moved is worth asking again for. Everything else is a real answer: too little back,
      // a closed session, an amount they do not hold, a service that cannot pay. Retrying those would just ask
      // somebody to sign the same refusal twice.
      const moved = error instanceof ApiError && error.code === "QUOTE_STALE";
      if (!moved || attempt >= ATTEMPTS) throw error;
    }
  }
}

async function oneAttempt(input: { account: LocalAccount; ticket: string }): Promise<WayOutResult> {
  // A fresh set of terms each time, because the bytes and the floor both come from one new quote: that is the
  // whole point of asking again. The ticket is the person's own price from before, and it still holds them to
  // no worse than what they read.
  const prepared = await postJson<PreparedTerms>("/api/exit/prepare", { ticket: input.ticket });

  let signature: Hex | undefined;
  if (!prepared.signed) {
    // Built literally rather than through the helper the gift path uses, because that one gives every
    // authorization an hour. This one has to die exactly when the terms do, so nothing spendable outlives the
    // window the contract itself enforces.
    // Signed for the way out this code knows, never for an address a server answer names (the audit, 29 Sep 2026):
    // an answer naming another one is refused before anything is signed.
    if (getAddress(prepared.authorization.to) !== EXIT_ROUTER) {
      throw new ApiError({ status: 409, code: "EXIT_ELSEWHERE", message: "The way out answered with another place to send your money, so nothing was signed and nothing moved." });
    }
    const message: ReceiveAuthorizationMessage = {
      from: getAddress(input.account.address),
      to: EXIT_ROUTER,
      value: BigInt(prepared.authorization.value),
      validAfter: BigInt(prepared.authorization.validAfter),
      validBefore: BigInt(prepared.authorization.validBefore),
      nonce: prepared.authorization.nonce,
    };
    signature = await input.account.signTypedData(receiveAuthorizationTypedData(message));
  }

  const relayed = await postJson<{ paid: boolean; hash: Hex | null }>("/api/exit/relay", {
    id: prepared.id,
    // Sent only when it is new. The route keeps the first signature and no other, so offering a second one for
    // terms already signed is at best noise and at worst a second thing that could be relayed.
    ...(signature ? { signature } : {}),
  });
  return { paid: relayed.paid, hash: relayed.hash, shown: prepared.shown };
}
