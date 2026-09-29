import { attestChessRating, ChessReadError, readChessStanding, type AttestedChessReading, type ReadStanding } from "./chess-reading";
import { climbSource, CODEFORCES_CLIMB, type ClimbId } from "./climbs";
import { attestCodeforcesRating, CodeforcesReadError, readCodeforcesStanding } from "./codeforces-reading";

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

export async function readClimbStanding(username: string, climb: ClimbId): Promise<ReadStanding> {
  return climbSource(climb) === "codeforces" ? readCodeforcesStanding(username) : readChessStanding(username, climb === CODEFORCES_CLIMB ? "rapid" : climb);
}

export async function attestClimbRating(input: { username: string; mode: ClimbId; withName: boolean }): Promise<AttestedClimbReading> {
  if (input.mode === CODEFORCES_CLIMB) return { ...(await attestCodeforcesRating({ username: input.username, withName: input.withName })), mode: CODEFORCES_CLIMB };
  return attestChessRating({ username: input.username, mode: input.mode, withName: input.withName });
}
