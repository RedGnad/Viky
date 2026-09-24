import type { Hex } from "viem";
import { attestedRead, AttestedReadError, reclaimAttestedReadDeps, type AttestedReadDeps } from "./attested-read";
import { MITX_ONLINE_CERTIFICATE } from "./attested-sources";
import type { ZkFetchProof } from "./duolingo-public";
import { isValidMitxOnlineKey, mitxOnlineCertificateUrl, mitxOnlineCourseOf, mitxOnlineIssuedDaySeconds, mitxOnlineSubject, mitxOnlineText } from "./mitx-online-certificate";

/**
 * Reading a MITx Online certificate, two ways, on the model of edX's (src/edx-reading.ts). Server only. A plain read
 * answers a screen before any money moves; an attested read is the only kind that moves money. Both take the same four
 * patterns out of the same page, the ones in `src/attested-sources.ts`.
 */

export type MitxOnlineReadErrorCode = "INVALID_LINK" | "NO_CERTIFICATE" | "PROOF_INVALID" | "PROOF_MISMATCH" | "FETCH_FAILED" | "WORKER_OUT_OF_DATE" | "NOT_CONFIGURED";

export class MitxOnlineReadError extends Error {
  constructor(
    readonly code: MitxOnlineReadErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "MitxOnlineReadError";
  }
}

export type MitxOnlineCertificate = Readonly<{
  /** The uuid, with `program/` before it for a program's certificate. */
  key: string;
  name: string;
  /** The course or the program, as this line compares it. */
  course: string;
  title: string;
  issuedDay: number;
  subject: Hex;
}>;

export type PlainFetch = (url: string, init: RequestInit) => Promise<Response>;

function valuesOf(page: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const match of MITX_ONLINE_CERTIFICATE.matches) {
    const found = new RegExp(match.value).exec(page);
    if (!found?.groups) continue;
    for (const [name, value] of Object.entries(found.groups)) if (value !== undefined) values[name] = value;
  }
  return values;
}

export function mitxOnlineCertificateOf(key: string, values: Readonly<Record<string, string>>): MitxOnlineCertificate {
  if (!values.certificateId) throw new MitxOnlineReadError("NO_CERTIFICATE", "No certificate answers to that link");
  const uuid = key.toLowerCase().replace(/^program\//, "");
  if (values.certificateId.toLowerCase() !== uuid) throw new MitxOnlineReadError("PROOF_MISMATCH", "That page is about another certificate");
  const name = mitxOnlineText(values.name ?? "");
  const title = mitxOnlineText(values.title ?? "");
  const course = mitxOnlineCourseOf(title);
  const issuedDay = mitxOnlineIssuedDaySeconds(values.issued ?? "");
  if (!name || !course || issuedDay === undefined) throw new MitxOnlineReadError("PROOF_INVALID", "That page did not carry a certificate we can read");
  return { key: key.toLowerCase(), name, course, title, issuedDay, subject: mitxOnlineSubject(name, course) };
}

/** The certificate behind a key, read plainly. Every refusal is typed, and none of them guesses. */
export async function readMitxOnlineCertificate(key: string, fetchImpl: PlainFetch = fetch): Promise<MitxOnlineCertificate> {
  if (!isValidMitxOnlineKey(key)) throw new MitxOnlineReadError("INVALID_LINK", "That is not a MITx Online certificate link");
  let response: Response;
  try {
    response = await fetchImpl(mitxOnlineCertificateUrl(key), { headers: { accept: "text/html", "user-agent": "Mozilla/5.0 (Viky)" }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  } catch (error) {
    throw new MitxOnlineReadError("FETCH_FAILED", "The certificate could not be read right now", { cause: error });
  }
  if (response.status === 404) throw new MitxOnlineReadError("NO_CERTIFICATE", "No certificate answers to that link");
  if (response.status !== 200) throw new MitxOnlineReadError("FETCH_FAILED", `The certificate page answered ${response.status}`);
  return mitxOnlineCertificateOf(key, valuesOf(await response.text().catch(() => "")));
}

export type AttestedMitxOnlineReading = MitxOnlineCertificate & Readonly<{ observedAt: number; nullifier: Hex; proofs: readonly ZkFetchProof[] }>;

function mitxOnlineError(error: unknown): MitxOnlineReadError {
  if (!(error instanceof AttestedReadError)) return new MitxOnlineReadError("FETCH_FAILED", "The certificate could not be read right now", { cause: error });
  switch (error.code) {
    case "INVALID_ACCOUNT":
      return new MitxOnlineReadError("INVALID_LINK", "That is not a MITx Online certificate link", { cause: error });
    case "NOT_FOUND":
      return new MitxOnlineReadError("NO_CERTIFICATE", "No certificate answers to that link", { cause: error });
    case "REFUSED":
    case "NOT_ACCEPTED":
      return new MitxOnlineReadError("FETCH_FAILED", "MITx Online would not answer that reading", { cause: error });
    case "NO_MATCH":
      return new MitxOnlineReadError("PROOF_INVALID", "That page did not carry a certificate we can read", { cause: error });
    default:
      return new MitxOnlineReadError(error.code as MitxOnlineReadErrorCode, error.message, { cause: error });
  }
}

/** The reading that can move money. The page is read again every time, so a certificate MITx Online revokes stops paying. */
export async function attestMitxOnlineCertificate(key: string, deps: AttestedReadDeps = reclaimAttestedReadDeps()): Promise<AttestedMitxOnlineReading> {
  if (!isValidMitxOnlineKey(key)) throw new MitxOnlineReadError("INVALID_LINK", "That is not a MITx Online certificate link");
  let reading;
  try {
    reading = await attestedRead(MITX_ONLINE_CERTIFICATE.id, key.toLowerCase(), deps);
  } catch (error) {
    throw mitxOnlineError(error);
  }
  return { ...mitxOnlineCertificateOf(key, reading.values), observedAt: reading.observedAt, nullifier: reading.nullifier, proofs: [reading.proof] };
}
