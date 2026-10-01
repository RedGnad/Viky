import { encodeAbiParameters, keccak256, parseAbiParameters, stringToHex, type Hex } from "viem";
import { CHAIN_ID } from "./gift-terms";

/**
 * The browser-safe half of the milestone protocol: what `contracts/MilestoneGift.sol` checks, written once in
 * TypeScript so the funder's screen signs exactly the terms the contract will hash, and the evidence signer signs
 * exactly the structs it will recover. No secrets and no Node modules. Every value is pinned against the contract by
 * `test/MilestoneTypehashParity.t.sol` and `test/milestone-protocol.test.ts`: if either side drifts, its side fails.
 *
 * The milestone contract is a sibling of the daily one, not a mode of it (D36). What differs is on purpose: its own
 * EIP-712 name, its own funding tag, its own proof struct, and gift numbers that start at one million so an id can
 * never mean two gifts across the two contracts (D44).
 */

export const MILESTONE_DOMAIN = {
  name: "Viky Milestone",
  version: "1",
  chainId: CHAIN_ID,
} as const;

/** `MilestoneGift.FIRST_ID_FLOOR`: every milestone gift is numbered from here up, and no daily gift ever is. */
export const MILESTONE_FIRST_ID = 1_000_000n;

/** Whether a gift number belongs to the milestone contract. The contract's constructor makes this a fact, not a guess. */
export function isMilestoneGiftId(giftId: string | bigint): boolean {
  try {
    return BigInt(giftId) >= MILESTONE_FIRST_ID;
  } catch {
    return false;
  }
}

/** Something measured that moves: the first reading is the start, and the climb is what pays. */
export const SHAPE_CLIMB = 0;
/** Something granted once, with a date. */
export const SHAPE_HAVE_OR_NOT = 1;

/** The floor is the contract's own, mirrored so a screen refuses what the contract would. The ceiling below is not. */
export const MILESTONE_MIN_AMOUNT = 1_000_000n;
/**
 * The pilot's ceiling, a thousand dollars (mitigation b, 19 Sep 2026), held here rather than on chain: the contract's
 * own `MAX_AMOUNT` stays at one hundred thousand and it is not redeployed. Raising this line raises the product's
 * bound; the contract's is the one nobody can move.
 */
export const MILESTONE_MAX_AMOUNT = 1_000_000_000n;
export const MILESTONE_MIN_DURATION_DAYS = 1;
export const MILESTONE_MAX_DURATION_DAYS = 365;
/** `MAX_ATTESTATION_AGE`: an attestation lives ten minutes, and the first reading of a climb may be no older. */
export const MILESTONE_ATTESTATION_TTL_SECONDS = 10 * 60;
/** `PROOF_GRACE`: a reading taken before the deadline may still land this long after it. */
export const MILESTONE_PROOF_GRACE_SECONDS = 6 * 60 * 60;
/** `DORMANT_REFUND_DELAY`: a gift nobody opens, or opens and never starts, comes back after this. */
export const MILESTONE_DORMANT_SECONDS = 14 * 86_400;
/**
 * `LATE_PROOF_WINDOW`: something granted before the deadline may still be shown this long after it. Only then can a
 * gift of the second shape, opened and never proved, go back to its funder.
 */
export const MILESTONE_LATE_PROOF_SECONDS = 14 * 86_400;

export const MILESTONE_CLAIM_TYPES = {
  Claim: [
    { name: "giftId", type: "uint256" },
    { name: "recipient", type: "address" },
    { name: "contactHash", type: "bytes32" },
    { name: "issuedAt", type: "uint64" },
    { name: "expiresAt", type: "uint64" },
  ],
} as const;

/** Provider neutral: the goal type fixes how `metricValue` reads, and for a climb `eventAt` is always zero. */
export const MILESTONE_PROOF_TYPES = {
  Proof: [
    { name: "giftId", type: "uint256" },
    { name: "recipient", type: "address" },
    { name: "identityHash", type: "bytes32" },
    { name: "providerId", type: "bytes32" },
    { name: "metricValue", type: "uint64" },
    { name: "eventAt", type: "uint64" },
    { name: "observedAt", type: "uint64" },
    { name: "nullifier", type: "bytes32" },
    { name: "issuedAt", type: "uint64" },
    { name: "expiresAt", type: "uint64" },
  ],
} as const;

/** Signed by the recipient's own account, never by the evidence signer. */
export const MILESTONE_WITHDRAW_TYPES = {
  Withdraw: [
    { name: "giftId", type: "uint256" },
    { name: "to", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint64" },
  ],
} as const;

export const MILESTONE_CLAIM_TYPEHASH = keccak256(
  stringToHex("Claim(uint256 giftId,address recipient,bytes32 contactHash,uint64 issuedAt,uint64 expiresAt)"),
);
export const MILESTONE_PROOF_TYPEHASH = keccak256(
  stringToHex(
    "Proof(uint256 giftId,address recipient,bytes32 identityHash,bytes32 providerId,uint64 metricValue,uint64 eventAt,uint64 observedAt,bytes32 nullifier,uint64 issuedAt,uint64 expiresAt)",
  ),
);
export const MILESTONE_WITHDRAW_TYPEHASH = keccak256(
  stringToHex("Withdraw(uint256 giftId,address to,uint256 amount,uint256 nonce,uint64 deadline)"),
);

/** Distinct from the daily contract's tag, so one contract's funding signature can never fund the other's gift. */
export const MILESTONE_FUND_NONCE_TAG = keccak256(stringToHex("viky.milestone.fund.v1"));

export type MilestoneParams = {
  funder: Hex;
  refundTo: Hex;
  recipientContactHash: Hex;
  goalType: number;
  shape: number;
  target: bigint;
  /** A climb only: the highest starting point the funder pays a climb from. Zero for the other shape. */
  maximumStart: bigint;
  /** Having it or not only: the person and the thing, hashed. Zero for a climb. */
  subject: Hex;
  durationDays: number;
  amount: bigint;
  salt: Hex;
};

export const ZERO_SUBJECT: Hex = `0x${"0".repeat(64)}`;

/** `MilestoneGift.hashParams`, byte for byte. */
export function hashMilestoneParams(p: MilestoneParams): Hex {
  return keccak256(
    encodeAbiParameters(parseAbiParameters("address, address, bytes32, uint8, uint8, uint64, uint64, bytes32, uint32, uint256, bytes32"), [
      p.funder,
      p.refundTo,
      p.recipientContactHash,
      p.goalType,
      p.shape,
      p.target,
      p.maximumStart,
      p.subject,
      p.durationDays,
      p.amount,
      p.salt,
    ]),
  );
}

/** `MilestoneGift.fundingNonce`: the nonce the funder's `ReceiveWithAuthorization` carries. */
export function milestoneFundingNonce(p: MilestoneParams): Hex {
  return keccak256(encodeAbiParameters(parseAbiParameters("bytes32, bytes32"), [MILESTONE_FUND_NONCE_TAG, hashMilestoneParams(p)]));
}

export type MilestoneProofMessage = {
  giftId: bigint;
  recipient: Hex;
  identityHash: Hex;
  providerId: Hex;
  metricValue: bigint;
  eventAt: bigint;
  observedAt: bigint;
  nullifier: Hex;
  issuedAt: bigint;
  expiresAt: bigint;
};

export type MilestoneClaimMessage = {
  giftId: bigint;
  recipient: Hex;
  contactHash: Hex;
  issuedAt: bigint;
  expiresAt: bigint;
};

/** The typed data the recipient's account signs to take what is theirs from a milestone gift, through the relayer. */
export function milestoneWithdrawTypedData(contract: Hex, message: { giftId: bigint; to: Hex; amount: bigint; nonce: bigint; deadline: bigint }) {
  return {
    domain: { ...MILESTONE_DOMAIN, verifyingContract: contract },
    types: MILESTONE_WITHDRAW_TYPES,
    primaryType: "Withdraw" as const,
    message,
  };
}
