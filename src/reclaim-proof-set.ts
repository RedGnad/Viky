import { getAddress, isAddress, type Hex } from "viem";
import { getIdentifierFromClaimInfo, type Proof } from "@reclaimprotocol/js-sdk";

/**
 * Ported from Lock-in's reclaim-onchain module: the fail-closed gates that run before a single proof
 * byte is trusted. The TEE attestation object is required on every proof (this is where the AI
 * fallback dies), sensitive headers are refused, the signed claim must hash to its identifier, and the
 * Reclaim session itself must have been executed by the pinned provider and reached PROOF_SUBMITTED.
 */

const HASH = /^0x[0-9a-fA-F]{64}$/;
const SIGNATURE = /^0x[0-9a-fA-F]{130}$/;
const FORBIDDEN_HEADER = /(?:cookie|authorization|token|secret|api[-_]?key)/i;
const MAX_PROOF_SET_BYTES = 192 * 1_024;

export const DUOLINGO_MAX_SIGNED_JSON_BYTES = 8_192;
export const STRAVA_MAX_SIGNED_JSON_BYTES = 16_384;
export const PINNED_RECLAIM_WITNESS = getAddress("0x244897572368Eadf65bfBc5aec98D8e5443a9072");

/** The only terminal Reclaim state Viky accepts. Notably NOT AI_PROOF_SUBMITTED. */
export const RECLAIM_PROOF_SUBMITTED = "PROOF_SUBMITTED";

export class ReclaimProofRejectedError extends Error {
  constructor(message = "The Reclaim proof was rejected") {
    super(message);
    this.name = "ReclaimProofRejectedError";
  }
}

export function rejectProof(message: string): never {
  throw new ReclaimProofRejectedError(message);
}

export function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) rejectProof(`${label} must be an object`);
  return value as Record<string, unknown>;
}

export function uint32(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > 0xffff_ffff) {
    rejectProof(`${label} must be a uint32`);
  }
  return Number(value);
}

function inspectHeaderContainer(value: unknown): void {
  if (typeof value === "string") {
    for (const line of value.split(/\r?\n/)) {
      const separator = line.indexOf(":");
      if (separator > 0 && FORBIDDEN_HEADER.test(line.slice(0, separator).trim())) {
        rejectProof("A signed request contains a forbidden sensitive header");
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    if (typeof value[0] === "string" && FORBIDDEN_HEADER.test(value[0])) {
      rejectProof("A signed request contains a forbidden sensitive header");
    }
    for (const item of value) inspectHeaderContainer(item);
    return;
  }
  if (!value || typeof value !== "object") return;
  const headers = value as Record<string, unknown>;
  for (const [name, headerValue] of Object.entries(headers)) {
    if (FORBIDDEN_HEADER.test(name)) rejectProof("A signed request contains a forbidden sensitive header");
    if (["name", "key", "header"].includes(name.toLowerCase()) && typeof headerValue === "string" && FORBIDDEN_HEADER.test(headerValue)) {
      rejectProof("A signed request contains a forbidden sensitive header");
    }
  }
}

function inspectSignedJson(value: string, label: string, maxBytes: number): void {
  if (utf8Bytes(value) > maxBytes) rejectProof(`${label} is too large`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    rejectProof(`${label} is not valid JSON`);
  }

  const visit = (node: unknown, depth: number): void => {
    if (depth > 20) rejectProof(`${label} is nested too deeply`);
    if (Array.isArray(node)) {
      if (node.length > 512) rejectProof(`${label} contains too many entries`);
      for (const child of node) visit(child, depth + 1);
      return;
    }
    if (!node || typeof node !== "object") return;
    const object = node as Record<string, unknown>;
    if (Object.keys(object).length > 256) rejectProof(`${label} contains too many fields`);
    for (const [key, child] of Object.entries(object)) {
      if (key.toLowerCase() === "headers" || key.toLowerCase() === "header") inspectHeaderContainer(child);
      visit(child, depth + 1);
    }
  };
  visit(parsed, 0);
}

export type ReclaimSessionSummary = Readonly<{
  sessionId?: string;
  appId?: string;
  providerId?: string;
  providerVersionString?: string;
  statusV2?: string;
  proofs?: unknown;
}>;

/**
 * Fail-closed provenance gate on the Reclaim session itself, checked before any proof byte is trusted.
 *
 * The signed context carries an `isAiProof` flag that Viky deliberately does not use as a trust
 * selector (verifyProof applies signature, content pin and TEE checks regardless of it). Trust is
 * established here instead: the session must have been executed by the exact pinned provider and
 * version, under our application, and must have reached the deterministic PROOF_SUBMITTED terminal
 * state. That rejects AI_PROOF_SUBMITTED and every unknown state explicitly.
 */
export function assertReclaimSessionProvenance(input: {
  session: ReclaimSessionSummary | undefined;
  expected: Readonly<{ sessionId: string; appId: string; providerId: string; providerVersion: string }>;
}): void {
  const { session, expected } = input;
  if (!session) rejectProof("Reclaim session is incomplete");
  if (!expected.appId) rejectProof("Reclaim application id is not configured");
  if (session.sessionId !== expected.sessionId) rejectProof("Reclaim session mismatch");
  if (typeof session.appId !== "string" || session.appId.toLowerCase() !== expected.appId.toLowerCase()) {
    rejectProof("Reclaim application mismatch");
  }
  if (session.providerId !== expected.providerId) rejectProof("Reclaim provider mismatch");
  if (session.providerVersionString !== expected.providerVersion) {
    rejectProof("Reclaim provider version mismatch");
  }
  if (session.statusV2 !== RECLAIM_PROOF_SUBMITTED) {
    rejectProof(`Unexpected Reclaim submission state: ${String(session.statusV2)}`);
  }
  if (!session.proofs) rejectProof("Reclaim proof set is absent");
}

/**
 * Accept only the concrete JSON shape returned by the Reclaim SDK. In particular,
 * signatures must remain an array: accepting a hand-shaped singular signature here
 * would make SDK verification and Solidity calldata validate different objects.
 */
export function assertSdkProofSet(value: unknown, options: { expectedCount: number; maxSignedJsonBytes: number; /** A witness portal's proof (D311): no enclave to require. */ witnessOnly?: boolean }): Proof[] {
  const proofs = Array.isArray(value) ? value : value ? [value] : [];
  if (!Number.isInteger(options.expectedCount) || options.expectedCount < 1) rejectProof("Invalid expected proof count");
  if (proofs.length !== options.expectedCount) rejectProof("Unexpected Reclaim proof count");

  let serialised: string;
  try {
    serialised = JSON.stringify(proofs);
  } catch {
    rejectProof("The Reclaim proof set is not serialisable");
  }
  if (utf8Bytes(serialised) > MAX_PROOF_SET_BYTES) rejectProof("The Reclaim proof set is too large");

  for (const [index, candidate] of proofs.entries()) {
    const proof = record(candidate, `proof ${index}`);
    const claimData = record(proof.claimData, `proof ${index} claimData`);
    if (typeof proof.identifier !== "string" || !HASH.test(proof.identifier)) rejectProof("Invalid proof identifier");
    if (typeof claimData.identifier !== "string" || !HASH.test(claimData.identifier)) rejectProof("Invalid claim identifier");
    if (proof.identifier.toLowerCase() !== claimData.identifier.toLowerCase()) rejectProof("Conflicting proof identifiers");
    if (claimData.provider !== "http") rejectProof("Unexpected Reclaim claim provider");
    if (typeof claimData.parameters !== "string" || typeof claimData.context !== "string") {
      rejectProof("Signed Reclaim claim data is missing");
    }
    if (typeof claimData.owner !== "string" || !isAddress(claimData.owner)) rejectProof("Invalid claim owner");
    uint32(claimData.timestampS, "claim timestamp");
    uint32(claimData.epoch, "claim epoch");
    if (!Array.isArray(proof.signatures) || proof.signatures.length !== 1 || !SIGNATURE.test(String(proof.signatures[0]))) {
      rejectProof("A Reclaim proof must contain one SDK signature in an array");
    }
    if (!Array.isArray(proof.witnesses)) rejectProof("Reclaim witnesses have an invalid shape");
    if (!options.witnessOnly && (!proof.teeAttestation || typeof proof.teeAttestation !== "object")) rejectProof("TEE attestation is missing");
    inspectSignedJson(claimData.parameters, `proof ${index} parameters`, options.maxSignedJsonBytes);
    inspectSignedJson(claimData.context, `proof ${index} context`, options.maxSignedJsonBytes);
    const computedIdentifier = getIdentifierFromClaimInfo(claimData as Parameters<typeof getIdentifierFromClaimInfo>[0]);
    if (computedIdentifier.toLowerCase() !== claimData.identifier.toLowerCase()) {
      rejectProof("Signed Reclaim claim data does not match its identifier");
    }
  }
  return proofs as Proof[];
}

export function asHexSignature(value: unknown): Hex {
  if (typeof value !== "string" || !SIGNATURE.test(value)) rejectProof("Invalid evidence signature");
  return value as Hex;
}
