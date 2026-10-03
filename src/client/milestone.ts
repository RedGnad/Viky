import { getAddress, type Hex, type LocalAccount } from "viem";
import { receiveAuthorizationMessage, receiveAuthorizationTypedData, toContractAuthorization } from "../ausd-authorization";
import { NO_CONTACT_HASH } from "../contact-hash";
import type { MilestoneCondition } from "../milestone-conditions";
import type { MilestoneStatus } from "../milestone-view";
import { milestoneFundingNonce, SHAPE_CLIMB, ZERO_SUBJECT, type MilestoneParams } from "../milestone-protocol";
import { startingCeiling } from "../milestone-terms";
import { getJson, postJson } from "./api";
import { randomSalt, type CreatedGift } from "./gift";
import { giftSalt } from "../gift-terms";
import { milestoneFundingNonceV2 } from "../v2-protocol";
import { linkForTerms, secondVersionOf, withTheStartSigned, type StartAsked, type StartStep } from "./v2";

/** Browser-side steps of a milestone gift (C2). Every step that moves money is signed by the person's own account. */

export function milestoneAddressFromEnv(): Hex {
  const value = process.env.NEXT_PUBLIC_MILESTONE_GIFT_ADDRESS?.trim();
  if (!value || !/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error("The milestone contract is not configured");
  return getAddress(value);
}

export type Standing = Readonly<{ username: string; mode: string; rating: number; rd: number | null; best: number | null; settled: boolean; readAt: string }>;

/** Where a person stands today in one cadence, read plainly by Viky's route before any money moves. */
export function readStanding(path: string, username: string, cadence: string): Promise<Standing> {
  return getJson(`${path}?username=${encodeURIComponent(username)}&mode=${encodeURIComponent(cadence)}`);
}

/** The ids of the conditions this viewer may offer: the live ones, and for an account that runs Viky, the wired ones. */
export function loadOfferedConditions(): Promise<{ ids: string[]; preview: string[] }> {
  return getJson("/api/conditions");
}

/** The request a funder's page signs once and sends as it is on every retry (D87). */
export type MilestoneGiftRequest = Readonly<{
  conditionId: string;
  username: string;
  cadence: string;
  target: number;
  standing: number;
  standingReadAt: string;
  durationDays: number;
  amount: string;
  refundTo: string;
  salt: Hex;
  /** The random half of the salt; the rest is the account, so the server rebuilds it or refuses (D102). */
  saltSeed: Hex;
  /** The second version: the address of the key that opens the gift, and the fingerprint of its link. Never its secret. */
  openingKey?: Hex;
  linkFingerprint?: string;
  recipientName?: string;
  funderName?: string;
  authorization: { validAfter: string; validBefore: string; nonce: Hex; v: number; r: Hex; s: Hex };
}>;

/**
 * One passkey signature: the EIP-3009 authorization whose nonce is the hash of these exact terms, the target and the
 * highest start included. The server rebuilds both from the same inputs and refuses anything else.
 */
export async function prepareMilestoneGift(input: {
  account: LocalAccount;
  milestone: MilestoneCondition;
  cadenceGoalType: number;
  cadence: string;
  username: string;
  standing: number;
  standingReadAt: string;
  target: number;
  durationDays: number;
  amount: bigint;
  recipientName?: string;
  funderName?: string;
}): Promise<MilestoneGiftRequest> {
  const second = secondVersionOf("milestone");
  const contract = second ?? milestoneAddressFromEnv();
  const funder = getAddress(input.account.address);
  const saltSeed = randomSalt();
  const params: MilestoneParams = {
    funder,
    refundTo: funder,
    recipientContactHash: NO_CONTACT_HASH,
    goalType: input.cadenceGoalType,
    shape: SHAPE_CLIMB,
    target: BigInt(input.target),
    maximumStart: BigInt(startingCeiling(input.milestone.shape, input.target)),
    subject: ZERO_SUBJECT,
    durationDays: input.durationDays,
    amount: input.amount,
    // The salt carries the account into what the funder signs (D102); the cadence is already in the goal type.
    salt: giftSalt({ account: input.username, seed: saltSeed }),
  };
  // Once the second version is set, the terms carry the key that opens the gift, made here (src/client/v2.ts).
  const link = second ? await linkForTerms(input.account, params.salt) : null;
  const { recipientContactHash: _contact, ...shared } = params;
  void _contact;
  const nonce = link ? milestoneFundingNonceV2({ ...shared, openingKey: link.openingKey }) : milestoneFundingNonce(params);
  const message = receiveAuthorizationMessage({ funder, escrow: contract, amount: input.amount, nonce });
  const signature = await input.account.signTypedData(receiveAuthorizationTypedData(message));
  const authorization = toContractAuthorization(message, signature);
  return {
    ...(link ?? {}),
    conditionId: input.milestone.condition.id,
    username: input.username,
    cadence: input.cadence,
    target: input.target,
    standing: input.standing,
    standingReadAt: input.standingReadAt,
    durationDays: input.durationDays,
    amount: input.amount.toString(),
    refundTo: funder,
    salt: params.salt,
    saltSeed,
    recipientName: input.recipientName,
    funderName: input.funderName,
    authorization: {
      validAfter: authorization.validAfter.toString(),
      validBefore: authorization.validBefore.toString(),
      nonce: authorization.nonce,
      v: authorization.v,
      r: authorization.r,
      s: authorization.s,
    },
  };
}

export function submitMilestoneGift(request: MilestoneGiftRequest): Promise<CreatedGift> {
  return postJson<CreatedGift>("/api/gift/milestone/create", request);
}

/** What a reading did, as src/milestone-reading.ts types it. */
export type MilestoneOutcome =
  | { kind: "started"; giftId: string; rating: number; hash: string; aboveAccepted: boolean; deadline: number }
  | { kind: "reached"; giftId: string; rating: number; hash: string }
  | { kind: "notYet"; giftId: string; rating: number; target: number; attested: boolean }
  | { kind: "already"; giftId: string; reason: string }
  | { kind: "refused"; giftId: string; code: string; message: string; rating?: number };

export function loadMilestoneStatus(giftId: string, linkKey?: string | null): Promise<MilestoneStatus> {
  return getJson<MilestoneStatus>(`/api/gift/${giftId}${linkKey ? `?t=${encodeURIComponent(linkKey)}` : ""}`);
}

/** A fresh code for the name the funder gave, sent only to the recipient signed in. */
export function requestMilestoneCode(giftId: string): Promise<{ giftId: string; username: string; code: string; expiresAt: string }> {
  return postJson(`/api/gift/${giftId}/account`, {});
}

/**
 * The first reading: the code in the name, and where they start. On the second version the recipient's account signs
 * it too, which `signer` gives when asked (src/client/v2.ts).
 */
export async function startMilestone(giftId: string, signer: () => Promise<LocalAccount>, onStep?: (step: StartStep) => void): Promise<MilestoneOutcome> {
  onStep?.("reading");
  return withTheStartSigned<MilestoneOutcome>(giftId, await postJson<MilestoneOutcome | StartAsked>(`/api/gift/${giftId}/bind`, {}), signer, onStep);
}

/** A reading on demand. */
export function checkMilestone(giftId: string): Promise<MilestoneOutcome> {
  return postJson(`/api/gift/${giftId}/count`, {});
}
