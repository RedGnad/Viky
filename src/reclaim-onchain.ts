import { keccak256, stringToHex, type Hash } from "viem";
import { getIdentifierFromClaimInfo, transformForOnchain, type Proof } from "@reclaimprotocol/js-sdk";
import { reclaimProofComponents } from "./reclaim-abi";
import { record, rejectProof, ReclaimProofRejectedError, uint32, utf8Bytes } from "./reclaim-proof-set";

/**
 * Ported from Lock-in: turns SDK proofs into the Solidity structs the direct verifiers read, with the
 * signed context canonicalised so the on-chain identifier recomputation matches. The escrow-specific
 * parity helpers of Lock-in are not ported: Viky's v1 path is the evidence signer, and the direct
 * verifiers become a path only once their live schema is confirmed.
 */

const HASH = /^0x[0-9a-fA-F]{64}$/;
const MAX_SESSION_ID_BYTES = 128;

export type OnchainProof = ReturnType<typeof transformForOnchain>;

export type DirectProofBundle = Readonly<{
  sessionId: string;
  proofs: readonly OnchainProof[];
}>;

export type DirectDuolingoEvidence = Readonly<{
  identityHash: Hash;
  proofSetHash: Hash;
  totalXp: bigint;
  proofTimestamp: number;
}>;

export type DirectStravaEvidence = Readonly<{
  identityHash: Hash;
  nullifier: Hash;
  proofSetHash: Hash;
  distanceMeters: bigint;
  startTime: bigint;
  movingTimeSeconds: bigint;
  elapsedTimeSeconds: bigint;
  elevationGainMeters: bigint;
  oldestProofTimestamp: number;
  newestProofTimestamp: number;
}>;

/** Mirrors the RFC 8785-style serializer used by Reclaim JS SDK 5.8.2. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) rejectProof("Signed context contains an unsupported JSON value");
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(",")}}`;
}

function canonicalClaimContext(context: string): string {
  try {
    return canonicalJson(JSON.parse(context));
  } catch (error) {
    if (error instanceof ReclaimProofRejectedError) throw error;
    return rejectProof("Signed Reclaim context is not valid JSON");
  }
}

function assertUnchangedTransform(proof: Proof, transformed: OnchainProof): void {
  const claimInfo = record(transformed.claimInfo, "transformed claimInfo");
  const signedClaim = record(transformed.signedClaim, "transformed signedClaim");
  const claim = record(signedClaim.claim, "transformed claim");
  if (
    claimInfo.provider !== proof.claimData.provider ||
    claimInfo.parameters !== proof.claimData.parameters ||
    claimInfo.context !== proof.claimData.context ||
    claim.identifier !== proof.claimData.identifier ||
    claim.owner !== proof.claimData.owner ||
    claim.timestampS !== proof.claimData.timestampS ||
    claim.epoch !== proof.claimData.epoch ||
    !Array.isArray(signedClaim.signatures) ||
    signedClaim.signatures.length !== proof.signatures.length ||
    signedClaim.signatures.some((signature, index) => signature !== proof.signatures[index])
  ) {
    rejectProof("The SDK onchain transform changed signed claim bytes");
  }
}

/**
 * Returns Solidity-compatible claims. Reclaim signs the RFC 8785 canonical form
 * of context but its SDK onchain transform currently copies the raw key order.
 * Canonicalising context here preserves the signed identifier and lets Solidity
 * recompute it; parameters and every other signed field stay byte-exact.
 */
export function toDirectProofBundle(sessionId: string, proofs: readonly Proof[]): DirectProofBundle {
  if (utf8Bytes(sessionId) === 0 || utf8Bytes(sessionId) > MAX_SESSION_ID_BYTES || !/^[A-Za-z0-9_-]+$/.test(sessionId)) {
    rejectProof("Invalid Reclaim session id");
  }
  const transformed = proofs.map((proof) => {
    const onchain = transformForOnchain(proof);
    assertUnchangedTransform(proof, onchain);
    const context = canonicalClaimContext(proof.claimData.context);
    const identifier = getIdentifierFromClaimInfo({ ...proof.claimData, context } as Parameters<typeof getIdentifierFromClaimInfo>[0]);
    if (identifier.toLowerCase() !== proof.claimData.identifier.toLowerCase()) {
      rejectProof("Canonical Reclaim context does not match the signed identifier");
    }
    return { ...onchain, claimInfo: { ...onchain.claimInfo, context } };
  });
  return { sessionId, proofs: transformed };
}

export function sessionIdHash(sessionId: string): Hash {
  return keccak256(stringToHex(sessionId));
}

export function asDirectDuolingoEvidence(value: unknown): DirectDuolingoEvidence {
  const output = record(value, "Duolingo verifier output");
  if (typeof output.identityHash !== "string" || !HASH.test(output.identityHash)) rejectProof("Invalid direct identity");
  if (typeof output.proofSetHash !== "string" || !HASH.test(output.proofSetHash)) rejectProof("Invalid direct proof hash");
  const totalXp = typeof output.totalXp === "bigint" ? output.totalXp : BigInt(String(output.totalXp));
  const proofTimestamp = uint32(output.proofTimestamp, "direct proof timestamp");
  return {
    identityHash: output.identityHash as Hash,
    proofSetHash: output.proofSetHash as Hash,
    totalXp,
    proofTimestamp,
  };
}

export function asDirectStravaEvidence(value: unknown): DirectStravaEvidence {
  const output = record(value, "Strava verifier output");
  for (const field of ["identityHash", "nullifier", "proofSetHash"] as const) {
    if (typeof output[field] !== "string" || !HASH.test(output[field])) rejectProof(`Invalid direct ${field}`);
  }
  const bigintField = (field: string): bigint => {
    const value = output[field];
    try {
      return typeof value === "bigint" ? value : BigInt(String(value));
    } catch {
      return rejectProof(`Invalid direct ${field}`);
    }
  };
  return {
    identityHash: output.identityHash as Hash,
    nullifier: output.nullifier as Hash,
    proofSetHash: output.proofSetHash as Hash,
    distanceMeters: bigintField("distanceMeters"),
    startTime: bigintField("startTime"),
    movingTimeSeconds: bigintField("movingTimeSeconds"),
    elapsedTimeSeconds: bigintField("elapsedTimeSeconds"),
    elevationGainMeters: bigintField("elevationGainMeters"),
    oldestProofTimestamp: uint32(output.oldestProofTimestamp, "oldest proof timestamp"),
    newestProofTimestamp: uint32(output.newestProofTimestamp, "newest proof timestamp"),
  };
}

const duolingoEvidenceComponents = [
  { name: "identityHash", type: "bytes32" },
  { name: "proofSetHash", type: "bytes32" },
  { name: "totalXp", type: "uint64" },
  { name: "proofTimestamp", type: "uint32" },
] as const;

const stravaPolicyComponents = [
  { name: "account", type: "address" },
  { name: "giftId", type: "uint256" },
  { name: "dayIndex", type: "uint16" },
  { name: "expectedSessionId", type: "string" },
  { name: "startsAt", type: "uint64" },
  { name: "endsAt", type: "uint64" },
  { name: "minDistanceMeters", type: "uint64" },
] as const;

const stravaEvidenceComponents = [
  { name: "identityHash", type: "bytes32" },
  { name: "nullifier", type: "bytes32" },
  { name: "proofSetHash", type: "bytes32" },
  { name: "distanceMeters", type: "uint64" },
  { name: "startTime", type: "uint64" },
  { name: "movingTimeSeconds", type: "uint64" },
  { name: "elapsedTimeSeconds", type: "uint64" },
  { name: "elevationGainMeters", type: "uint64" },
  { name: "oldestProofTimestamp", type: "uint32" },
  { name: "newestProofTimestamp", type: "uint32" },
] as const;

export const duolingoVerifierAbi = [
  { type: "function", name: "LIVE_SCHEMA_CONFIRMED", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "MAX_DAY_INDEX", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint16" }] },
  { type: "function", name: "DUOLINGO_PROVIDER_ID", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "string" }] },
  { type: "function", name: "DUOLINGO_PROVIDER_VERSION", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "string" }] },
  { type: "function", name: "DUOLINGO_OWNERSHIP_REQUEST_HASH", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "string" }] },
  { type: "function", name: "DUOLINGO_XP_REQUEST_HASH", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "string" }] },
  { type: "function", name: "WITNESS", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  {
    type: "function",
    name: "validateDuolingoProofs",
    stateMutability: "view",
    inputs: [
      { name: "proofs", type: "tuple[]", components: reclaimProofComponents },
      { name: "account", type: "address" },
      { name: "giftId", type: "uint256" },
      { name: "baseline", type: "bool" },
      { name: "dayIndex", type: "uint16" },
      { name: "expectedSessionId", type: "string" },
    ],
    outputs: [{ name: "evidence", type: "tuple", components: duolingoEvidenceComponents }],
  },
] as const;

export const stravaVerifierAbi = [
  { type: "function", name: "LIVE_SCHEMA_CONFIRMED", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "MAX_DAY_INDEX", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint16" }] },
  { type: "function", name: "STRAVA_PROVIDER_ID", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "string" }] },
  { type: "function", name: "STRAVA_PROVIDER_VERSION", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "string" }] },
  { type: "function", name: "WITNESS", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "PARSER", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  {
    type: "function",
    name: "validateStravaProofs",
    stateMutability: "view",
    inputs: [
      { name: "proofs", type: "tuple[]", components: reclaimProofComponents },
      { name: "policy", type: "tuple", components: stravaPolicyComponents },
    ],
    outputs: [{ name: "evidence", type: "tuple", components: stravaEvidenceComponents }],
  },
] as const;

export const stravaParserAbi = [
  { type: "function", name: "LIVE_SCHEMA_CONFIRMED", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "SCHEMA_ID", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "bytes32" }] },
  { type: "function", name: "STRAVA_PROVIDER_ID", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "string" }] },
  { type: "function", name: "STRAVA_PROVIDER_VERSION", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "string" }] },
] as const;
