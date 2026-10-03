import type { ChessStanding } from "./chess-com";
import { attestChessRating, ChessReadError, readChessPlayer, readChessStanding, type AttestedChessReading } from "./chess-reading";
import { climbSource, CODEFORCES_CLIMB, type ClimbId } from "./climbs";
import { attestCodeforcesRating, CodeforcesReadError, readCodeforcesName, readCodeforcesStanding } from "./codeforces-reading";

/**
 * One door for every climb (the founder, 27 Sep 2026): the keeper, the create route and the rename flow read a
 * standing or attest a rating without knowing which house answers. Server only.
 */

export type ClimbReadError = ChessReadError | CodeforcesReadError;

export function isClimbReadError(error: unknown): error is ClimbReadError {
  return error instanceof ChessReadError || error instanceof CodeforcesReadError;
}

/** A reading of any climb: Chess.com's, with its cadence, or Codeforces' one rating. */
export type AttestedClimbReading = Omit<AttestedChessReading, "mode"> & Readonly<{ mode: ClimbId }>;

/** How many attested fetches a reading of a climb is made of: Chess.com's profile and its ratings, or Codeforces' one page. */
export function climbFetches(climb: ClimbId): number {
  return climbSource(climb) === "codeforces" ? 1 : 2;
}

export async function readClimbStanding(username: string, climb: ClimbId): Promise<ChessStanding> {
  return climbSource(climb) === "codeforces" ? readCodeforcesStanding(username) : readChessStanding(username, climb === CODEFORCES_CLIMB ? "rapid" : climb);
}

/**
 * The name a person shows on the house a climb is read on, read plainly, or nothing when they show none: where the
 * binding code is looked for before a proof is paid for (src/milestone-reading.ts).
 */
export async function readClimbName(username: string, climb: ClimbId): Promise<string | null> {
  if (climbSource(climb) === "codeforces") return readCodeforcesName(username);
  const name = (await readChessPlayer(username)).name;
  return name && name.length > 0 ? name : null;
}

export async function attestClimbRating(input: { username: string; mode: ClimbId; withName: boolean }): Promise<AttestedClimbReading> {
  if (input.mode === CODEFORCES_CLIMB) return { ...(await attestCodeforcesRating({ username: input.username, withName: input.withName })), mode: CODEFORCES_CLIMB };
  return attestChessRating({ username: input.username, mode: input.mode, withName: input.withName });
}
