import { getAddress, type Abi, type Hex, type PublicClient } from "viem";
import { giftPublicClient } from "./gift-reader";
import { milestoneGiftAbi } from "./milestone-gift-abi";
import { MILESTONE_DORMANT_SECONDS, MILESTONE_LATE_PROOF_SECONDS, MILESTONE_PROOF_GRACE_SECONDS, SHAPE_CLIMB, SHAPE_HAVE_OR_NOT } from "./milestone-protocol";

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
  /** Having it or not: the person and the thing the funder signed, which a proof must carry (D45 promise 9). */
  subject: Hex;
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
  /** The contract's switch for readings, and when it was last reopened after a pause (the fourth review). */
  proofPaused: boolean;
  proofResumedAt: number;
}>;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_HASH = `0x${"0".repeat(64)}`;

export async function readMilestoneGift(contract: Hex, giftId: string, client: PublicClient = giftPublicClient()): Promise<MilestoneState> {
  const abi = milestoneGiftAbi as unknown as Abi;
  const id = BigInt(giftId);
  const [gift, earnedBalance, withdrawNonce, proofPaused, proofResumedAt] = await Promise.all([
    client.readContract({ address: contract, abi, functionName: "getGift", args: [id] }) as Promise<Record<string, unknown>>,
    client.readContract({ address: contract, abi, functionName: "earnedBalance", args: [id] }) as Promise<bigint>,
    client.readContract({ address: contract, abi, functionName: "withdrawNonces", args: [id] }) as Promise<bigint>,
    client.readContract({ address: contract, abi, functionName: "proofPaused" }) as Promise<boolean>,
    client.readContract({ address: contract, abi, functionName: "proofResumedAt" }) as Promise<bigint | number>,
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
    subject: gift.subject as Hex,
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
    proofPaused: Boolean(proofPaused),
    proofResumedAt: Number(proofResumedAt),
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
 * Whether `expire` would be accepted now, by the contract's own rules and in the contract's own order: never while
 * readings are paused. A gift nobody opened, of either shape, after the dormant delay and the grace. A gift of the
 * second shape that was opened, once what was granted in time can no longer be shown: the deadline and the late
 * window. That one comes before the question of a first reading, because the second shape never has one: asked in the
 * other order, the keeper would send an `expire` the contract refuses as too early, every day. Then a climb under way,
 * once its deadline and the grace have passed; and a climb opened and never started, from the claim. A window a pause
 * ran across is counted from the pause's end, as the contract counts it (`_afterPauses`), so the keeper never takes
 * back what a reading taken in time can still reach.
 *
 * Until 1 Oct 2026 this answered no for every gift that was not a climb, so a certificate, a university gift, an exam,
 * a race or a competition never came back to its funder, while its screens said it would (the audit of that day).
 */
export function canExpire(
  gift: Pick<MilestoneState, "cancelled" | "settled" | "recipient" | "identityHash" | "fundedAt" | "claimedAt" | "deadline" | "shape" | "proofPaused" | "proofResumedAt">,
  nowSeconds: number,
): boolean {
  if (gift.proofPaused || gift.cancelled || gift.settled) return false;
  const afterPauses = (moment: number) => Math.max(moment, gift.proofResumedAt);
  if (gift.recipient === null) return nowSeconds >= gift.fundedAt + MILESTONE_DORMANT_SECONDS + MILESTONE_PROOF_GRACE_SECONDS;
  if (gift.shape === SHAPE_HAVE_OR_NOT) return nowSeconds > afterPauses(gift.deadline) + MILESTONE_LATE_PROOF_SECONDS;
  if (gift.identityHash !== ZERO_HASH) return nowSeconds > afterPauses(gift.deadline) + MILESTONE_PROOF_GRACE_SECONDS;
  return nowSeconds >= afterPauses(gift.claimedAt + MILESTONE_DORMANT_SECONDS) + MILESTONE_PROOF_GRACE_SECONDS;
}
