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

// --- the plain reading, for the funder's step (D168) --------------------------------------------------------------

/**
 * Lichess marks a rating provisional, with a question mark, while its Glicko-2 deviation is above 110 (their FAQ,
 * "Why is there a question mark next to a rating?", read 23 Sep 2026), and the API says the same as `prov`. That is
 * the source's own rule for a rating that has not settled, so it is the one the funder's step refuses on.
 */
export const LICHESS_PROVISIONAL_RD = 110;

export function lichessRatingHasSettled(rd: number | null): boolean {
  return rd !== null && rd <= LICHESS_PROVISIONAL_RD;
}

export type LichessReadErrorCode = "INVALID_USERNAME" | "PROFILE_NOT_FOUND" | "ACCOUNT_CLOSED" | "FETCH_FAILED";

export class LichessReadError extends Error {
  constructor(
    readonly code: LichessReadErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "LichessReadError";
  }
}

export type LichessStanding = Readonly<{
  username: string;
  /** Lichess's own id of the account, the username in lower case: a Lichess name never changes. */
  playerId: string;
  rating: number | null;
  rd: number | null;
  /** Lichess's own verdict on the rating, the question mark: `prov` in the API. */
  provisional: boolean;
  games: number;
}>;

/**
 * Where an account stands in one cadence, from the one answer Lichess gives about a user. The two fields their own
 * police publishes are read first: an account Lichess has closed (`disabled`) or marked for a violation of its terms
 * (`tosViolation`) is refused before any rating is looked at, as a closed Chess.com account is (U1).
 */
export function standingOfUser(body: unknown, cadence: LichessCadence): LichessStanding {
  const user = body as { id?: unknown; username?: unknown; disabled?: unknown; tosViolation?: unknown; perfs?: Record<string, unknown> } | null;
  if (!user || typeof user !== "object" || typeof user.id !== "string" || typeof user.username !== "string" || !isValidLichessUsername(user.username)) {
    throw new LichessReadError("FETCH_FAILED", "Lichess answered without the account");
  }
  if (user.disabled === true || user.tosViolation === true) throw new LichessReadError("ACCOUNT_CLOSED", "Lichess has closed this account");
  const perf = (user.perfs ?? {})[cadence] as { games?: unknown; rating?: unknown; rd?: unknown; prov?: unknown } | undefined;
  const games = typeof perf?.games === "number" && Number.isSafeInteger(perf.games) && perf.games >= 0 ? perf.games : 0;
  // A cadence never played carries no rating: Lichess answers a perf block for it all the same, with no games.
  const played = games > 0 && typeof perf?.rating === "number" && Number.isSafeInteger(perf.rating) && perf.rating > 0;
  const rd = played && typeof perf?.rd === "number" && Number.isSafeInteger(perf.rd) && perf.rd >= 0 ? perf.rd : null;
  return {
    username: user.username,
    playerId: user.id,
    rating: played ? (perf!.rating as number) : null,
    rd,
    provisional: played ? perf?.prov === true || !lichessRatingHasSettled(rd) : true,
    games,
  };
}

export type PlainLichessFetch = (url: string, init: RequestInit) => Promise<Response>;

/** Where a player stands today in one cadence, read plainly from Lichess's API. Every failure is typed. */
export async function readLichessStanding(username: string, cadence: LichessCadence, fetchImpl: PlainLichessFetch = fetch): Promise<LichessStanding> {
  if (!isValidLichessUsername(username)) throw new LichessReadError("INVALID_USERNAME", "That is not a Lichess name");
  let response: Response;
  try {
    response = await fetchImpl(lichessUserUrl(username), { headers: { accept: "application/json", "user-agent": LICHESS_USER_AGENT }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
  } catch (error) {
    throw new LichessReadError("FETCH_FAILED", "Lichess is not answering", { cause: error });
  }
  if (response.status === 404) throw new LichessReadError("PROFILE_NOT_FOUND", "No Lichess player goes by that name");
  if (response.status !== 200) throw new LichessReadError("FETCH_FAILED", `Lichess answered ${response.status}`);
  const body = (await response.json().catch(() => null)) as unknown;
  const standing = standingOfUser(body, cadence);
  if (standing.username.toLowerCase() !== username.trim().toLowerCase()) throw new LichessReadError("FETCH_FAILED", "Lichess answered about another name");
  return standing;
}
