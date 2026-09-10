import { createHmac } from "node:crypto";
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ATTESTATION_TTL_SECONDS, CHECK_IN_TYPES, CLAIM_TYPES, GIFT_DOMAIN } from "./gift-terms";

export * from "./gift-terms";

/**
 * The EIP-712 attestations the gift escrow accepts, signed by the evidence signer after a Reclaim proof
 * has been verified server side with its TEE attestation. Ported from Lock-in's Duolingo attestation
 * module: same signing pattern, same pseudonymous identity, new types. Every value here must match
 * contracts/GiftEscrow.sol byte for byte and is pinned by a cross-language test (test/GiftTypehashParity.t.sol
 * and test/gift-attestation.test.ts): if either side drifts, its side fails. Server only: it reads keys.
 */

/**
 * The pseudonymous identity bound to a gift: HMAC of the provider's profile id under a server-held
 * key. Never the raw id, and never a bare keccak of an enumerable id.
 */
export function identityPseudonym(providerLabel: string, profileId: string): Hex {
  const key = process.env.IDENTITY_HMAC_KEY?.trim();
  if (!key) throw new Error("IDENTITY_HMAC_KEY is not configured");
  const digest = createHmac("sha256", Buffer.from(key, "base64"))
    .update(`viky:identity:v1:${providerLabel}:${profileId}`)
    .digest("hex");
  return `0x${digest}`;
}

function evidenceSignerKey(): Hex {
  const key = process.env.EVIDENCE_SIGNER_PRIVATE_KEY?.trim();
  if (!key) throw new Error("EVIDENCE_SIGNER_PRIVATE_KEY is not configured");
  return (key.startsWith("0x") ? key : `0x${key}`) as Hex;
}

export type CheckInMessage = {
  giftId: bigint;
  recipient: Hex;
  identityHash: Hex;
  providerId: Hex;
  metricValue: bigint;
  observedAt: bigint;
  nullifier: Hex;
  issuedAt: bigint;
  expiresAt: bigint;
};

export type ClaimMessage = {
  giftId: bigint;
  recipient: Hex;
  contactHash: Hex;
  issuedAt: bigint;
  expiresAt: bigint;
};

export async function signCheckIn(message: CheckInMessage, verifyingContract: Hex): Promise<Hex> {
  return privateKeyToAccount(evidenceSignerKey()).signTypedData({
    domain: { ...GIFT_DOMAIN, verifyingContract },
    types: CHECK_IN_TYPES,
    primaryType: "CheckIn",
    message,
  });
}

export async function signClaim(message: ClaimMessage, verifyingContract: Hex): Promise<Hex> {
  return privateKeyToAccount(evidenceSignerKey()).signTypedData({
    domain: { ...GIFT_DOMAIN, verifyingContract },
    types: CLAIM_TYPES,
    primaryType: "Claim",
    message,
  });
}

export function evidenceSignerAddress(): Hex {
  return privateKeyToAccount(evidenceSignerKey()).address;
}

/** JSON-safe form of a message, for storage next to its signature. */
export function serialiseMessage(message: CheckInMessage | ClaimMessage): Record<string, string | number> {
  return Object.fromEntries(
    Object.entries(message).map(([key, value]) => [key, typeof value === "bigint" ? value.toString() : value]),
  ) as Record<string, string | number>;
}

export { ATTESTATION_TTL_SECONDS };
