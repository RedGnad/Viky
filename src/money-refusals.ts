/**
 * Which refusals of the routes behind "Spend or withdraw" are said in the route's own sentence (the founder, 12 Oct
 * 2026). He sent to another of his accounts and read "Viky could not finish this, and nothing was taken." where the
 * route had said why: the smallest amount Viky sends. A refusal that has a sentence of its own is never replaced by the
 * screen's last sentence, on a screen about money least of all.
 *
 * Three lists and no fourth. A refusal a route of this screen can give is in one of them, and a test holds that: a new
 * one fails there until somebody decides which it is, instead of ending as "could not finish this" by default.
 *
 * Client-safe: codes and nothing else.
 */

/** The route measured the fact, or refused by a rule it names: its sentence is the true one, and it is shown as it is. */
export const SAID_BY_THE_ROUTE: ReadonlySet<string> = new Set([
  // What the account holds, and the smallest and the largest amounts.
  "NOT_ENOUGH",
  "NOT_ENOUGH_EARNED",
  "TOO_SMALL_TO_RELAY",
  "BELOW_PAYOUT_MINIMUM",
  "ABOVE_PAYOUT_MAXIMUM",
  "OVER_CEILING",
  "INVALID_AMOUNT",
  // How many actions Viky sends for an account, and how many attempts a route takes.
  "RELAY_CEILING",
  "RATE_LIMITED",
  // Where it goes.
  "VIKY_DESTINATION",
  "INVALID_DESTINATION",
  "SENT_BY_THEMSELVES",
  "UNKNOWN_COIN",
  "UNKNOWN_WAY_OUT",
  "NOT_OFFERED",
  "NOT_YOURS",
  // The payout service and the exchange.
  "PAYOUT_SERVICE_SILENT",
  "PAYOUT_ASSET_CLOSED",
  "PAYOUT_REFUSED",
  "QUOTE_UNAVAILABLE",
  "EXCHANGE_REFUSED",
  "RATE_TOO_LOW",
  // Time: asked too late, or no longer waiting.
  "TOO_SLOW",
  "EXPIRED",
  "UNKNOWN_PAYOUT",
  "UNKNOWN_CONVERSION",
  // Sent, and not known to be final: neither "done" nor "nothing was taken" would be true, and the route says neither.
  "SENT_UNCONFIRMED",
  "NOT_FINAL_YET",
]);

/** The screen says these in words of its own, which name the step it was on (app/components/CashOut.tsx). */
export const SAID_BY_THE_SCREEN: ReadonlySet<string> = new Set(["NOT_CONFIGURED", "RATE_MOVED", "QUOTE_STALE", "QUOTE_EXPIRED", "ALREADY_UNDER_WAY", "REFUSED", "FAILED", "SIGN_IN_REQUIRED"]);

/**
 * These carry no sentence of their own: "Please try again", or a word written for a program. The screen's last
 * sentence stands for them, and only for them.
 */
export const NO_SENTENCE_OF_ITS_OWN: ReadonlySet<string> = new Set(["INVALID_REQUEST", "INVALID_SIGNATURE", "STALE_REQUEST", "UNKNOWN_GIFT"]);

/** Whether a refusal is shown in the route's own sentence. */
export function routeSaysIt(code: string | undefined): boolean {
  return code !== undefined && SAID_BY_THE_ROUTE.has(code);
}
