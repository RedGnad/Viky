import { keccak256, stringToHex, type Hex } from "viem";

/**
 * Lichess, the twin of Chess.com (U3, 18 Sep 2026). Browser safe.
 *
 * What it takes to add it is small, because its owner publishes an API for exactly this reading and answers
 * everything in one call: `lichess.org/api/user/<name>` carries the identity, the rating of every cadence with its
 * Glicko RD, whether that rating is still provisional, an editable `profile.bio` where a binding code can go, and
 * the two fields their own police publishes, `disabled` and `tosViolation`.
 *
 * Only the goals live here for now: the numbers and provider ids the founder registers on `MilestoneGift`, in the
 * session the whole set is signed in. The reading itself comes with the line that offers it, and nothing is offered
 * until then.
 */

export const LICHESS_CADENCES = ["bullet", "blitz", "rapid", "classical"] as const;
export type LichessCadence = (typeof LICHESS_CADENCES)[number];

/**
 * The goal type of each cadence on the milestone contract. One to four are Chess.com's, and the numbering leaves
 * itself room: a gift for a blitz rating can never be settled by a rapid one, on either house, because the provider
 * id is signed into every proof and the goal type names one reading.
 */
const GOAL_TYPES: Readonly<Record<LichessCadence, number>> = { bullet: 6, blitz: 7, rapid: 8, classical: 9 };

export function lichessGoalType(cadence: LichessCadence): number {
  return GOAL_TYPES[cadence];
}

export function lichessCadenceOfGoal(goalType: number): LichessCadence | undefined {
  return LICHESS_CADENCES.find((cadence) => GOAL_TYPES[cadence] === goalType);
}

export function lichessProviderId(cadence: LichessCadence): Hex {
  return keccak256(stringToHex(`viky:provider:lichess-${cadence}-zkfetch:v1`));
}

/** The label of the identity pseudonym, independent of the cadence: one person, one identity. */
export const LICHESS_IDENTITY_LABEL = "lichess.org";

/** Lichess usernames: 2 to 20 characters, letters, figures, underscore and hyphen, starting with a letter or figure. */
const USERNAME = /^[A-Za-z0-9][A-Za-z0-9_-]{1,19}$/;

export function isValidLichessUsername(value: string): boolean {
  return USERNAME.test(value.trim());
}

export function lichessUserUrl(username: string): string {
  return `https://lichess.org/api/user/${encodeURIComponent(username.trim())}`;
}

/** What Lichess asks of anything reading it: "Only make one request at a time" (their API docs, read 18 Sep 2026). */
export const LICHESS_USER_AGENT = "Viky/1.0 (+https://viky.cash)";
