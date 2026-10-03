import type { Hex } from "viem";
import { attestedRead, AttestedReadError, reclaimAttestedReadDeps, type AttestedReadDeps } from "./attested-read";
import { EDX_CERTIFICATE } from "./attested-sources";
import type { ZkFetchProof } from "./duolingo-public";
import { edxCertificateUrl, edxCourseKey, edxIssuedDaySeconds, edxSubject, edxText, isValidEdxCertificateId, isVerifiedTrack } from "./edx-certificate";

/**
 * Reading an edX certificate, two ways, on the model of Coursera's (src/coursera-reading.ts). Server only. A plain read
 * answers a screen before any money moves; an attested read is the only kind that moves money. Both take the same six
 * patterns out of the same page, the ones in `src/attested-sources.ts`.
 */

export type EdxReadErrorCode = "INVALID_LINK" | "NO_CERTIFICATE" | "NOT_VERIFIED" | "PROOF_INVALID" | "PROOF_MISMATCH" | "FETCH_FAILED" | "WORKER_OUT_OF_DATE" | "LIMIT_REACHED" | "NOT_CONFIGURED";

export class EdxReadError extends Error {
  constructor(
    readonly code: EdxReadErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "EdxReadError";
  }
}

export type EdxCertificate = Readonly<{
  id: string;
  name: string;
  /** Organisation and number, `gtx+isye6501x`. */
  courseKey: string;
  courseName: string;
  issuedDay: number;
  subject: Hex;
}>;

export type PlainFetch = (url: string, init: RequestInit) => Promise<Response>;

function valuesOf(page: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const match of EDX_CERTIFICATE.matches) {
    const found = new RegExp(match.value).exec(page);
    if (!found?.groups) continue;
    for (const [name, value] of Object.entries(found.groups)) if (value !== undefined) values[name] = value;
  }
  return values;
}

export function edxCertificateOf(id: string, values: Readonly<Record<string, string>>): EdxCertificate {
  if (!values.certificateId) throw new EdxReadError("NO_CERTIFICATE", "No certificate answers to that link");
  if ((values.certificateId ?? "").toLowerCase() !== id.toLowerCase()) throw new EdxReadError("PROOF_MISMATCH", "That page is about another certificate");
  // An honour certificate, or one of a track edX does not verify, is not what this line pays for.
  if (!isVerifiedTrack(values.track ?? "")) throw new EdxReadError("NOT_VERIFIED", "That certificate is not a verified one");
  const name = edxText(values.name ?? "");
  const courseKey = edxCourseKey(values.org ?? "", values.courseNumber ?? "");
  const issuedDay = edxIssuedDaySeconds(values.issued ?? "");
  if (!name || !courseKey || issuedDay === undefined) throw new EdxReadError("PROOF_INVALID", "That page did not carry a certificate we can read");
  return { id: id.toLowerCase(), name, courseKey, courseName: edxText(values.courseName ?? ""), issuedDay, subject: edxSubject(name, courseKey) };
}

/** The certificate behind an id, read plainly. Every refusal is typed, and none of them guesses. */
export async function readEdxCertificate(id: string, fetchImpl: PlainFetch = fetch): Promise<EdxCertificate> {
  if (!isValidEdxCertificateId(id)) throw new EdxReadError("INVALID_LINK", "That is not an edX certificate link");
  let response: Response;
  try {
    response = await fetchImpl(edxCertificateUrl(id), { headers: { accept: "text/html", "user-agent": "Mozilla/5.0 (Viky)" }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  } catch (error) {
    throw new EdxReadError("FETCH_FAILED", "The certificate could not be read right now", { cause: error });
  }
  if (response.status === 404) throw new EdxReadError("NO_CERTIFICATE", "No certificate answers to that link");
  if (response.status !== 200) throw new EdxReadError("FETCH_FAILED", `The certificate page answered ${response.status}`);
  return edxCertificateOf(id, valuesOf(await response.text().catch(() => "")));
}

export type AttestedEdxReading = EdxCertificate & Readonly<{ observedAt: number; nullifier: Hex; proofs: readonly ZkFetchProof[] }>;

function edxError(error: unknown): EdxReadError {
  if (!(error instanceof AttestedReadError)) return new EdxReadError("FETCH_FAILED", "The certificate could not be read right now", { cause: error });
  switch (error.code) {
    case "INVALID_ACCOUNT":
      return new EdxReadError("INVALID_LINK", "That is not an edX certificate link", { cause: error });
    case "NOT_FOUND":
      return new EdxReadError("NO_CERTIFICATE", "No certificate answers to that link", { cause: error });
    case "REFUSED":
    case "NOT_ACCEPTED":
      return new EdxReadError("FETCH_FAILED", "edX would not answer that reading", { cause: error });
    case "NO_MATCH":
      return new EdxReadError("PROOF_INVALID", "That page did not carry a certificate we can read", { cause: error });
    default:
      return new EdxReadError(error.code as EdxReadErrorCode, error.message, { cause: error });
  }
}

/** The reading that can move money. The page is read again every time, so a certificate edX withdraws stops paying. */
export async function attestEdxCertificate(id: string, deps: AttestedReadDeps = reclaimAttestedReadDeps()): Promise<AttestedEdxReading> {
  if (!isValidEdxCertificateId(id)) throw new EdxReadError("INVALID_LINK", "That is not an edX certificate link");
  let reading;
  try {
    reading = await attestedRead(EDX_CERTIFICATE.id, id.toLowerCase(), deps);
  } catch (error) {
    throw edxError(error);
  }
  return { ...edxCertificateOf(id, reading.values), observedAt: reading.observedAt, nullifier: reading.nullifier, proofs: [reading.proof] };
}
