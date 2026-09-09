import { createHmac } from "node:crypto";
import { keccak256, stringToHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { DUOLINGO_PROVIDER_KEY } from "./duolingo-proof-policy";

/**
 * The EIP-712 attestations the gift escrow accepts, signed by the evidence signer after a Reclaim proof
 * has been verified server side with its TEE attestation. Ported from Lock-in's Duolingo attestation
 * module: same signing pattern, same pseudonymous identity, new types. Every value here must match
 * contracts/GiftEscrow.sol byte for byte and is pinned by a cross-language test (test/GiftTypehashParity.t.sol
 * and test/gift-attestation.test.ts): if either side drifts, its side fails.
 */

export const CHAIN_ID = 143;

export const GIFT_DOMAIN = {
  name: "Viky Gift",
  version: "1",
  chainId: CHAIN_ID,
} as const;

/** Provider-neutral check-in: the gift's goal type fixes how `metricValue` is read. */
export const CHECK_IN_TYPES = {
  CheckIn: [
    { name: "giftId", type: "uint256" },
    { name: "recipient", type: "address" },
    { name: "identityHash", type: "bytes32" },
    { name: "providerId", type: "bytes32" },
    { name: "metricValue", type: "uint64" },
    { name: "observedAt", type: "uint64" },
    { name: "nullifier", type: "bytes32" },
    { name: "issuedAt", type: "uint64" },
    { name: "expiresAt", type: "uint64" },
  ],
} as const;

export const CLAIM_TYPES = {
  Claim: [
    { name: "giftId", type: "uint256" },
    { name: "recipient", type: "address" },
    { name: "contactHash", type: "bytes32" },
    { name: "issuedAt", type: "uint64" },
    { name: "expiresAt", type: "uint64" },
  ],
} as const;

/** Signed by the recipient's own account, not by the evidence signer; defined here for the parity pin. */
export const WITHDRAW_TYPES = {
  Withdraw: [
    { name: "giftId", type: "uint256" },
    { name: "to", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint64" },
  ],
} as const;

export const CHECK_IN_TYPEHASH = keccak256(
  stringToHex(
    "CheckIn(uint256 giftId,address recipient,bytes32 identityHash,bytes32 providerId,uint64 metricValue,uint64 observedAt,bytes32 nullifier,uint64 issuedAt,uint64 expiresAt)",
  ),
);
export const CLAIM_TYPEHASH = keccak256(
  stringToHex("Claim(uint256 giftId,address recipient,bytes32 contactHash,uint64 issuedAt,uint64 expiresAt)"),
);
export const WITHDRAW_TYPEHASH = keccak256(
  stringToHex("Withdraw(uint256 giftId,address to,uint256 amount,uint256 nonce,uint64 deadline)"),
);

/** Attestations are accepted for ten minutes (the contract's MAX_ATTESTATION_AGE). */
export const ATTESTATION_TTL_SECONDS = 10 * 60;

/** Goal types of the escrow registry. A new service is a new entry, never a new contract. */
export const GOAL_TYPE_DUOLINGO_XP = 1;
export const GOAL_TYPE_GITHUB_CONTRIBUTIONS = 2;
export const GOAL_TYPE_ONCHAIN = 3;
export const GOAL_TYPE_STRAVA_DISTANCE = 4;

/** The registry's providerId for Duolingo: the verifier's PROVIDER_KEY, keccak of `<id>@<version>`. */
export const DUOLINGO_GOAL_PROVIDER_ID: Hex = DUOLINGO_PROVIDER_KEY;

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
