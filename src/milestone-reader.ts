import { getAddress, type Hex, type PublicClient } from "viem";
import { NO_CONTACT_HASH } from "./contact-hash";
import { giftPublicClient } from "./gift-reader";
import { milestoneAbiOf, milestoneVersionOf, type ContractVersion } from "./v2";
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
  /**
   * Whether readings are paused, and the moment every window a pause could have shut is counted from: when readings
   * were last reopened on the first version (the fourth review), the end of the last pause on the second, which is
   * still ahead while one runs.
   */
  proofPaused: boolean;
  proofResumedAt: number;
  /** Which version of the milestone contract holds the gift (src/v2.ts). What follows exists on the second only. */
  version: ContractVersion;
  openingKey: Hex | null;
  /** When the person it is for ended it, or zero: on the first version nobody can. */
  endedAt: number;
}>;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_HASH = `0x${"0".repeat(64)}`;

export async function readMilestoneGift(contract: Hex, giftId: string, client: PublicClient = giftPublicClient()): Promise<MilestoneState> {
  const abi = milestoneAbiOf(contract);
  const version = milestoneVersionOf(contract);
  const id = BigInt(giftId);
  const [gift, earnedBalance, withdrawNonce, proofPaused, proofResumedAt] = await Promise.all([
    client.readContract({ address: contract, abi, functionName: "getGift", args: [id] }) as Promise<Record<string, unknown>>,
    client.readContract({ address: contract, abi, functionName: "earnedBalance", args: [id] }) as Promise<bigint>,
    client.readContract({ address: contract, abi, functionName: "withdrawNonces", args: [id] }) as Promise<bigint>,
    client.readContract({ address: contract, abi, functionName: "proofPaused" }) as Promise<boolean>,
    // The same question under each version's own name: where the windows a pause ran across are counted from.
    client.readContract({ address: contract, abi, functionName: version === 2 ? "proofPausedUntil" : "proofResumedAt" }) as Promise<bigint | number>,
  ]);
  const recipient = getAddress(String(gift.recipient));
  return {
    giftId,
    funder: gift.funder as Hex,
    refundTo: gift.refundTo as Hex,
    recipient: recipient === ZERO_ADDRESS ? null : recipient,
    recipientContactHash: version === 2 ? NO_CONTACT_HASH : (gift.recipientContactHash as Hex),
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
    version,
    openingKey: version === 2 ? (gift.openingKey as Hex) : null,
    endedAt: version === 2 ? Number(gift.endedAt) : 0,
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
  gift: Pick<MilestoneState, "cancelled" | "settled" | "recipient" | "identityHash" | "fundedAt" | "claimedAt" | "deadline" | "shape" | "proofPaused" | "proofResumedAt"> &
    Partial<Pick<MilestoneState, "version">>,
  nowSeconds: number,
): boolean {
  // On the second version no switch refuses `expire` under a pause: its windows do, each counted from the pause's end,
  // which is ahead while it runs. The answer is the same no.
  if (gift.proofPaused || gift.cancelled || gift.settled) return false;
  const afterPauses = (moment: number) => Math.max(moment, gift.proofResumedAt);
  // A gift nobody opened: the second version counts its wait past a pause too, since a pause shuts the opening there.
  if (gift.recipient === null) {
    const waited = gift.fundedAt + MILESTONE_DORMANT_SECONDS;
    return nowSeconds >= (gift.version === 2 ? afterPauses(waited) : waited) + MILESTONE_PROOF_GRACE_SECONDS;
  }
  if (gift.shape === SHAPE_HAVE_OR_NOT) return nowSeconds > afterPauses(gift.deadline) + MILESTONE_LATE_PROOF_SECONDS;
  if (gift.identityHash !== ZERO_HASH) return nowSeconds > afterPauses(gift.deadline) + MILESTONE_PROOF_GRACE_SECONDS;
  return nowSeconds >= afterPauses(gift.claimedAt + MILESTONE_DORMANT_SECONDS) + MILESTONE_PROOF_GRACE_SECONDS;
}
