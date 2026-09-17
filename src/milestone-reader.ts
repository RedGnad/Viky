import { getAddress, type Abi, type Hex, type PublicClient } from "viem";
import { giftPublicClient } from "./gift-reader";
import { milestoneGiftAbi } from "./milestone-gift-abi";
import { MILESTONE_DORMANT_SECONDS, MILESTONE_PROOF_GRACE_SECONDS, SHAPE_CLIMB } from "./milestone-protocol";

/**
 * A milestone gift as `MilestoneGift` holds it, and what state that is in words a screen and the keeper can act on.
 * Numbers stay raw; screens format them. The state logic is pure and mirrors the contract's own checks, so the keeper
 * never asks the chain for something it already knows the chain will refuse, and a test pins each branch.
 */

export type MilestoneState = Readonly<{
  giftId: string;
  funder: Hex;
  refundTo: Hex;
  recipient: Hex | null;
  recipientContactHash: Hex;
  goalType: number;
  shape: number;
  target: bigint;
  maximumStart: bigint;
  durationDays: number;
  amount: bigint;
  earned: bigint;
  withdrawnByRecipient: bigint;
  refundable: bigint;
  refundedToFunder: bigint;
  identityHash: Hex;
  startingValue: bigint;
  lastProofAt: number;
  /** Zero until the first reading starts a climb's clock. */
  deadline: number;
  fundedAt: number;
  claimedAt: number;
  cancelled: boolean;
  settled: boolean;
  earnedBalance: bigint;
  withdrawNonce: bigint;
}>;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_HASH = `0x${"0".repeat(64)}`;

export async function readMilestoneGift(contract: Hex, giftId: string, client: PublicClient = giftPublicClient()): Promise<MilestoneState> {
  const abi = milestoneGiftAbi as unknown as Abi;
  const id = BigInt(giftId);
  const [gift, earnedBalance, withdrawNonce] = await Promise.all([
    client.readContract({ address: contract, abi, functionName: "getGift", args: [id] }) as Promise<Record<string, unknown>>,
    client.readContract({ address: contract, abi, functionName: "earnedBalance", args: [id] }) as Promise<bigint>,
    client.readContract({ address: contract, abi, functionName: "withdrawNonces", args: [id] }) as Promise<bigint>,
  ]);
  const recipient = getAddress(String(gift.recipient));
  return {
    giftId,
    funder: gift.funder as Hex,
    refundTo: gift.refundTo as Hex,
    recipient: recipient === ZERO_ADDRESS ? null : recipient,
    recipientContactHash: gift.recipientContactHash as Hex,
    goalType: Number(gift.goalType),
    shape: Number(gift.shape),
    target: BigInt(gift.target as bigint),
    maximumStart: BigInt(gift.maximumStart as bigint),
    durationDays: Number(gift.durationDays),
    amount: gift.amount as bigint,
    earned: gift.earned as bigint,
    withdrawnByRecipient: gift.withdrawnByRecipient as bigint,
    refundable: gift.refundable as bigint,
    refundedToFunder: gift.refundedToFunder as bigint,
    identityHash: gift.identityHash as Hex,
    startingValue: BigInt(gift.startingValue as bigint),
    lastProofAt: Number(gift.lastProofAt),
    deadline: Number(gift.deadline),
    fundedAt: Number(gift.fundedAt),
    claimedAt: Number(gift.claimedAt),
    cancelled: Boolean(gift.cancelled),
    settled: Boolean(gift.settled),
    earnedBalance,
    withdrawNonce,
  };
}

export type MilestonePhase =
  /** Taken back by the funder before anybody opened it. */
  | "cancelled"
  /** The target was reached: the whole amount is the recipient's. */
  | "reached"
  /** The deadline passed, or nobody started it in time: the whole amount went, or is going, back. */
  | "returned"
  /** Nobody has opened the link yet. */
  | "unopened"
  /** Opened, and no first reading yet, so the clock has not started. */
  | "opened"
  /** Started from above the highest start the funder accepted: it can no longer pay, and comes back at the deadline. */
  | "startTooHigh"
  /** Started, the deadline has passed, and the contract has not closed it yet. */
  | "overdue"
  | "climbing";

type PhaseInput = Pick<
  MilestoneState,
  "cancelled" | "settled" | "earned" | "recipient" | "identityHash" | "startingValue" | "maximumStart" | "deadline" | "shape"
>;

export function milestonePhase(gift: PhaseInput, nowSeconds: number): MilestonePhase {
  if (gift.cancelled) return "cancelled";
  if (gift.settled) return gift.earned > 0n ? "reached" : "returned";
  if (gift.recipient === null) return "unopened";
  if (gift.shape === SHAPE_CLIMB && gift.identityHash === ZERO_HASH) return "opened";
  if (gift.shape === SHAPE_CLIMB && gift.startingValue > gift.maximumStart) return "startTooHigh";
  if (gift.deadline > 0 && nowSeconds > gift.deadline) return "overdue";
  return "climbing";
}

/** Whether a reading taken now could still settle this gift: started, from an accepted start, before its deadline. */
export function canStillReach(gift: PhaseInput, nowSeconds: number): boolean {
  return milestonePhase(gift, nowSeconds) === "climbing";
}

/**
 * Whether `expire` would be accepted now, for a climb, by the contract's own rules: a gift nobody opened after the
 * dormant delay and the grace, a gift opened and never started likewise from the claim, a started one once its
 * deadline and the grace have passed. Never while a reading taken in time could still arrive.
 */
export function canExpire(gift: Pick<MilestoneState, "cancelled" | "settled" | "recipient" | "identityHash" | "fundedAt" | "claimedAt" | "deadline" | "shape">, nowSeconds: number): boolean {
  if (gift.cancelled || gift.settled || gift.shape !== SHAPE_CLIMB) return false;
  if (gift.recipient === null) return nowSeconds >= gift.fundedAt + MILESTONE_DORMANT_SECONDS + MILESTONE_PROOF_GRACE_SECONDS;
  if (gift.identityHash === ZERO_HASH) return nowSeconds >= gift.claimedAt + MILESTONE_DORMANT_SECONDS + MILESTONE_PROOF_GRACE_SECONDS;
  return nowSeconds > gift.deadline + MILESTONE_PROOF_GRACE_SECONDS;
}
