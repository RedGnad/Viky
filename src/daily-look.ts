import { daysWaitingOf } from "./days-waiting";
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
 * rule on the figures the contract holds, so it never keeps a person from a day the contract would have paid.
 *
 * When the look cannot say (the source did not answer, the answer carries no figure), no proof is taken either (the
 * founder, 3 Oct 2026): a look that failed must never become a proof at every pass again, which is what spent 57 of
 * them in five hours on 30 Sep. One reading goes without a look, the reading of last resort: taken by a pass, once
 * for a gift in a day, and only when the window of the gift's oldest open day closes before the next pass that could
 * read it. Until then the day stays open and the next pass looks again, which costs nothing. On the first two
 * versions that pass is the second reading of the morning; on the third, the last pass of the quarter of an hour
 * before the window closes.
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
 * the contract can credit with the figure it saw; that the source has no profile by that name, which is a fact about
 * the account and which a proof would only repeat; or nothing it could say, because the source did not answer or its
 * answer carries no figure.
 */
export type CountLook = Readonly<{ kind: "refused"; refusal: ForeseenRefusal; xp?: number } | { kind: "seen"; xp: number } | { kind: "gone" } | { kind: "unseen" }>;

/**
 * The look before a count. On a refusal, and on a profile that is gone, no proof is taken. On a day to credit the
 * attested reading is taken. When the look could not say, none is taken either, but for the reading of last resort
 * (`lastResortDue`).
 */
export async function lookBeforeCount(input: { username: string; courseId: string | null; gift: Counted; nowSeconds: number }, look: ProfileLook): Promise<CountLook> {
  // No day to credit whatever the profile shows: the source is not even asked.
  const noDay = noDayToCredit(input.gift, input.nowSeconds);
  if (noDay) return { kind: "refused", refusal: noDay };
  let profile: PublicDuolingoProfile;
  try {
    profile = await look(input.username);
  } catch (error) {
    // No such name is the source's own answer about the account, as the attested reading would read it off the same page.
    if (error instanceof DuolingoProfileError && error.code !== "SOURCE_UNAVAILABLE") return { kind: "gone" };
    if (!(error instanceof DuolingoProfileError)) console.error(`look before a count failed: ${error instanceof Error ? error.message : String(error)}`);
    return { kind: "unseen" };
  }
  const xp = figureOf(profile, input.courseId);
  if (xp === null) return { kind: "unseen" };
  const refusal = foreseenRefusal(input.gift, xp, input.nowSeconds);
  return refusal ? { kind: "refused", refusal, xp } : { kind: "seen", xp };
}

/**
 * How far ahead the next pass that could read a gift is, at the most, for each pass that may take a reading of last
 * resort. The second reading of the morning runs at 03:30 UTC, started anywhere inside its hour, and the next reading
 * pass is the next day's, at 00:30: more than twenty hours on. A day whose window closes at 06:00 that morning is
 * inside those twenty hours, and one that closes the morning after is not. The pass of half past midnight takes none:
 * the second reading comes after it, before anything closes.
 *
 * A gift read as the day goes (the third daily contract) is read by a pass every quarter of an hour, whichever pass
 * asks. The scheduler calls every five minutes and the pass guards itself for fourteen (src/frequent-pass.ts), so the
 * next one comes fifteen to twenty minutes later: twenty.
 */
export const LAST_RESORT_WITHIN_SECONDS = { recount: 20 * 3_600, frequent: 20 * 60 } as const;

/**
 * Whether a reading without a look is the last chance of a day: the window of the gift's oldest open day closes
 * within `withinSeconds`, which is before the next pass that could read it. A gift with no day open has none.
 */
export function lastResortDue(gift: Parameters<typeof daysWaitingOf>[0], nowSeconds: number, catchUpSeconds: number, withinSeconds: number): boolean {
  const closes = daysWaitingOf(gift, nowSeconds, catchUpSeconds).nearestEndsAt;
  return closes !== null && closes <= nowSeconds + withinSeconds;
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
