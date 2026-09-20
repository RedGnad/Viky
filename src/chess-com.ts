import { keccak256, stringToHex, type Hex } from "viem";

/**
 * Chess.com as a milestone source, the facts only. Browser safe: no key, no fetch.
 *
 * The source is Chess.com's published data API: "Public Data is information available to people who are not logged
 * in", read-only, unlimited serial access, no key, and a user agent with a contact is recommended
 * (chess.com/news/view/published-data-api, read 17 Sep 2026). Measured the same day on real answers:
 *
 * - `/pub/player/{name}` carries `player_id`, `username`, `status` and, only when the person filled it in, `name`. The
 *   name is the field a person edits, so it is where a binding code goes, as on Duolingo. `player_id` does not change
 *   when a username does, so it is the identity a gift is bound to.
 * - `/pub/player/{name}/stats` carries one block per cadence, `"chess_rapid":{"last":{"rating":1904,"date":...}}`,
 *   in no fixed order (hikaru's begins with daily, magnuscarlsen's with rapid), and a cadence never played has no
 *   block at all. So a reading names its cadence in its own pattern; a pattern for "any cadence" returns whichever
 *   comes first, which would let a bullet rating settle a rapid gift.
 * - An unknown name answers 404 with a JSON message. A mixed-case name answers 301 to the lower-case one.
 * - Without a user agent Cloudflare answers 403 with a challenge page, so every read sends one.
 */

export const CHESS_MODES = ["rapid", "blitz", "bullet", "daily"] as const;
export type ChessMode = (typeof CHESS_MODES)[number];

export function isChessMode(value: unknown): value is ChessMode {
  return typeof value === "string" && (CHESS_MODES as readonly string[]).includes(value);
}

/**
 * The puzzle rating, which is on the same page and is not a cadence: no game is played against anybody, and the
 * number is a person's own record. Measured on 20 Sep 2026 on sevyb, hikaru, magnuscarlsen and erik: the block is
 * `"tactics":{"highest":{"rating":2096,"date":1760495253},"lowest":{"rating":1795,"date":...}}`, carrying no `last`
 * and no RD at all. `highest` is the best that account ever reached and never goes down, so the climb it holds is
 * "beat your own record": erik 2096 against a lowest of 1795, hikaru 2730 held since 2014, magnuscarlsen the 400 an
 * account starts at. A person who never solved a puzzle is refused rather than read as nothing.
 */
export const CHESS_TACTICS = "tactics";

/** What a gift can be made on at Chess.com: the four cadences, and the puzzle rating beside them. */
export type ChessClimb = ChessMode | typeof CHESS_TACTICS;
export const CHESS_CLIMBS: readonly ChessClimb[] = [...CHESS_MODES, CHESS_TACTICS];

export function isChessClimb(value: unknown): value is ChessClimb {
  return typeof value === "string" && (CHESS_CLIMBS as readonly string[]).includes(value);
}

/**
 * The goal types of the milestone contract, one per climb. A goal type fixes the provider id its proofs must carry,
 * and the provider id is signed into every proof, so a gift for a rapid rating can never be settled by a blitz one
 * (D48). Registered by `scripts/register-milestone-goals.ts`. The four cadences took the first four numbers; the
 * puzzle rating came later and took the next free one, after the other sources.
 */
const GOAL_TYPES: Readonly<Record<ChessClimb, number>> = { rapid: 1, blitz: 2, bullet: 3, daily: 4, tactics: 12 };

export function chessGoalType(climb: ChessClimb): number {
  return GOAL_TYPES[climb];
}

export function chessClimbOfGoal(goalType: number): ChessClimb | undefined {
  return CHESS_CLIMBS.find((climb) => GOAL_TYPES[climb] === goalType);
}

export function chessProviderId(climb: ChessClimb): Hex {
  return keccak256(stringToHex(`viky:provider:chess-com-${climb}-zkfetch:v1`));
}

/** The label of the identity pseudonym (the HMAC input), independent of the cadence: one person, one identity. */
export const CHESS_IDENTITY_LABEL = "chess.com";

/** Chess.com names: letters, figures, underscores and hyphens, three to twenty-five of them. */
export function isValidChessUsername(value: string): boolean {
  return /^[A-Za-z0-9_-]{3,25}$/.test(value);
}

export const CHESS_API = "https://api.chess.com/pub/player";

export function chessProfileUrl(username: string): string {
  return `${CHESS_API}/${encodeURIComponent(username.toLowerCase())}`;
}

export function chessStatsUrl(username: string): string {
  return `${chessProfileUrl(username)}/stats`;
}

/**
 * The pattern that reads one cadence's current rating, the moment of the game it comes from, and its RD. Measured on
 * 17 Sep 2026 over 275 rating blocks of 109 profiles: 274 carry `rd`, always right after `date`; the one without it
 * was a blitz block at 800. A reading without an RD is refused, which is also what the funder's step does with it.
 */
export function chessRatingPattern(mode: ChessMode): string {
  return `"chess_${mode}":\\{"last":\\{"rating":(?<rating>\\d+),"date":(?<date>\\d+),"rd":(?<rd>\\d+)`;
}

/**
 * The same page read for the puzzle rating: the record and the day it was set, anchored on the two keys that carry
 * them. There is no RD to read, and `lowest` is deliberately not in the pattern: a gift is about the record, and a
 * reading that could match either of the two would let the lowest settle a gift made on the highest.
 */
export function chessTacticsPattern(): string {
  return '"tactics":\\{"highest":\\{"rating":(?<rating>\\d+),"date":(?<date>\\d+)\\}';
}

/** What one climb is read with, whichever kind it is. */
export function chessClimbPattern(climb: ChessClimb): string {
  return climb === CHESS_TACTICS ? chessTacticsPattern() : chessRatingPattern(climb);
}

/**
 * The account's standing with Chess.com itself, which the profile publishes as `status`. Chess.com documents the six
 * values ("closed, closed:fair_play_violations, basic, premium, mod, staff") and its Fair Play policy says what a
 * closed one can mean: "we may close your account and label it publicly closed for Fair Play violations". Measured on
 * 18 Sep 2026: hikaru premium, magnuscarlsen premium, danielnaroditsky premium, erik staff, SevyB basic, dubov closed.
 * A closed account still serves its profile and its ratings, so the status is the only thing that says so.
 */
export function chessStatusPattern(): string {
  return '"status":"(?<status>[a-z_:]+)"';
}

/**
 * Whether Chess.com has closed this account, whatever reason it gives with it. An unread status is not an answer: the
 * caller treats it as a reading that failed on our side, never as an open account.
 */
export function accountIsClosed(status: string | null): boolean {
  return status === "closed" || (status !== null && status.startsWith("closed:"));
}

/**
 * The highest RD at which a rating moves by about ten points a game, which is what the milestone terms rest on
 * (src/milestone-terms.ts: a start margin of 10, a smallest climb of 50). "The Glicko RD value used to calculate
 * ratings changes", in Chess.com's words, and Chess.com publishes no RD above which a rating is still provisional, so
 * this is measured (DECISIONS.md D90, `scripts/measure-chess-rd.ts`): over the last twenty rated games of 72 profile
 * and cadence pairs on 17 Sep 2026, below 60 the median change per game was 1 to 13 points and the largest 18; from
 * 60 to 79 the medians ran from 5 to 28 and the largest reached 88; above 80, 129.
 */
export const CHESS_SETTLED_RD_BELOW = 60;

/** Whether a rating has settled enough for a climb to measure anything. An unknown RD has not. */
export function ratingHasSettled(rd: number | null): boolean {
  return rd !== null && rd < CHESS_SETTLED_RD_BELOW;
}

/**
 * The puzzle record has no RD to settle: the page publishes none, and the number it publishes is the best ever
 * reached rather than a live rating one game can move. So this climb is read whatever comes beside it, and the
 * guard that holds a provisional cadence back has nothing to hold back here.
 */
export function recordHasSettled(): boolean {
  return true;
}

/**
 * Chess.com asks for a user agent with a way to reach the caller; the site is ours, and no mailbox is published yet.
 * The attested read sends the same one, so what is attested is what anybody sending this header would read.
 */
export const CHESS_USER_AGENT = "Viky/1.0 (+https://viky.cash)";

export type ChessStanding = Readonly<{
  username: string;
  playerId: string;
  /** What Chess.com says of the account itself: basic, premium, staff, or closed. */
  status: string;
  /** Null when the cadence has never been played on this account. */
  rating: number | null;
  /** Unix seconds of the game the rating comes from, as the page gives it. */
  ratedAt: number | null;
  /** The best rating this account ever held in that cadence, when the page gives one. Shown, never judged. */
  best: number | null;
  /** The rating's Glicko RD, null when the cadence was never played or the page gives none. */
  rd: number | null;
}>;

/**
 * The player an answer of `/pub/player/{name}` describes, or nothing when it is not one. A profile without a readable
 * `status` is not one: the status is what says whether Chess.com has closed the account, and a reading that cannot see
 * it must fail on our side rather than pass for an open account.
 */
export function playerOfProfile(body: unknown): { username: string; playerId: string; status: string; name: string | null } | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const playerId = record.player_id;
  const username = record.username;
  const status = record.status;
  if (typeof playerId !== "number" || !Number.isSafeInteger(playerId) || typeof username !== "string" || username.length === 0) return null;
  if (typeof status !== "string" || status.length === 0) return null;
  return { username, playerId: String(playerId), status, name: typeof record.name === "string" ? record.name : null };
}

/** What one climb's reading carries: the number, when the source says it was set, and what else the page gives. */
export type ChessClimbReading = Readonly<{ rating: number; ratedAt: number; rd: number | null; best: number | null }>;

/**
 * The puzzle record from an answer of `/pub/player/{name}/stats`, or null when the account has no tactics block or
 * an unreadable one. `best` is null on purpose: the number being read is already the best ever, and printing it
 * twice under itself would say nothing.
 */
export function tacticsOfStats(body: unknown): ChessClimbReading | null {
  if (!body || typeof body !== "object") return null;
  const block = (body as Record<string, unknown>).tactics;
  const highest = block && typeof block === "object" ? (block as Record<string, unknown>).highest : undefined;
  if (!highest || typeof highest !== "object") return null;
  const { rating, date } = highest as Record<string, unknown>;
  if (typeof rating !== "number" || !Number.isSafeInteger(rating) || rating <= 0) return null;
  return { rating, ratedAt: typeof date === "number" && Number.isSafeInteger(date) ? date : 0, rd: null, best: null };
}

/** One climb's reading, whichever kind it is. */
export function climbOfStats(body: unknown, climb: ChessClimb): ChessClimbReading | null {
  return climb === CHESS_TACTICS ? tacticsOfStats(body) : ratingOfStats(body, climb);
}

/** One cadence's rating from an answer of `/pub/player/{name}/stats`, or null when that cadence was never played. */
export function ratingOfStats(body: unknown, mode: ChessMode): ChessClimbReading | null {
  if (!body || typeof body !== "object") return null;
  const block = (body as Record<string, unknown>)[`chess_${mode}`];
  const last = block && typeof block === "object" ? (block as Record<string, unknown>).last : undefined;
  if (!last || typeof last !== "object") return null;
  const { rating, date, rd } = last as Record<string, unknown>;
  if (typeof rating !== "number" || !Number.isSafeInteger(rating) || rating <= 0) return null;
  // `best` is a block of its own beside `last`, and a young account has none: measured on 17 Sep 2026, SevyB had a
  // rapid rating and no best at all, while magnuscarlsen, bar and briosa77 had one in every cadence they played.
  const best = (block as Record<string, unknown>).best;
  const bestRating = best && typeof best === "object" ? (best as Record<string, unknown>).rating : undefined;
  return {
    rating,
    ratedAt: typeof date === "number" && Number.isSafeInteger(date) ? date : 0,
    rd: typeof rd === "number" && Number.isSafeInteger(rd) && rd >= 0 ? rd : null,
    best: typeof bestRating === "number" && Number.isSafeInteger(bestRating) && bestRating > 0 ? bestRating : null,
  };
}
