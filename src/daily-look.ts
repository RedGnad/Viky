import { DuolingoProfileError, type PublicDuolingoProfile } from "./duolingo-profile";
import { displayNameHasCode } from "./duolingo-public-terms";
import { utcDayOf, type GiftState } from "./gift-reader";
import { paysTheSameDay } from "./v2";

/**
 * The look a daily gift takes before it pays for an attested reading (3 Oct 2026). Server only.
 *
 * An attested reading is one of a month's hundred (src/attested-calls.ts). Two things spent them for nothing:
 *
 * - The morning pass took one for every connected gift every morning, lesson or not, from the morning after the
 *   connection to the second morning after the last day: ten for a gift of seven days. The contract refuses a reading
 *   that has no day to credit and keeps nothing of it, so each of those bought a refusal.
 * - A connection by code took one at each try, and read the name only afterwards: a person who pressed before the
 *   code was in their name, or before Duolingo showed it, paid a proof to be told so.
 *
 * So both look plainly first, which costs nothing, and the proof is taken only when it can do something.
 *
 * A look is never evidence. It moves no money, it is never signed and never sent, and what moves money is still read
 * again, attested. Before a count it can only answer a refusal the contract itself would give, by the contract's own
 * rule on the figures the contract holds, so it never keeps a person from a day the contract would have paid: whenever
 * it cannot say (the source did not answer, the answer carries no figure) the attested reading is taken as before.
 */

/** The days a contract holds for a gift, and which version of the daily contract holds them: the rule is the version's. */
type Days = Pick<GiftState, "startDay" | "endDay" | "settledThroughDay"> & Partial<Pick<GiftState, "version">>;
type Counted = Days & Pick<GiftState, "baselineValue" | "dailyTarget">;

/** The contract's own refusals of a check-in that a look can foresee, by the names the contract gives them. */
export type ForeseenRefusal = "MetricDecreased" | "OutsideWindow" | "NothingToCredit" | "InsufficientProgress";

/**
 * Whether a reading taken now has no day it could credit, whatever it reads: the contract's `OutsideWindow` and
 * `NothingToCredit`, as `checkIn` writes them. On the first two versions a reading credits through the day before
 * it; on the third, through its own day, and `OutsideWindow` no longer exists there.
 *
 * It is judged on the days the contract holds as settled. The contract first settles the days whose window has run
 * out, which can only leave fewer days open than this counts, never more: a refusal here is one the contract gives.
 * Nothing is said of a gift whose first reading has not been recorded.
 */
export function noDayToCredit(gift: Days, nowSeconds: number): "OutsideWindow" | "NothingToCredit" | null {
  if (!gift.startDay) return null;
  const sameDay = paysTheSameDay(gift.version);
  const lastDayPaid = sameDay ? utcDayOf(nowSeconds) : utcDayOf(nowSeconds) - 1;
  if (lastDayPaid < gift.startDay) return sameDay ? "NothingToCredit" : "OutsideWindow";
  const upper = Math.min(lastDayPaid, gift.endDay);
  return upper <= gift.settledThroughDay ? "NothingToCredit" : null;
}

/**
 * What the contract would answer to a reading of this figure taken now, when that is a refusal, in the order
 * `checkIn` gives them: a figure below the last one, no day to credit, not one full target of progress.
 */
export function foreseenRefusal(gift: Counted, metric: number, nowSeconds: number): ForeseenRefusal | null {
  if (!gift.startDay || gift.dailyTarget <= 0) return null;
  if (BigInt(metric) < gift.baselineValue) return "MetricDecreased";
  const days = noDayToCredit(gift, nowSeconds);
  if (days) return days;
  return (BigInt(metric) - gift.baselineValue) / BigInt(gift.dailyTarget) === 0n ? "InsufficientProgress" : null;
}

export type ProfileLook = (username: string) => Promise<PublicDuolingoProfile>;

/** The figure a gift counts, out of a plain profile: one course's experience, or the whole profile's. */
function figureOf(profile: PublicDuolingoProfile, courseId: string | null): number | null {
  if (!courseId) return profile.totalXp;
  return profile.courses.find((course) => course.id === courseId)?.xp ?? null;
}

/**
 * What the look before a count found: the contract's refusal, with the figure that earns it when one was read; a day
 * the contract can credit with the figure it saw; or nothing it could say, because the source did not answer or its
 * answer carries no figure.
 */
export type CountLook = Readonly<{ kind: "refused"; refusal: ForeseenRefusal; xp?: number } | { kind: "seen"; xp: number } | { kind: "unseen" }>;

/**
 * The look before a count. On a refusal no proof is taken. On a day to credit the attested reading is taken. When the
 * look could not say, whoever asked decides: the nightly pass takes the reading all the same, one per gift at most, as
 * it always did, so a look that fails never costs a person a day; an open page and the pass of every quarter of an
 * hour take none and come back.
 */
export async function lookBeforeCount(input: { username: string; courseId: string | null; gift: Counted; nowSeconds: number }, look: ProfileLook): Promise<CountLook> {
  // No day to credit whatever the profile shows: the source is not even asked.
  const noDay = noDayToCredit(input.gift, input.nowSeconds);
  if (noDay) return { kind: "refused", refusal: noDay };
  let profile: PublicDuolingoProfile;
  try {
    profile = await look(input.username);
  } catch (error) {
    if (!(error instanceof DuolingoProfileError)) console.error(`look before a count failed: ${error instanceof Error ? error.message : String(error)}`);
    return { kind: "unseen" };
  }
  const xp = figureOf(profile, input.courseId);
  if (xp === null) return { kind: "unseen" };
  const refusal = foreseenRefusal(input.gift, xp, input.nowSeconds);
  return refusal ? { kind: "refused", refusal, xp } : { kind: "seen", xp };
}

/** Why a connection by code stops at the look, by the codes the attested reading already answers. */
export type CodeLookRefusal = Readonly<{ code: "INVALID_USERNAME" | "PROFILE_NOT_FOUND" | "FETCH_FAILED" } | { code: "CODE_NOT_IN_NAME"; shown: string }>;

const LOOK_PROBLEMS = { INVALID_USERNAME: "INVALID_USERNAME", NO_SUCH_PROFILE: "PROFILE_NOT_FOUND", SOURCE_UNAVAILABLE: "FETCH_FAILED" } as const;

/**
 * The look before a connection by code: is the code in the name the profile shows? Nothing when it is, and the
 * attested reading goes, which reads the name again, since only that one proves anything. Otherwise the refusal, and
 * no proof is taken: neither when the code is not there yet, nor when the look itself failed, where the person tries
 * again in a minute.
 */
export async function lookForCode(input: { username: string; code: string }, look: ProfileLook): Promise<CodeLookRefusal | null> {
  let profile: PublicDuolingoProfile;
  try {
    profile = await look(input.username);
  } catch (error) {
    if (error instanceof DuolingoProfileError) return { code: LOOK_PROBLEMS[error.code] };
    throw error;
  }
  const shown = profile.name ?? "";
  return displayNameHasCode(shown, input.code) ? null : { code: "CODE_NOT_IN_NAME", shown };
}
