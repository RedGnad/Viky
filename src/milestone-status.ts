import type { Hex } from "viem";
import { formatAusd } from "./gift-reader";
import type { GiftRecord } from "./gift-store";
import { cadenceOfGoal, certificateById, certificateOfGoal, CHESS_MILESTONE, milestoneById } from "./milestone-conditions";
import { milestonePhase, readMilestoneGift, type MilestoneState } from "./milestone-reader";
import { SHAPE_HAVE_OR_NOT } from "./milestone-protocol";
import { attestedReadings, lastReading, latestRating, loadMilestoneGift, type MilestoneRecord, type MilestoneReading } from "./milestone-store";
import type { MilestoneStatus } from "./milestone-view";
import { escrowOf } from "./relayer";

/**
 * A milestone gift as its page and its card read it (src/milestone-view.ts), from the contract, the gift's record and
 * the readings. Server only. The contract is the authority for every number that is money or a state; the record adds
 * the names and the account's name; the readings are ours, and each says when it was taken.
 */

export type Viewer = Readonly<{ isRecipient: boolean; isFunder: boolean; holdsTheLink: boolean }>;

export function milestoneStatusOf(input: {
  record: GiftRecord;
  milestone: MilestoneRecord | null;
  state: MilestoneState;
  contract: Hex;
  latest: MilestoneReading | null;
  last: MilestoneReading | null;
  reachedAt: number | null;
  viewer: Viewer;
  nowSeconds: number;
}): MilestoneStatus {
  const { record, state, viewer } = input;
  const conditionId = input.milestone?.conditionId ?? "";
  // A certificate gift has no cadence and no standing: its words come from its own half of the register (U3).
  const certificate = certificateById(conditionId) ?? certificateOfGoal(state.goalType);
  const condition = milestoneById(conditionId) ?? (certificate ? undefined : CHESS_MILESTONE);
  const cadence = condition ? cadenceOfGoal(condition, state.goalType) : undefined;
  const started = state.deadline > 0;
  const reached = state.settled && state.earned > 0n;
  return {
    kind: "milestone",
    shape: state.shape === SHAPE_HAVE_OR_NOT ? "certificate" : "climb",
    giftId: record.giftId,
    conditionId: (condition ?? certificate)?.condition.id ?? conditionId,
    youAreTheRecipient: viewer.isRecipient,
    youAreTheFunder: viewer.isFunder,
    names: viewer.isRecipient || viewer.isFunder || viewer.holdsTheLink ? { recipientName: record.recipientName, funderName: record.funderName } : null,
    goalAccount: {
      username: record.goalUsername,
      bound: record.boundAt !== null,
      code: viewer.isRecipient ? record.bindingCode : null,
      codeExpiresAt: viewer.isRecipient ? (record.bindingCodeExpiresAt?.toISOString() ?? null) : null,
      namedByFunder: record.usernameSource !== "recipient",
    },
    amount: state.amount.toString(),
    amountDisplay: formatAusd(state.amount),
    startReading: started ? Number(state.startingValue) : null,
    target: Number(state.target),
    todayReading: input.latest?.rating ?? null,
    readAtMs: input.latest ? input.latest.observedAt * 1_000 : null,
    deadlineMs: started ? state.deadline * 1_000 : null,
    durationDays: state.durationDays,
    opened: state.recipient !== null,
    connected: started,
    reached,
    reachedAtMs: reached && input.reachedAt !== null ? input.reachedAt * 1_000 : null,
    finished: state.settled || state.cancelled,
    cancelled: state.cancelled,
    earned: state.earnedBalance.toString(),
    earnedDisplay: formatAusd(state.earnedBalance),
    takenDisplay: formatAusd(state.withdrawnByRecipient),
    returnedDisplay: formatAusd(state.refundedToFunder),
    createdAtChain: state.fundedAt,
    claimedAtChain: state.claimedAt,
    withdrawNonce: state.withdrawNonce.toString(),
    escrow: input.contract,
    phase: milestonePhase(state, input.nowSeconds),
    cadence: { id: cadence?.id ?? "", label: cadence?.label ?? "" },
    accountClosed: input.last?.outcome === "refused:ACCOUNT_CLOSED",
    maximumStart: Number(state.maximumStart),
    standingAtOffer: input.milestone?.standingAtOffer ?? null,
  };
}

/** Everything a milestone gift's page and card need, read live, for one viewer. */
export async function loadMilestoneStatus(record: GiftRecord, viewer: Viewer): Promise<{ status: MilestoneStatus; state: MilestoneState; contract: Hex }> {
  const contract = escrowOf(record);
  const [state, milestone, latest, last, proven] = await Promise.all([
    readMilestoneGift(contract, record.giftId),
    loadMilestoneGift(record.giftId),
    latestRating(record.giftId),
    lastReading(record.giftId),
    attestedReadings(record.giftId),
  ]);
  const reachedAt = proven.find((reading) => reading.outcome === "reached")?.observedAt ?? null;
  const status = milestoneStatusOf({ record, milestone, state, contract, latest, last, reachedAt, viewer, nowSeconds: Math.floor(Date.now() / 1_000) });
  return { status, state, contract };
}
