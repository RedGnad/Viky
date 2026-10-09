import { keccak256, stringToHex, type Hex } from "viem";

/**
 * A TOEFL score the person shows from their own ETS account (D162, D164): the first condition of the second nature.
 *
 * What the proof carries, read from the provider's configuration on 22 Sep 2026 (the Reclaim directory, provider
 * "TOEFL MyBest Score"): behind the ETS sign-in, one request, `GET v2.ereg.ets.org/ereg/pbs/getPbs?testId=…`, and
 * two fields, `$.scores.TOTAL.scoreValue` and `$.scores.LISTENING.bookingId`. No name, no test date, no account id.
 *
 * So, by the founder's two decisions of 22 Sep 2026: the subject the funder signs is constant per condition, because
 * the link is the account the person signs in to and the recipient the contract already checks, not a name; and
 * the condition is a possession, "show a score of at least X", whose event is the day it is shown, until a provider
 * of ours extracts the test's date. That day it becomes "reach", under its own goal number, never under this one.
 */

export const TOEFL_SOURCE = "ETS";

/** The goal on the milestone contract: number 13, the first free one, registered by the owner (OPERATIONS). */
export const TOEFL_GOAL_TYPE = 13;

/** What every attestation for this condition must carry, so a proof shown for it can never settle another's gift. */
export function toeflShownProviderId(): Hex {
  return keccak256(stringToHex("viky:provider:toefl-mybest-shown:v1"));
}

/** The subject the funder signs: the same for every gift on this condition, because the proof carries no name. */
export const TOEFL_SHOWN_SUBJECT: Hex = keccak256(stringToHex("viky:subject:toefl-mybest-shown:v1"));

/**
 * The Reclaim provider, pinned by id, version and the hash of its one request. A new version is a new decision.
 *
 * The hash is the one a proof of this version carries, as Reclaim's own library works it out from the published
 * request (`hashRequestSpec`, read 9 Oct 2026). The configuration also publishes a `requestHash` field, 0x881b...ee21,
 * which is not that hash: this pin held it from 22 Sep to 9 Oct 2026, and a real proof would have been refused as
 * another request. test/reclaim-pins.test.ts works every pin out again.
 */
export const TOEFL_RECLAIM_PROVIDER = Object.freeze({
  id: "67ec1b13-b206-4fac-a78c-fbd5a2af55b3",
  version: "1.0.0",
  requestHash: "0xd40b146a6c7210c1ee0213ad3e04c424bea780a4d8315d883595cfa1ce12fd3d",
  loginUrl: "https://v2.ereg.ets.org/ereg/public/jump?_p=TEL",
});

/** The TOEFL iBT total is scored from 0 to 120, in ones (ETS's own scale, read on ets.org on 22 Sep 2026). */
export const TOEFL_MIN_SCORE = 0;
export const TOEFL_MAX_SCORE = 120;

export function isValidToeflScore(value: number): boolean {
  return Number.isInteger(value) && value >= TOEFL_MIN_SCORE && value <= TOEFL_MAX_SCORE;
}

/** How long the person has to show it: the same window as the other one-time conditions. */
export const TOEFL_DURATION_DAYS = Object.freeze({ min: 14, max: 180, suggested: 90 });

/** The score as the proof prints it, `"scoreValue":"97"`: an integer in the scale, or nothing. */
export function toeflScoreOf(value: string | undefined): number | undefined {
  if (value === undefined || !/^\d{1,3}$/.test(value)) return undefined;
  const score = Number(value);
  return isValidToeflScore(score) ? score : undefined;
}
