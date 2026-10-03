import type { Hex } from "viem";
import { attestedRead, AttestedReadError, reclaimAttestedReadDeps, type AttestedReadDeps } from "./attested-read";
import { duolingoCourseSource } from "./attested-sources";
import { duolingoCourseXpPattern } from "./duolingo-public-terms";
import type { ZkFetchProof } from "./duolingo-public";

/**
 * Reading one Duolingo course, attested (U1). Server only.
 *
 * The public profile carries the experience of every course the person has started, and the sum of them is the total
 * Viky counted before (measured on 18 Sep 2026 over 19 profiles: the two are equal on all of them). A gift made on one
 * course reads that course's number and nothing else, so a day of German cannot pay for a gift about Spanish.
 *
 * The identity, the name (where the binding code goes) and the course's experience come out of the one reading of the
 * one page, so nothing can be stitched together from two moments.
 */

export type CourseReading = Readonly<{
  username: string;
  profileId: string;
  displayName: string;
  courseId: string;
  courseXp: number;
  /** The attestor's time of the read: what a check-in carries. */
  observedAt: number;
  /** One reading, one use. */
  nullifier: Hex;
  proof: ZkFetchProof;
}>;

export type CourseReadErrorCode =
  | "INVALID_USERNAME"
  | "PROFILE_NOT_FOUND"
  /** The profile carries no such course: that account is not learning it. */
  | "NO_SUCH_COURSE"
  | "FETCH_FAILED"
  | "PROOF_INVALID"
  | "PROOF_MISMATCH"
  /** The reading service runs older sources than this build, so nothing it fetches can be read here. */
  | "WORKER_OUT_OF_DATE"
  /** The month's limit of attested readings is reached: nothing was fetched (src/attested-calls.ts). */
  | "LIMIT_REACHED"
  | "NOT_CONFIGURED";

export class CourseReadError extends Error {
  constructor(
    readonly code: CourseReadErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "CourseReadError";
  }
}

function courseError(error: unknown, coursePattern: string): CourseReadError {
  if (!(error instanceof AttestedReadError)) return new CourseReadError("FETCH_FAILED", "Duolingo could not be read right now", { cause: error });
  switch (error.code) {
    case "INVALID_ACCOUNT":
      return new CourseReadError("INVALID_USERNAME", "That does not look like a Duolingo username", { cause: error });
    case "NOT_FOUND":
      return new CourseReadError("PROFILE_NOT_FOUND", "No public Duolingo profile with that username", { cause: error });
    case "NO_MATCH":
      // A username nobody has answers `{"users":[]}`, so every pattern misses: the profile is what is missing, not the
      // course. Only a miss on the course pattern alone says the account is not learning it.
      if (error.pattern === coursePattern) return new CourseReadError("NO_SUCH_COURSE", "That profile carries no such course", { cause: error });
      return new CourseReadError("PROFILE_NOT_FOUND", "No public Duolingo profile with that username", { cause: error });
    case "REFUSED":
    case "NOT_ACCEPTED":
      // Duolingo's public profile answers 404 for a username nobody has. A 403 or a 400 is Duolingo refusing us, which
      // is ours to fix and never a fact about the person's account (U3 added those two codes for a source that has them).
      return new CourseReadError("FETCH_FAILED", "Duolingo would not answer that reading", { cause: error });
    default:
      return new CourseReadError(error.code, error.message, { cause: error });
  }
}

/** One course's experience, attested. Every failure is typed, and a missing course is its own answer. */
export async function readDuolingoCourse(
  input: { username: string; courseId: string },
  deps: AttestedReadDeps = reclaimAttestedReadDeps(),
): Promise<CourseReading> {
  const source = duolingoCourseSource(input.courseId);
  if (!source) throw new CourseReadError("NOT_CONFIGURED", "That is not a course this reads");
  let reading;
  try {
    reading = await attestedRead(source.id, input.username, deps);
  } catch (error) {
    throw courseError(error, duolingoCourseXpPattern(input.courseId));
  }
  const profileId = reading.values.id ?? "";
  const username = reading.values.username ?? "";
  const courseXp = reading.values.courseXp ?? "";
  if (!/^\d{1,18}$/.test(profileId) || !/^\d{1,12}$/.test(courseXp) || username.length === 0) {
    throw new CourseReadError("PROOF_INVALID", "The reading does not carry a complete profile");
  }
  if (username.toLowerCase() !== input.username.toLowerCase()) throw new CourseReadError("PROOF_MISMATCH", "The reading is about another username");
  return {
    username,
    profileId,
    displayName: reading.values.name ?? "",
    courseId: input.courseId,
    courseXp: Number(courseXp),
    observedAt: reading.observedAt,
    nullifier: reading.nullifier,
    proof: reading.proof,
  };
}
