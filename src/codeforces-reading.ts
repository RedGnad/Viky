import type { Hex } from "viem";
import { attestedRead, AttestedReadError, reclaimAttestedReadDeps, type AttestedReadDeps } from "./attested-read";
import { CODEFORCES_USER, CODEFORCES_USER_NAMED, headersFor } from "./attested-sources";
import type { ChessStanding } from "./chess-com";
import { codeforcesUserUrl, isValidCodeforcesHandle } from "./codeforces";
import type { ZkFetchProof } from "./duolingo-public";

/**
 * Reading a Codeforces rating (the founder, 27 Sep 2026), two ways, on the model of Chess.com's (src/chess-reading.ts).
 * Server only. The plain read answers the funder's sheet and the keeper's look; the attested read is the only kind
 * that moves money. Both take the same patterns out of the same answer, `user.info`, which carries the handle, the
 * rating (absent until a first rated round), the best rating ever, and the editable name fields where the binding
 * code goes (D27: the last name, in English).
 */

export type CodeforcesReadErrorCode = "INVALID_USERNAME" | "PROFILE_NOT_FOUND" | "NO_NAME" | "NO_RATING" | "FETCH_FAILED" | "PROOF_INVALID" | "PROOF_MISMATCH" | "WORKER_OUT_OF_DATE" | "LIMIT_REACHED" | "NOT_CONFIGURED";

export class CodeforcesReadError extends Error {
  constructor(
    readonly code: CodeforcesReadErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "CodeforcesReadError";
  }
}

export type PlainFetch = (url: string, init: RequestInit) => Promise<Response>;

type ApiUser = { handle?: string; rating?: number; maxRating?: number; lastName?: string; firstName?: string };

/** The identity the contract's pseudonym is made of: the handle, spelt as Codeforces keeps it, in lower case. */
export function codeforcesPlayerId(handle: string): string {
  return handle.trim().toLowerCase();
}

/** Where a person stands today, read plainly. A handle nobody has answers 400 with the site's own words. */
export async function readCodeforcesStanding(handle: string, fetchImpl: PlainFetch = fetch): Promise<ChessStanding> {
  if (!isValidCodeforcesHandle(handle)) throw new CodeforcesReadError("INVALID_USERNAME", "That is not a Codeforces handle");
  let response: Response;
  try {
    response = await fetchImpl(codeforcesUserUrl(handle), { headers: headersFor(CODEFORCES_USER), cache: "no-store", signal: AbortSignal.timeout(10_000) });
  } catch (error) {
    throw new CodeforcesReadError("FETCH_FAILED", "Codeforces is not answering", { cause: error });
  }
  const body = (await response.json().catch(() => null)) as { status?: string; comment?: string; result?: ApiUser[] } | null;
  if (response.status === 400 || body?.status === "FAILED") {
    if (/not found/i.test(body?.comment ?? "")) throw new CodeforcesReadError("PROFILE_NOT_FOUND", "No Codeforces user goes by that handle");
    throw new CodeforcesReadError("FETCH_FAILED", body?.comment ?? `Codeforces answered ${response.status}`);
  }
  if (response.status !== 200 || !body?.result?.[0]) throw new CodeforcesReadError("FETCH_FAILED", `Codeforces answered ${response.status}`);
  const user = body.result[0];
  const username = String(user.handle ?? handle);
  return {
    username,
    playerId: codeforcesPlayerId(username),
    status: "ok",
    rating: typeof user.rating === "number" ? user.rating : null,
    ratedAt: Math.floor(Date.now() / 1_000),
    rd: null,
    best: typeof user.maxRating === "number" ? user.maxRating : null,
  };
}

export type AttestedCodeforcesReading = Readonly<{
  username: string;
  playerId: string;
  status: string;
  /** The last name the account shows, on a reading taken with the name (the binding), null otherwise. */
  name: string | null;
  rating: number;
  ratedAt: number;
  rd: null;
  best: number | null;
  observedAt: number;
  nullifier: Hex;
  proofs: readonly ZkFetchProof[];
}>;

function codeforcesError(error: unknown, withName: boolean): CodeforcesReadError {
  if (!(error instanceof AttestedReadError)) return new CodeforcesReadError("FETCH_FAILED", "Codeforces could not be read right now", { cause: error });
  switch (error.code) {
    case "INVALID_ACCOUNT":
      return new CodeforcesReadError("INVALID_USERNAME", "That is not a Codeforces handle", { cause: error });
    case "NOT_FOUND":
    case "NOT_ACCEPTED":
      // Codeforces answers 400 to a handle nobody has.
      return new CodeforcesReadError("PROFILE_NOT_FOUND", "No Codeforces user goes by that handle", { cause: error });
    case "NO_MATCH":
      // The rating is the first pattern that can miss (no rated round yet); the last name the other (not set).
      return error.pattern?.includes("lastName") && withName ? new CodeforcesReadError("NO_NAME", "That account shows no last name, so no code can be in it", { cause: error }) : new CodeforcesReadError("NO_RATING", "That account has no rating yet", { cause: error });
    default:
      return new CodeforcesReadError(error.code as CodeforcesReadErrorCode, error.message, { cause: error });
  }
}

/** The reading that can move money: the rating, and the last name when the person binds the account with the code. */
export async function attestCodeforcesRating(input: { username: string; withName: boolean }, deps: AttestedReadDeps = reclaimAttestedReadDeps()): Promise<AttestedCodeforcesReading> {
  const source = input.withName ? CODEFORCES_USER_NAMED : CODEFORCES_USER;
  let reading;
  try {
    reading = await attestedRead(source.id, input.username, deps);
  } catch (error) {
    throw codeforcesError(error, input.withName);
  }
  const rating = Number(reading.values.rating);
  const username = String(reading.values.handle ?? input.username);
  if (!Number.isFinite(rating)) throw new CodeforcesReadError("NO_RATING", "That account has no rating yet");
  const best = Number(reading.values.maxRating);
  return {
    username,
    playerId: codeforcesPlayerId(username),
    status: "ok",
    name: input.withName ? String(reading.values.lastName ?? "") : null,
    rating,
    ratedAt: reading.observedAt,
    rd: null,
    best: Number.isFinite(best) ? best : null,
    observedAt: reading.observedAt,
    nullifier: reading.nullifier,
    proofs: [reading.proof],
  };
}
