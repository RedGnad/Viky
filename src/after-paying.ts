import { isAccountError } from "./account/errors";
import { ApiError } from "./client/api";
import { GENERIC_FAILURE } from "./generic-failure";

/**
 * What a call that failed means, and says, on a screen where a card payment is waited for or has just arrived (the
 * founder, 5 Oct 2026). Browser safe, pure.
 *
 * A tester paid, read "something went wrong", left the page, and found their payment again from Home. Whether the
 * sentence was the card service's or ours is not known. Ours could have been: "Something went wrong. Nothing was
 * changed." is what any call answers when it has nothing better, and after a payment "Nothing was changed" may be
 * false.
 *
 * So a failure is one of two things there.
 *
 * - **Unanswered**: the call did not answer, or answered with nothing to say. The server's own error (500 and the
 *   generic sentence), an answer with no sentence, a creation sent and not known to be final yet, the network. Nothing
 *   is known of what it did, so nothing is said of it: the check did not answer, the payment is not lost, and the wait
 *   goes on. The screen stays as it is and asks again.
 * - **Refused**: the call answered, with its own sentence and its own code. That sentence is said, as before.
 */
export function unansweredAfterPaying(error: unknown): boolean {
  if (error instanceof ApiError) return error.code === "FAILED" || error.code === "NOT_FINAL_YET" || error.message === GENERIC_FAILURE;
  // What `fetch` itself throws when nothing came back: the network, or a page gone offline. Each engine has its words.
  return error instanceof TypeError && /fetch|network|load failed/i.test(error.message);
}

/** The two answers of a creation that mean "it is being made": the screen keeps waiting, and their own sentence is true. */
const BEING_MADE = ["IN_PROGRESS", "BEING_RECORDED"];

/**
 * What the screen does with a failure once the money is in the account: keep what it shows and ask again, with the
 * sentence to put under it, or say a refusal. `unanswered` is the sentence for a call that did not answer.
 */
export function afterPaying(error: unknown, unanswered: string): Readonly<{ keep: true; says: string } | { keep: false }> {
  if (unansweredAfterPaying(error)) return { keep: true, says: unanswered };
  if (error instanceof ApiError && BEING_MADE.includes(error.code)) return { keep: true, says: error.message };
  return { keep: false };
}

/**
 * The sentence of a refusal on those screens: the route's own, the passkey's own, or one that is true once money is in
 * the account. Never the generic one: a failure that carries it is unanswered, and is not said as a refusal at all.
 */
export function refusalAfterPaying(error: unknown, otherwise: string): string {
  if (error instanceof ApiError && error.message !== GENERIC_FAILURE) return error.message;
  if (isAccountError(error)) return error.guidance;
  return otherwise;
}
