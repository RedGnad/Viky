import { GIFT_PAGE as W } from "./sentences";

/**
 * What the person reads when a source sent them back to their gift (the audit of 8 Oct 2026): nothing when it is
 * connected, and otherwise the reason the callback put in the address as `?connect=<code>`
 * (app/api/connect/<source>/callback), in words. Before, every reason read "That did not go through, and nothing was
 * changed. Try again.", whether the person had refused at the source, had signed in to Viky under another account
 * meanwhile, or had taken longer than the ten minutes the round trip is given.
 *
 * Browser safe and pure. `source` is the register's name for it ("Strava", "Fitbit").
 */
export function connectReturnInWords(answer: string | null, source: string): string | null {
  if (!answer || answer === "done") return null;
  switch (answer.toLowerCase()) {
    // The source gave no code: the person said no there, or the source did.
    case "refused_at_strava":
    case "refused_at_fitbit":
      return W.connectRefusedThere(source);
    // Connected without what a day is read from (Strava lets the person untick it).
    case "scope_missing":
      return W.connectWithoutActivities(source);
    // The account signed in to Viky is not the one that started this, or not the one the gift is for.
    case "other_account":
    case "not_recipient":
      return W.connectOtherAccount;
    case "expired":
      return W.connectTookTooLong;
    default:
      return W.connectFailed;
  }
}
