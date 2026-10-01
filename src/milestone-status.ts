import { milestoneEnded, milestoneEndOffer } from "./gift-ending";
import type { Hex } from "viem";
import { formatAusd } from "./gift-reader";
import type { GiftRecord } from "./gift-store";
import { askedInWords, cadenceOfGoal, certificateById, certificateOfGoal, CHESS_MILESTONE, milestoneById } from "./milestone-conditions";
import { milestonePhase, readMilestoneGift, type MilestoneState } from "./milestone-reader";
import { SHAPE_HAVE_OR_NOT } from "./milestone-protocol";
import { attestedReadings, lastReading, latestRating, loadMilestoneGift, type MilestoneRecord, type MilestoneReading } from "./milestone-store";
import { bibStillOpen, DISTANCE_LABELS, finishInWords, marathonEventById } from "./marathon";
import { isWcaId, WCA_EVENTS, wcaCourseOf, wcaResultInWords } from "./wca";
import type { MilestoneStatus } from "./milestone-view";
import { escrowOf } from "./relayer";
import { latestReviewOf, loadPortal, resultsExtractOf, type PortalReview, type PortalSense } from "./portal-store";
import { GRADE_UNITS, gradeTargetInWords, scaleKey, scaleMismatch, scaleOfChoice } from "./university-shown";

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
  /** A grade gift's target in words, on its scale (the founder, 28 Sep 2026). */
  targetWords?: string | null;
  /** What a university gift waits on (D313): its provider being built, or its first proof's review. */
  review?: Readonly<{ status: "building" | PortalReview["status"]; message?: string }> | null;
}): MilestoneStatus {
  const { record, state, viewer } = input;
  const conditionId = input.milestone?.conditionId ?? "";
  // A certificate gift has no cadence and no standing: its words come from its own half of the register (U3).
  const certificate = certificateById(conditionId) ?? certificateOfGoal(state.goalType);
  const condition = milestoneById(conditionId) ?? (certificate ? undefined : CHESS_MILESTONE);
  const cadence = condition ? cadenceOfGoal(condition, state.goalType) : undefined;
  const started = state.deadline > 0;
  const reached = state.settled && state.earned > 0n;
  // Gift numbers follow each other, so what identifies the person or measures them goes only where the names go: the
  // funder, the person it is for, or whoever holds the link's key (the founder, 29 Sep 2026). The account read and the
  // figures of the climb, a reading, a target, where it started, are theirs as much as a first name is.
  const insider = viewer.isRecipient || viewer.isFunder || viewer.holdsTheLink;
  return {
    kind: "milestone",
    shape: state.shape === SHAPE_HAVE_OR_NOT ? "certificate" : "climb",
    giftId: record.giftId,
    conditionId: (condition ?? certificate)?.condition.id ?? conditionId,
    youAreTheRecipient: viewer.isRecipient,
    youAreTheFunder: viewer.isFunder,
    names: viewer.isRecipient || viewer.isFunder || viewer.holdsTheLink ? { recipientName: record.recipientName, funderName: record.funderName } : null,
    goalAccount: {
      username: insider ? record.goalUsername : null,
      bound: record.boundAt !== null,
      code: viewer.isRecipient ? record.bindingCode : null,
      codeExpiresAt: viewer.isRecipient ? (record.bindingCodeExpiresAt?.toISOString() ?? null) : null,
      namedByFunder: record.usernameSource !== "recipient",
    },
    amount: state.amount.toString(),
    amountDisplay: formatAusd(state.amount),
    startReading: insider && started ? Number(state.startingValue) : null,
    target: insider ? Number(state.target) : null,
    todayReading: insider ? (input.latest?.rating ?? null) : null,
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
    // A first reading above the cap, refused before anything was sent (the audit, 29 Sep 2026): said to the two people
    // for as long as the gift has not started.
    startAboveCap: insider && input.last?.outcome === "refused:START_TOO_HIGH" && milestonePhase(state, input.nowSeconds) === "opened" ? (input.last.rating ?? null) : null,
    maximumStart: Number(state.maximumStart),
    standingAtOffer: insider ? (input.milestone?.standingAtOffer ?? null) : null,
    marathon: marathonOf(input),
    wca: wcaOf(input),
    targetWords: insider ? (input.targetWords ?? null) : null,
    asked: insider && certificate ? askedInWords(certificate, Number(state.target)) : null,
    review: !reached && input.review && input.review.status !== "pinned" ? { status: input.review.status, ...(input.review.message ? { message: input.review.message } : {}) } : null,
    version: state.version,
    end: milestoneEndOffer(state, viewer.isRecipient),
    ended: milestoneEnded(state),
  };
}

/** The WCA competition's part of the status: nothing for any other condition, and the names only to those who may see them. */
function wcaOf(input: { record: GiftRecord; milestone: MilestoneRecord | null; latest: MilestoneReading | null; viewer: Viewer }): MilestoneStatus["wca"] {
  if (input.milestone?.conditionId !== "wca-time") return null;
  const course = wcaCourseOf(String(input.milestone.course ?? ""));
  if (!course) return null;
  const seesNames = input.viewer.isRecipient || input.viewer.isFunder || input.viewer.holdsTheLink;
  const eventLabel = WCA_EVENTS[course.eventId];
  const who = input.record.boundAt && input.record.goalUsername ? String(input.record.goalUsername) : null;
  const profile = input.record.goalProfileId ? String(input.record.goalProfileId) : null;
  const latest = input.latest;
  const result = seesNames && latest && latest.rating !== null && latest.playerId ? { name: latest.username, wcaId: latest.playerId, best: latest.rating, inWords: wcaResultInWords(latest.rating, course.eventId) } : null;
  return {
    competitionId: course.competitionId,
    eventId: course.eventId,
    eventLabel,
    title: input.record.goalCourseTitle ?? `${course.competitionId}, ${eventLabel}`,
    registered: seesNames && who ? { who, wcaId: profile && isWcaId(profile) ? profile : null } : null,
    result,
  };
}

/** The marathon's part of the status (D273): nothing for any other condition, and the line read only to those who may see the names. */
function marathonOf(input: { record: GiftRecord; milestone: MilestoneRecord | null; latest: MilestoneReading | null; viewer: Viewer; nowSeconds: number }): MilestoneStatus["marathon"] {
  if (input.milestone?.conditionId !== "marathon-finish") return null;
  const found = marathonEventById(String(input.milestone.course ?? ""));
  if (!found) return null;
  const { race } = found;
  const seesNames = input.viewer.isRecipient || input.viewer.isFunder || input.viewer.holdsTheLink;
  const bib = input.record.boundAt && input.record.goalUsername ? String(input.record.goalUsername) : null;
  const latest = input.latest;
  const result = seesNames && latest && latest.rating !== null && latest.playerId ? { runner: latest.username, bib: latest.playerId, official: finishInWords(latest.rating), finishSeconds: latest.rating } : null;
  return { raceId: race.raceId, raceName: race.name, distance: DISTANCE_LABELS[found.event.distance], startsAt: race.startsAt, bibOpen: bibStillOpen(race, input.nowSeconds * 1_000), bib: seesNames ? bib : null, result };
}

/** The sense each university condition reads (D313). */
const UNIVERSITY_SENSES: Readonly<Record<string, PortalSense>> = {
  "university-enrollment-shown": "enrolment",
  "university-year-passed-shown": "results",
  "university-grade-shown": "results",
};

/**
 * What a university gift waits on (D313): the provider of its sense being built, which the operator was asked for
 * when the gift was made; or its first proof held for review, or refused by it. Nothing for any other gift, and
 * nothing when the tables cannot be read.
 */
async function universityWait(giftId: string, milestone: MilestoneRecord | null): Promise<Readonly<{ status: "building" | PortalReview["status"]; message?: string }> | null> {
  const sense = milestone ? UNIVERSITY_SENSES[milestone.conditionId] : undefined;
  if (!sense || !milestone?.portal) return null;
  try {
    const portal = await loadPortal(milestone.portal);
    if (portal && !portal[sense]) return { status: "building" };
    const review = await latestReviewOf(giftId);
    if (!review) return null;
    // The review found the university grades on another scale than the gift was made on: said with both scales.
    const chosen = scaleOfChoice(milestone.gradeScale ?? undefined);
    const pinned = resultsExtractOf(portal?.results ?? null)?.grade.scale;
    const mismatch = review.status === "refused" && review.reason === "SCALE_MISMATCH" && chosen && pinned ? scaleMismatch(chosen, pinned) : undefined;
    return mismatch ? { status: review.status, message: mismatch.message } : { status: review.status };
  } catch {
    return null;
  }
}

/** A grade gift's target, from the contract's hundredths, on the scale it was made on or the university's pinned one. */
async function gradeTargetWords(milestone: MilestoneRecord | null, targetUnits: number): Promise<string | null> {
  if (milestone?.conditionId !== "university-grade-shown") return null;
  let key = milestone.gradeScale ?? undefined;
  if (!key && milestone.portal) {
    const pinned = resultsExtractOf((await loadPortal(milestone.portal).catch(() => null))?.results ?? null)?.grade.scale;
    key = pinned ? scaleKey(pinned) : undefined;
  }
  return gradeTargetInWords(targetUnits / GRADE_UNITS, key);
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
  const review = await universityWait(record.giftId, milestone);
  const targetWords = await gradeTargetWords(milestone, Number(state.target));
  const reachedAt = proven.find((reading) => reading.outcome === "reached")?.observedAt ?? null;
  const status = milestoneStatusOf({ record, milestone, state, contract, latest, last, reachedAt, viewer, nowSeconds: Math.floor(Date.now() / 1_000), review, targetWords });
  return { status, state, contract };
}
