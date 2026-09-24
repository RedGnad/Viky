import type { Hex } from "viem";
import { attestedRead, AttestedReadError, reclaimAttestedReadDeps, type AttestedReadDeps } from "./attested-read";
import { ACCREDIBLE_CREDENTIAL } from "./attested-sources";
import type { ZkFetchProof } from "./duolingo-public";
import { accredibleIssuedDaySeconds, accredibleRecordUrl, accredibleSubject, isValidAccredibleId, issuerDomainOf, normaliseCredentialTitle } from "./accredible-credential";

/**
 * Reading an Accredible credential, two ways, on the model of edX's (src/edx-reading.ts). Server only. The subject is
 * built for every domain the issuer's website sits under, so the funder's "cfte.education" matches an issuer whose site
 * is "www.cfte.education" or "courses.cfte.education"; the certificate path compares the one the funder signed.
 */

export type AccredibleReadErrorCode = "INVALID_LINK" | "NO_CERTIFICATE" | "CERTIFICATE_PRIVATE" | "CERTIFICATE_EXPIRED" | "PROOF_INVALID" | "PROOF_MISMATCH" | "FETCH_FAILED" | "WORKER_OUT_OF_DATE" | "NOT_CONFIGURED";

export class AccredibleReadError extends Error {
  constructor(
    readonly code: AccredibleReadErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "AccredibleReadError";
  }
}

export type AccredibleCredential = Readonly<{
  id: string;
  name: string;
  title: string;
  /** The issuer's website host, `cfte.education`. */
  issuerHost: string;
  issuedDay: number;
  /** One subject per domain the issuer's host sits under, the host itself first. */
  subjects: readonly Hex[];
}>;

export type PlainFetch = (url: string, init: RequestInit) => Promise<Response>;

function valuesOf(page: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const match of ACCREDIBLE_CREDENTIAL.matches) {
    const found = new RegExp(match.value).exec(page);
    if (!found?.groups) continue;
    for (const [name, value] of Object.entries(found.groups)) if (value !== undefined) values[name] = value;
  }
  return values;
}

/** Every domain a host sits under, down to two labels: `courses.cfte.education`, `cfte.education`. */
function domainsOf(host: string): string[] {
  const labels = host.split(".");
  const out: string[] = [];
  for (let i = 0; i <= labels.length - 2; i++) out.push(labels.slice(i).join("."));
  return out;
}

export function accredibleCredentialOf(id: string, values: Readonly<Record<string, string>>): AccredibleCredential {
  if (!values.uuid) throw new AccredibleReadError("NO_CERTIFICATE", "No credential answers to that link");
  if (values.uuid.toLowerCase() !== id.toLowerCase()) throw new AccredibleReadError("PROOF_MISMATCH", "That record is about another credential");
  if (values.private === "true") throw new AccredibleReadError("CERTIFICATE_PRIVATE", "That credential is private");
  if (values.expired === "true" || (values.revokedAt ?? "null") !== "null") throw new AccredibleReadError("CERTIFICATE_EXPIRED", "That credential has expired or was revoked");
  const name = (values.name ?? "").trim();
  const title = normaliseCredentialTitle(values.title ?? "");
  const issuerHost = issuerDomainOf(values.issuerUrl ?? "");
  const issuedDay = accredibleIssuedDaySeconds(values.issuedOn ?? "");
  if (!name || !title || !issuerHost || issuedDay === undefined) throw new AccredibleReadError("PROOF_INVALID", "That record did not carry a credential we can read");
  return { id: id.toLowerCase(), name, title: values.title ?? "", issuerHost, issuedDay, subjects: domainsOf(issuerHost).map((domain) => accredibleSubject(name, `${title}|${domain}`)) };
}

export async function readAccredibleCredential(id: string, fetchImpl: PlainFetch = fetch): Promise<AccredibleCredential> {
  if (!isValidAccredibleId(id)) throw new AccredibleReadError("INVALID_LINK", "That is not an Accredible credential link");
  let response: Response;
  try {
    response = await fetchImpl(accredibleRecordUrl(id), { headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (Viky)" }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  } catch (error) {
    throw new AccredibleReadError("FETCH_FAILED", "The credential could not be read right now", { cause: error });
  }
  if (response.status === 404) throw new AccredibleReadError("NO_CERTIFICATE", "No credential answers to that link");
  if (response.status !== 200) throw new AccredibleReadError("FETCH_FAILED", `The credential record answered ${response.status}`);
  return accredibleCredentialOf(id, valuesOf(await response.text().catch(() => "")));
}

export type AttestedAccredibleReading = AccredibleCredential & Readonly<{ observedAt: number; nullifier: Hex; proofs: readonly ZkFetchProof[] }>;

function accredibleError(error: unknown): AccredibleReadError {
  if (!(error instanceof AttestedReadError)) return new AccredibleReadError("FETCH_FAILED", "The credential could not be read right now", { cause: error });
  switch (error.code) {
    case "INVALID_ACCOUNT":
      return new AccredibleReadError("INVALID_LINK", "That is not an Accredible credential link", { cause: error });
    case "NOT_FOUND":
      return new AccredibleReadError("NO_CERTIFICATE", "No credential answers to that link", { cause: error });
    case "REFUSED":
    case "NOT_ACCEPTED":
      return new AccredibleReadError("FETCH_FAILED", "Accredible would not answer that reading", { cause: error });
    case "NO_MATCH":
      return new AccredibleReadError("PROOF_INVALID", "That record did not carry a credential we can read", { cause: error });
    default:
      return new AccredibleReadError(error.code as AccredibleReadErrorCode, error.message, { cause: error });
  }
}

export async function attestAccredibleCredential(id: string, deps: AttestedReadDeps = reclaimAttestedReadDeps()): Promise<AttestedAccredibleReading> {
  if (!isValidAccredibleId(id)) throw new AccredibleReadError("INVALID_LINK", "That is not an Accredible credential link");
  let reading;
  try {
    reading = await attestedRead(ACCREDIBLE_CREDENTIAL.id, id.toLowerCase(), deps);
  } catch (error) {
    throw accredibleError(error);
  }
  return { ...accredibleCredentialOf(id, reading.values), observedAt: reading.observedAt, nullifier: reading.nullifier, proofs: [reading.proof] };
}
