import type { Hex } from "viem";
import { attestedRead, AttestedReadError, reclaimAttestedReadDeps, type AttestedReadDeps } from "./attested-read";
import { DET_CERTIFICATE } from "./attested-sources";
import { CHESS_USER_AGENT } from "./chess-com";
import { certificateSubject, detDataUrl, detTestDaySeconds, DET_SOURCE, isValidDetAlias, isValidDetScore } from "./duolingo-english-test";
import type { ZkFetchProof } from "./duolingo-public";

/**
 * Reading a Duolingo English Test result, two ways (U3). Server only.
 *
 * A plain read is what a screen uses: the recipient pastes the link of their own certificate and is told, in words,
 * whether it is public, whose it is, what it scored and when it was taken. It moves nothing.
 *
 * An attested read is the only kind that moves money, and it takes exactly three fields out of the answer: the score,
 * the day of the test and the name. The answer also carries a date of birth and a link to the taker's photograph;
 * neither is matched, neither is returned here, and neither is stored anywhere. The attestor sees the whole answer,
 * which is what the privacy page says.
 */

export type DetReadErrorCode =
  /** Not a certificate link at all. */
  | "INVALID_LINK"
  /** The taker has taken the certificate private again: the answer is 403 (measured 18 Sep 2026). */
  | "CERTIFICATE_PRIVATE"
  /** Past its two years: the answer is 400 (measured 18 Sep 2026). */
  | "CERTIFICATE_EXPIRED"
  | "NO_CERTIFICATE"
  /** The name on the certificate is not the name the gift was made for. */
  | "ANOTHER_NAME"
  | "FETCH_FAILED"
  | "PROOF_INVALID"
  | "PROOF_MISMATCH"
  /** The reading service runs older sources than this build, so nothing it fetches can be read here. */
  | "WORKER_OUT_OF_DATE"
  | "NOT_CONFIGURED";

export class DetReadError extends Error {
  constructor(
    readonly code: DetReadErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "DetReadError";
  }
}

/** What a certificate says, and nothing else it carries. */
export type DetCertificate = Readonly<{
  alias: string;
  /** The overall score, 10 to 160. */
  score: number;
  /** The day of the test, seconds at midnight UTC: the day the contract judges. */
  testDay: number;
  /** The name as the certificate prints it, kept only long enough to say whose it is. */
  name: string;
  /** The person and the thing, hashed the way the funder signed them. */
  subject: Hex;
}>;

export type PlainFetch = (url: string, init: RequestInit) => Promise<Response>;

function certificateOf(alias: string, body: unknown): DetCertificate {
  const answer = body as Record<string, unknown> | null;
  const score = Number(answer?.overall_score);
  const name = typeof answer?.full_name === "string" ? answer.full_name : "";
  const testDay = typeof answer?.test_date === "string" ? detTestDaySeconds(answer.test_date) : undefined;
  if (!isValidDetScore(score) || name.length === 0 || testDay === undefined) {
    throw new DetReadError("PROOF_INVALID", "That certificate did not carry a result we can read");
  }
  return { alias, score, testDay, name, subject: certificateSubject(DET_SOURCE, name) };
}

/**
 * The certificate behind a link, read plainly. Every refusal is typed, and the three that matter are facts about the
 * page rather than failures of ours: private again, expired, or never there.
 */
export async function readDetCertificate(alias: string, fetchImpl: PlainFetch = fetch): Promise<DetCertificate> {
  if (!isValidDetAlias(alias)) throw new DetReadError("INVALID_LINK", "That is not a certificate link");
  let response: Response;
  try {
    response = await fetchImpl(detDataUrl(alias), {
      headers: { accept: "application/json", "user-agent": CHESS_USER_AGENT },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new DetReadError("FETCH_FAILED", "The certificate could not be read right now", { cause: error });
  }
  if (response.status === 403) throw new DetReadError("CERTIFICATE_PRIVATE", "That certificate is not public");
  if (response.status === 400) throw new DetReadError("CERTIFICATE_EXPIRED", "That certificate has expired");
  if (response.status === 404) throw new DetReadError("NO_CERTIFICATE", "No certificate answers to that link");
  if (response.status !== 200) throw new DetReadError("FETCH_FAILED", `The certificate page answered ${response.status}`);
  const body = (await response.json().catch(() => null)) as unknown;
  return certificateOf(alias, body);
}

export type AttestedDetReading = DetCertificate &
  Readonly<{
    /** The attestor's own time of the read. */
    observedAt: number;
    /** One reading, one use. */
    nullifier: Hex;
    proofs: readonly ZkFetchProof[];
  }>;

function detError(error: unknown): DetReadError {
  if (!(error instanceof AttestedReadError)) return new DetReadError("FETCH_FAILED", "The certificate could not be read right now", { cause: error });
  switch (error.code) {
    case "INVALID_ACCOUNT":
      return new DetReadError("INVALID_LINK", "That is not a certificate link", { cause: error });
    case "REFUSED":
      return new DetReadError("CERTIFICATE_PRIVATE", "That certificate is not public", { cause: error });
    case "NOT_ACCEPTED":
      return new DetReadError("CERTIFICATE_EXPIRED", "That certificate has expired", { cause: error });
    case "NOT_FOUND":
      return new DetReadError("NO_CERTIFICATE", "No certificate answers to that link", { cause: error });
    case "NO_MATCH":
      // The answer came back without a score, a day or a name: it is not a result we can settle anything on.
      return new DetReadError("PROOF_INVALID", "That certificate did not carry a result we can read", { cause: error });
    default:
      return new DetReadError(error.code, error.message, { cause: error });
  }
}

/** The reading that can move money. The link is read again every time, so a certificate withdrawn stops paying. */
export async function attestDetCertificate(alias: string, deps: AttestedReadDeps = reclaimAttestedReadDeps()): Promise<AttestedDetReading> {
  let reading;
  try {
    reading = await attestedRead(DET_CERTIFICATE.id, alias, deps);
  } catch (error) {
    throw detError(error);
  }
  const certificate = certificateOf(alias, {
    overall_score: Number(reading.values.overallScore ?? ""),
    full_name: reading.values.fullName ?? "",
    test_date: reading.values.testDate ?? "",
  });
  return { ...certificate, observedAt: reading.observedAt, nullifier: reading.nullifier, proofs: [reading.proof] };
}

/** Whether this certificate is the one the gift was made for: the same person, by the funder's own words. */
export function certificateIsFor(certificate: Pick<DetCertificate, "subject">, subject: Hex): boolean {
  return certificate.subject.toLowerCase() === subject.toLowerCase();
}

/** The refusal a screen says when it is somebody else's certificate. Kept here so both sides use one sentence. */
export function refuseAnotherName(): DetReadError {
  return new DetReadError("ANOTHER_NAME", "That certificate is in another name");
}
