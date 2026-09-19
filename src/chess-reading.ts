import type { Hex } from "viem";
import { attestedRead, AttestedReadError, reclaimAttestedReadDeps, type AttestedReadDeps, type AttestedReading } from "./attested-read";
import { CHESS_PLAYER, CHESS_PROFILE, CHESS_RATINGS } from "./attested-sources";
import {
  accountIsClosed,
  CHESS_USER_AGENT,
  chessProfileUrl,
  chessStatsUrl,
  isValidChessUsername,
  playerOfProfile,
  ratingOfStats,
  type ChessMode,
  type ChessStanding,
} from "./chess-com";
import type { ZkFetchProof } from "./duolingo-public";

/**
 * Reading a Chess.com rating, two ways. Server only.
 *
 * A plain read decides what a funder is shown and agrees to, with their own eyes and their own money (D45), and lets
 * the keeper see whether today is the day before it pays for an attested one. It moves nothing.
 *
 * An attested read is the only kind that moves money. It is two proofs taken one after the other: the profile, which
 * says who this username is (`player_id`, the identity a gift is bound to, which survives a change of username), and
 * the ratings page, which says where they stand in one cadence and carries no identity of its own. The first reading
 * of a gift also reads the profile's name, where the recipient has put the code that proves the account is theirs.
 */

export type ChessReadErrorCode =
  | "INVALID_USERNAME"
  | "PROFILE_NOT_FOUND"
  /** The profile has no name at all, so no code can be in it. */
  | "NO_NAME"
  /** The account has never played a rated game in that cadence. */
  | "NO_RATING"
  /** Chess.com has closed the account (U1): nothing on it can be bound or earned. */
  | "ACCOUNT_CLOSED"
  | "FETCH_FAILED"
  | "PROOF_INVALID"
  | "PROOF_MISMATCH"
  /** The reading service runs older sources than this build, so nothing it fetches can be read here. */
  | "WORKER_OUT_OF_DATE"
  | "NOT_CONFIGURED";

export class ChessReadError extends Error {
  constructor(
    readonly code: ChessReadErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ChessReadError";
  }
}

// --- plain -----------------------------------------------------------------------------------------------------

export type PlainFetch = (url: string, init: RequestInit) => Promise<Response>;

async function readJson(url: string, fetchImpl: PlainFetch): Promise<{ status: number; body: unknown }> {
  let response: Response;
  try {
    response = await fetchImpl(url, { headers: { accept: "application/json", "user-agent": CHESS_USER_AGENT }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
  } catch (error) {
    throw new ChessReadError("FETCH_FAILED", "Chess.com is not answering", { cause: error });
  }
  const body = (await response.json().catch(() => null)) as unknown;
  return { status: response.status, body };
}

/** Where a player stands today in one cadence, read plainly. Every failure is typed. */
export async function readChessStanding(username: string, mode: ChessMode, fetchImpl: PlainFetch = fetch): Promise<ChessStanding> {
  if (!isValidChessUsername(username)) throw new ChessReadError("INVALID_USERNAME", "That is not a Chess.com name");
  const profile = await readJson(chessProfileUrl(username), fetchImpl);
  if (profile.status === 404) throw new ChessReadError("PROFILE_NOT_FOUND", "No Chess.com player goes by that name");
  // A profile without a readable status is not a reading at all, so it fails on our side rather than passing for open.
  const player = profile.status === 200 ? playerOfProfile(profile.body) : null;
  if (!player) throw new ChessReadError("FETCH_FAILED", `Chess.com answered ${profile.status}`);
  if (accountIsClosed(player.status)) throw new ChessReadError("ACCOUNT_CLOSED", "Chess.com has closed this account");
  // A ratings page that does not answer 200 is Chess.com failing, even as a 404: the profile just said the player exists.
  const stats = await readJson(chessStatsUrl(username), fetchImpl);
  if (stats.status !== 200 || !stats.body || typeof stats.body !== "object") throw new ChessReadError("FETCH_FAILED", `Chess.com answered ${stats.status}`);
  const rating = ratingOfStats(stats.body, mode);
  return {
    username: player.username,
    playerId: player.playerId,
    status: player.status,
    rating: rating?.rating ?? null,
    ratedAt: rating?.ratedAt ?? null,
    rd: rating?.rd ?? null,
    best: rating?.best ?? null,
  };
}

// --- attested --------------------------------------------------------------------------------------------------

export type AttestedChessReading = Readonly<{
  username: string;
  playerId: string;
  /** What Chess.com says of the account, attested with the identity on every reading (U1). */
  status: string;
  /** Present only on a reading taken with the name, the first one. */
  name: string | null;
  mode: ChessMode;
  rating: number;
  /** When the rated game behind this rating ended, as the page says it. Recorded, never judged by the contract. */
  ratedAt: number;
  /** The rating's Glicko RD, as the page gives it: how far one game can move it. */
  rd: number;
  /** The attestor's time of the ratings read: what the contract judges. */
  observedAt: number;
  /** From the ratings proof: one reading, one use. */
  nullifier: Hex;
  proofs: readonly ZkFetchProof[];
}>;

/** How far apart the two halves of a reading may be taken. Seconds in practice; minutes would mean something is off. */
const HALVES_APART_SECONDS = 5 * 60;

function chessError(error: unknown, ratingPattern: string, namePattern: string, half: "profile" | "ratings"): ChessReadError {
  if (!(error instanceof AttestedReadError)) return new ChessReadError("FETCH_FAILED", "Chess.com could not be read right now", { cause: error });
  switch (error.code) {
    case "INVALID_ACCOUNT":
      return new ChessReadError("INVALID_USERNAME", "That is not a Chess.com name", { cause: error });
    case "NOT_FOUND":
      // Only the profile says who exists. The ratings page of a player whose profile was just read also answers 404, with
      // "An internal error has occurred" (erik, 17 Sep 2026 15:50 UTC, while hikaru's answered): that is Chess.com failing,
      // not the player missing, and it must never tell a recipient their account is gone.
      return half === "profile"
        ? new ChessReadError("PROFILE_NOT_FOUND", "No Chess.com player goes by that name", { cause: error })
        : new ChessReadError("FETCH_FAILED", "Chess.com could not give the ratings right now", { cause: error });
    case "NO_MATCH":
      if (error.pattern === ratingPattern) return new ChessReadError("NO_RATING", "No rating in that cadence yet", { cause: error });
      if (error.pattern === namePattern) return new ChessReadError("NO_NAME", "That profile has no name", { cause: error });
      // A profile without a readable status included: nothing is settled on a reading that could not see whether the
      // account is closed, and PROOF_INVALID is the code the keeper holds a gift on.
      return new ChessReadError("PROOF_INVALID", "The profile did not carry what a reading needs", { cause: error });
    case "REFUSED":
    case "NOT_ACCEPTED":
      // Chess.com says nothing about a player with a 403 or a 400: its public pages answer 404 for an unknown name and
      // 429 when we ask too fast. Either of these is Chess.com refusing us, which is ours to fix, never the player's.
      return new ChessReadError("FETCH_FAILED", "Chess.com would not answer that reading", { cause: error });
    default:
      return new ChessReadError(error.code, error.message, { cause: error });
  }
}

export async function attestChessRating(
  input: { username: string; mode: ChessMode; withName: boolean },
  deps: AttestedReadDeps = reclaimAttestedReadDeps(),
): Promise<AttestedChessReading> {
  const profileSource = input.withName ? CHESS_PROFILE : CHESS_PLAYER;
  const ratingSource = CHESS_RATINGS[input.mode];
  const ratingPattern = ratingSource.matches[0].value;
  const namePattern = CHESS_PROFILE.matches[2].value;
  let profile: AttestedReading;
  let ratings: AttestedReading;
  try {
    profile = await attestedRead(profileSource.id, input.username, deps);
  } catch (error) {
    throw chessError(error, ratingPattern, namePattern, "profile");
  }
  try {
    ratings = await attestedRead(ratingSource.id, input.username, deps);
  } catch (error) {
    throw chessError(error, ratingPattern, namePattern, "ratings");
  }
  const playerId = profile.values.playerId ?? "";
  const username = profile.values.username ?? "";
  const status = profile.values.status ?? "";
  if (!/^\d{1,18}$/.test(playerId) || username.length === 0 || status.length === 0) throw new ChessReadError("PROOF_INVALID", "The profile reading is incomplete");
  // Read before the rating is looked at: a closed account can neither be bound nor reach a target (U1).
  if (accountIsClosed(status)) throw new ChessReadError("ACCOUNT_CLOSED", "Chess.com has closed this account");
  // Both halves are about the name that was asked for, so one person's rating cannot be read under another's identity.
  if (username.toLowerCase() !== input.username.toLowerCase()) throw new ChessReadError("PROOF_MISMATCH", "The profile reading is about another name");
  const rating = Number(ratings.values.rating ?? "");
  const ratedAt = Number(ratings.values.date ?? "0");
  const rd = Number(ratings.values.rd ?? "");
  if (!Number.isSafeInteger(rating) || rating <= 0 || !Number.isSafeInteger(ratedAt) || !Number.isSafeInteger(rd) || rd < 0) {
    throw new ChessReadError("PROOF_INVALID", "The ratings reading is incomplete");
  }
  if (Math.abs(ratings.observedAt - profile.observedAt) > HALVES_APART_SECONDS) throw new ChessReadError("PROOF_MISMATCH", "The two halves of the reading were taken too far apart");
  return {
    username,
    playerId,
    status,
    name: input.withName ? (profile.values.name ?? "") : null,
    mode: input.mode,
    rating,
    ratedAt,
    rd,
    observedAt: ratings.observedAt,
    nullifier: ratings.nullifier,
    proofs: [profile.proof, ratings.proof],
  };
}

/**
 * The code a recipient puts in their Chess.com name to prove the account is theirs. Letters only: Chess.com publishes
 * no rule for what its name fields accept, and a letter is the one thing a name field is sure to take. Twenty-four
 * letters (no I, no O) over six places is 191 million codes, for a code that lives an hour.
 */
export const CHESS_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
export const CHESS_CODE_LENGTH = 6;

export function newChessCode(randomByte: () => number): string {
  let code = "";
  const limit = CHESS_CODE_ALPHABET.length * Math.floor(256 / CHESS_CODE_ALPHABET.length);
  while (code.length < CHESS_CODE_LENGTH) {
    const byte = randomByte();
    if (byte < limit) code += CHESS_CODE_ALPHABET[byte % CHESS_CODE_ALPHABET.length];
  }
  return code;
}

/** Case aside, and whatever spaces or dashes the person typed around it. */
export function nameHasChessCode(name: string | null, code: string): boolean {
  if (!name || code.length !== CHESS_CODE_LENGTH) return false;
  const normalise = (value: string) => value.toUpperCase().replace(/[\s-]/g, "");
  return normalise(name).includes(normalise(code));
}
