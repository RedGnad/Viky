import type { Hex } from "viem";
import { attestedRead, AttestedReadError, reclaimAttestedReadDeps, type AttestedReadDeps } from "./attested-read";
import { COURSERA_CERTIFICATE } from "./attested-sources";
import {
  courseraCertificateUrl,
  courseraGrantedDaySeconds,
  courseraName,
  courseraSubject,
  isValidCourseraCode,
  isValidCourseraSlug,
} from "./coursera-certificate";
import type { ZkFetchProof } from "./duolingo-public";

/**
 * Reading a Coursera certificate, two ways (C3). Server only.
 *
 * A plain read is what a screen uses: somebody pastes the link of a certificate and is told, in words, whose it is,
 * which course it is for and the day it was granted. It moves nothing.
 *
 * An attested read is the only kind that moves money. Both take the same four patterns out of the same page, the
 * ones in `src/attested-sources.ts`, so a screen can never say one thing and a proof another.
 *
 * What the page carries, measured on a live certificate on 19 Sep 2026: the holder's two names (the last one can be
 * empty, and that certificate's is), the course's id, slug and printed name, the certificate code, and the day it
 * was granted in milliseconds. Nothing else is matched, returned or stored.
 */

export type CourseraReadErrorCode =
  /** Not a certificate link or code at all. */
  | "INVALID_LINK"
  /**
   * No certificate answers to that code. Coursera does not say so with a status: a code nobody has answers 200 with
   * a page carrying no certificate at all (measured 19 Sep 2026), so the absence is what this reads.
   */
  | "NO_CERTIFICATE"
  /** The page answered, and did not carry what a certificate needs. */
  | "PROOF_INVALID"
  /** The page is about another certificate than the one that was asked for. */
  | "PROOF_MISMATCH"
  | "FETCH_FAILED"
  /** The reading service runs older sources than this build, so nothing it fetches can be read here. */
  | "WORKER_OUT_OF_DATE"
  | "NOT_CONFIGURED";

export class CourseraReadError extends Error {
  constructor(
    readonly code: CourseraReadErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "CourseraReadError";
  }
}

/** What a certificate says, and nothing else the page carries. */
export type CourseraCertificate = Readonly<{
  code: string;
  /** The name as the certificate prints it, kept only long enough to say whose it is. */
  name: string;
  /** The course, in the word a person reads in a link: `introduction-git-github`. */
  courseSlug: string;
  /** The course as Coursera prints it, for a screen to show. */
  courseName: string;
  /** The day it was granted, seconds at midnight UTC: the day the contract judges. */
  grantedDay: number;
  /** The person and the course, hashed the way the funder signed them. */
  subject: Hex;
}>;

export type PlainFetch = (url: string, init: RequestInit) => Promise<Response>;

/** The pattern that says a page is a certificate at all, named so a refusal can tell absence from a change of shape. */
const CERTIFICATE_PATTERN = COURSERA_CERTIFICATE.matches[2].value;

/**
 * The page's own values, taken with the source's own patterns. One definition of what is read, used by the plain
 * read and by the attested one, so the two can never drift apart.
 */
function valuesOf(page: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const match of COURSERA_CERTIFICATE.matches) {
    const found = new RegExp(match.value).exec(page);
    if (!found?.groups) continue;
    for (const [name, value] of Object.entries(found.groups)) if (value !== undefined) values[name] = value;
  }
  return values;
}

function certificateOf(code: string, values: Record<string, string>): CourseraCertificate {
  // A code nobody has answers 200 with a page carrying no certificate at all: no error code, no message, and the
  // same 377 KB for any two unknown codes (measured 19 Sep 2026). So what says "no such certificate" here is the
  // absence of the certificate itself, never the status, and a page missing only some of its fields is a different
  // thing: that is a shape that changed under us, and it is ours to fix.
  if (!values.certificateCode) throw new CourseraReadError("NO_CERTIFICATE", "No certificate answers to that link");
  const name = courseraName(values.firstName ?? "", values.lastName ?? "");
  const courseSlug = (values.slug ?? "").toLowerCase();
  const grantedDay = courseraGrantedDaySeconds(Number(values.grantedAt ?? ""));
  if (name.length === 0 || !isValidCourseraSlug(courseSlug) || grantedDay === undefined) {
    throw new CourseraReadError("PROOF_INVALID", "That page did not carry a certificate we can read");
  }
  // The page must be about the certificate that was asked for: a redirect to somebody else's would otherwise pass.
  const found = (values.certificateCode ?? "").toUpperCase();
  if (found !== code.toUpperCase()) throw new CourseraReadError("PROOF_MISMATCH", "That page is about another certificate");
  return {
    code: code.toUpperCase(),
    name,
    courseSlug,
    courseName: values.courseName ?? "",
    grantedDay,
    subject: courseraSubject(name, courseSlug),
  };
}

/** The certificate behind a code, read plainly. Every refusal is typed, and none of them guesses. */
export async function readCourseraCertificate(code: string, fetchImpl: PlainFetch = fetch): Promise<CourseraCertificate> {
  if (!isValidCourseraCode(code)) throw new CourseraReadError("INVALID_LINK", "That is not a certificate link");
  let response: Response;
  try {
    response = await fetchImpl(courseraCertificateUrl(code), {
      headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (Viky)" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new CourseraReadError("FETCH_FAILED", "The certificate could not be read right now", { cause: error });
  }
  if (response.status === 404) throw new CourseraReadError("NO_CERTIFICATE", "No certificate answers to that link");
  if (response.status !== 200) throw new CourseraReadError("FETCH_FAILED", `The certificate page answered ${response.status}`);
  const page = await response.text().catch(() => "");
  return certificateOf(code, valuesOf(page));
}

export type AttestedCourseraReading = CourseraCertificate &
  Readonly<{
    /** The attestor's own time of the read. */
    observedAt: number;
    /** One reading, one use. */
    nullifier: Hex;
    proofs: readonly ZkFetchProof[];
  }>;

function courseraError(error: unknown): CourseraReadError {
  if (!(error instanceof AttestedReadError)) return new CourseraReadError("FETCH_FAILED", "The certificate could not be read right now", { cause: error });
  switch (error.code) {
    case "INVALID_ACCOUNT":
      return new CourseraReadError("INVALID_LINK", "That is not a certificate link", { cause: error });
    case "NOT_FOUND":
      return new CourseraReadError("NO_CERTIFICATE", "No certificate answers to that link", { cause: error });
    case "REFUSED":
    case "NOT_ACCEPTED":
      // Coursera refusing us is ours to fix and never a fact about the certificate.
      return new CourseraReadError("FETCH_FAILED", "Coursera would not answer that reading", { cause: error });
    case "NO_MATCH":
      // The certificate's own pattern is what an unknown code misses, because its page carries no certificate.
      // Any other pattern missing on a page that does carry one is a shape that changed, which is ours to fix.
      return error.pattern === CERTIFICATE_PATTERN
        ? new CourseraReadError("NO_CERTIFICATE", "No certificate answers to that link", { cause: error })
        : new CourseraReadError("PROOF_INVALID", "That page did not carry a certificate we can read", { cause: error });
    default:
      return new CourseraReadError(error.code, error.message, { cause: error });
  }
}

/** The reading that can move money. The page is read again every time, so a certificate taken down stops paying. */
export async function attestCourseraCertificate(code: string, deps: AttestedReadDeps = reclaimAttestedReadDeps()): Promise<AttestedCourseraReading> {
  if (!isValidCourseraCode(code)) throw new CourseraReadError("INVALID_LINK", "That is not a certificate link");
  let reading;
  try {
    reading = await attestedRead(COURSERA_CERTIFICATE.id, code.toUpperCase(), deps);
  } catch (error) {
    throw courseraError(error);
  }
  const certificate = certificateOf(code, reading.values);
  return { ...certificate, observedAt: reading.observedAt, nullifier: reading.nullifier, proofs: [reading.proof] };
}
