/**
 * What the funder's screen should do next while it watches for a card payment. Pulled out of the component
 * so the decision can be tested: the screen turns real money into a gift without anyone tapping again, and
 * a wrong branch here either converts money that has not arrived or leaves a payment sitting for ever.
 *
 * Every amount is in the units the chain uses, and nothing here touches the chain: it is a decision about
 * two balances, and nothing else.
 */

/**
 * What stays behind after the conversion, and it is not a gas reserve: Monad holds 10 MON per account, and
 * an account that ends below it cannot make a contract call (D53, D56). Leaving 0.2 MON behind, as this did,
 * risked a conversion that the chain refuses and euros stuck as MON. Eleven costs about $0.26 of a 25 EUR
 * purchase, measured on 14 Sep 2026 at 0.0232 AUSD per MON, and it leaves the account able to act again.
 */
export const CONVERSION_RESERVE = 11_000_000_000_000_000_000n;
/** Below this much above the reserve, an arriving balance is not a card payment worth converting. */
export const ARRIVAL_FLOOR = 1_000_000_000_000_000_000n;

/** How often the waiting screen looks at the account. */
export const POLL_MS = 8_000;
/**
 * How long a conversion that failed is left alone before it is tried again: shorter than a look, so the look after a
 * failure tries, and no look before it does.
 *
 * The defect it answers (the audit of 1 Oct 2026): the screen's phase is what its watch depends on, a failed
 * conversion puts the phase back to waiting, and the watch started again at once and converted again at once. With
 * the price not answering, that was 596 to 717 requests in twelve seconds, the screen flickering between three
 * states and the account's 180 readings spent. The money never moved; the screen did.
 */
export const RETRY_PAUSE_MS = 6_000;

/** Whether a conversion that failed at `failedAtMs` is still being left alone at `nowMs`. Never failed: never paused. */
export function pausedAfterFailure(failedAtMs: number | null, nowMs: number): boolean {
  return failedAtMs !== null && nowMs >= failedAtMs && nowMs - failedAtMs < RETRY_PAUSE_MS;
}

export type FundingStep =
  | { do: "give" }
  /** The account alone is short and the person's gifts hold money for them: all of it is taken into the account first. */
  | { do: "takeFromGifts" }
  | { do: "convert"; amount: bigint }
  /** USDC arrived, the other dollar coin a card can deliver: all of it is changed, by a signature the relayer carries. */
  | { do: "convertUsdc"; amount: bigint }
  | { do: "wait"; sawSomething: boolean };

/**
 * Whether what sits in the account is a card payment worth turning into what a gift holds, rather than dust. The same
 * test decides what the waiting page converts and what the check offers to use (D74).
 */
export function paymentArrived(arriving: bigint): boolean {
  return arriving > ARRIVAL_FLOOR + CONVERSION_RESERVE;
}

/**
 * How much of the chain's own coin an account holds that can be changed for what a gift holds: everything above what
 * the account keeps, when that is a payment worth changing, and nothing otherwise. The same amount the waiting screen
 * changes when a card delivers it, so every screen that counts it or changes it means the same money.
 */
export function chainCoinToChange(held: bigint): bigint {
  return paymentArrived(held) ? held - CONVERSION_RESERVE : 0n;
}

/** Under one dollar of USDC nothing is changed (`SMALLEST_CONVERSION` in src/usdc-router.ts, the same figure). */
export const USDC_ARRIVAL_FLOOR = 1_000_000n;

export function nextFundingStep(input: {
  held: bigint;
  arriving: bigint;
  wanted: bigint;
  failedAtMs?: number | null;
  nowMs?: number;
  /** The USDC in the account, read only where the step that changes it exists; nothing otherwise. */
  arrivingUsdc?: bigint;
  /** What the person's gifts have already paid them and still hold (D208); nothing when unread or none. */
  inGifts?: bigint;
}): FundingStep {
  // Enough already: the gift can be made, and nothing else should be converted or taken.
  if (input.held >= input.wanted) return { do: "give" };
  // The person's own money first (the founder, 4 Oct 2026): what their gifts hold for them is what a gift holds
  // already, so nothing of it is lost to a price. Taken before anything a card delivered is changed, and before the
  // card is waited for. The screen tries it once: a taking that was refused is said, and no longer counted here.
  if ((input.inGifts ?? 0n) > 0n) return { do: "takeFromGifts" };
  // USDC before the chain's coin: it is a dollar already, so nothing of it is lost to a price, and none is kept back.
  if ((input.arrivingUsdc ?? 0n) >= USDC_ARRIVAL_FLOOR) {
    if (pausedAfterFailure(input.failedAtMs ?? null, input.nowMs ?? 0)) return { do: "wait", sawSomething: true };
    return { do: "convertUsdc", amount: input.arrivingUsdc! };
  }
  // Something arrived, and enough of it that converting leaves more than it costs.
  if (paymentArrived(input.arriving)) {
    // A conversion that has just failed is not tried again at once: the screen waits, and the next look tries.
    if (pausedAfterFailure(input.failedAtMs ?? null, input.nowMs ?? 0)) return { do: "wait", sawSomething: true };
    return { do: "convert", amount: input.arriving - CONVERSION_RESERVE };
  }
  // Nothing worth acting on. `sawSomething` only changes what the person is told, never what is done.
  return { do: "wait", sawSomething: input.arriving > 0n || (input.arrivingUsdc ?? 0n) > 0n };
}

/** The steps of giving before any money moves: who, how much, the check, and an account when there is none. */
export type FundingStage = "who" | "howMuch" | "check" | "account";

/**
 * The step a funder sees. The account step exists to make an account, so once there is one it has nothing left to
 * offer, and on 15 Sep it offered nothing at all: the funder made their account and had to guess that Back led to
 * the payment. An account step with an account shows the check again, with its button to pay.
 */
export function fundingStageShown(stage: FundingStage, signedIn: boolean): FundingStage {
  return stage === "account" && signedIn ? "check" : stage;
}
