import { getAddress, type Hex, type LocalAccount } from "viem";
import { receiveAuthorizationTypedData, type ReceiveAuthorizationMessage } from "../ausd-authorization";
import { postJson } from "./api";

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
  /** Carries the floor and the coin back to the next step, signed by us so neither can be changed on the way. */
  ticket: string;
}>;

/** What an exchange would give for this much, down the corridor they chose. */
export function quoteWayOut(input: { amount: bigint; coin: Hex }): Promise<WayOutQuote> {
  return postJson<WayOutQuote>("/api/exit/quote", { amount: input.amount.toString(), coin: input.coin });
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
export async function takeTheWayOut(input: { account: LocalAccount; ticket: string }): Promise<WayOutResult> {
  const prepared = await postJson<PreparedTerms>("/api/exit/prepare", { ticket: input.ticket });

  let signature: Hex | undefined;
  if (!prepared.signed) {
    // Built literally rather than through the helper the gift path uses, because that one gives every
    // authorization an hour. This one has to die exactly when the terms do, so nothing spendable outlives the
    // window the contract itself enforces.
    const message: ReceiveAuthorizationMessage = {
      from: getAddress(input.account.address),
      to: getAddress(prepared.authorization.to),
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
