import { encodeAbiParameters, keccak256, parseAbiParameters, stringToHex, type Hex } from "viem";
import { DUOLINGO_PUBLIC_PROVIDER_ID } from "./duolingo-public-terms";
import { DUOLINGO_PROVIDER_KEY } from "./duolingo-proof-policy";

/**
 * The browser-safe half of the gift protocol: the EIP-712 types and typehashes, the goal registry
 * constants and the funding nonce derived from the terms. No secrets, no Node modules, so the funder's
 * screen can compute exactly what the contract will check. The signing half lives in
 * gift-attestation.ts (server only).
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

/** Signed by the recipient's own account, not by the evidence signer. */
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
/** One Duolingo course rather than the experience total (U1): registered on the escrow on 18 Sep 2026. */
export const GOAL_TYPE_DUOLINGO_COURSE_XP = 5;

/**
 * The registry's providerId for Duolingo. Since D27 it is the public mode (an attested read of the
 * public profile); the session-proof id below is kept for the verifier-app path, which the registry
 * no longer accepts for Duolingo.
 */
export const DUOLINGO_GOAL_PROVIDER_ID: Hex = DUOLINGO_PUBLIC_PROVIDER_ID;
export const DUOLINGO_SESSION_PROVIDER_ID: Hex = DUOLINGO_PROVIDER_KEY;

/** The funder's EIP-3009 nonce is derived from the gift terms: one signature pays and consents (D12). */
export const FUND_NONCE_TAG = keccak256(stringToHex("viky.fund.v1"));

export type GiftParams = {
  funder: Hex;
  refundTo: Hex;
  recipientContactHash: Hex;
  goalType: number;
  dailyTarget: number;
  durationDays: number;
  amount: bigint;
  /** Random per gift, so identical terms still get distinct funding nonces (D19). */
  salt: Hex;
};

/**
 * The salt of a gift, which is what makes the funder's one signature commit to the account the gift will be read on
 * and, for a daily gift, to the course a day is counted in.
 *
 * Before this, both lived only in Viky's own record: the terms signed carried a goal type, a target and a random
 * salt, so between the signature and the first reading nothing but our database said which account was meant. The
 * contract pins the identity at that first reading and refuses any other afterwards, which left exactly that window
 * open. The salt closes it without touching the contract: it is already inside the hashed terms, so a salt derived
 * from the account and the course makes the signature itself say them.
 *
 * It keeps the job it already had (D19: two identical gifts need distinct nonces) because the seed is random and
 * carried with the request, so the server recomputes the same salt byte for byte, or refuses the creation.
 */
export const GIFT_SALT_TAG = keccak256(stringToHex("viky.gift.salt.v1"));

export function giftSalt(input: { account?: string | null; course?: string | null; seed: Hex }): Hex {
  return keccak256(
    encodeAbiParameters(parseAbiParameters("bytes32, string, string, bytes32"), [
      GIFT_SALT_TAG,
      (input.account ?? "").trim().toLowerCase(),
      (input.course ?? "").trim(),
      input.seed,
    ]),
  );
}

/** `GiftEscrow.hashGiftParams`, byte for byte. */
export function hashGiftParams(p: GiftParams): Hex {
  return keccak256(
    encodeAbiParameters(parseAbiParameters("address, address, bytes32, uint8, uint32, uint32, uint256, bytes32"), [
      p.funder,
      p.refundTo,
      p.recipientContactHash,
      p.goalType,
      p.dailyTarget,
      p.durationDays,
      p.amount,
      p.salt,
    ]),
  );
}

/** `GiftEscrow.fundingNonce`, the nonce the funder signs in `ReceiveWithAuthorization`. */
export function fundingNonce(p: GiftParams): Hex {
  return keccak256(encodeAbiParameters(parseAbiParameters("bytes32, bytes32"), [FUND_NONCE_TAG, hashGiftParams(p)]));
}

export type WithdrawIntentMessage = {
  giftId: bigint;
  to: Hex;
  amount: bigint;
  nonce: bigint;
  deadline: bigint;
};

/** The typed-data request the recipient's account signs to take what is theirs through the relayer. */
export function withdrawIntentTypedData(escrow: Hex, message: WithdrawIntentMessage) {
  return {
    domain: { ...GIFT_DOMAIN, verifyingContract: escrow },
    types: WITHDRAW_TYPES,
    primaryType: "Withdraw" as const,
    message,
  };
}
