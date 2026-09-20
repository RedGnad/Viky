import type { Hex } from "viem";
import { COURSERA_GOAL_TYPE, COURSERA_HAS_IT, courseraProviderId } from "./coursera-certificate";
import { attestCourseraCertificate, CourseraReadError } from "./coursera-reading";
import { CREDLY_GOAL_TYPE, CREDLY_HAS_IT, credlyProviderId } from "./credly-badge";
import { attestCredlyBadge, CredlyReadError } from "./credly-reading";
import { attestDetCertificate, DetReadError, type AttestedDetReading } from "./det-reading";
import { detProviderId } from "./duolingo-english-test";
import { loadGift, type GiftRecord } from "./gift-store";
import { certificateOfGoal } from "./milestone-conditions";
import { recordReading } from "./milestone-store";
import { milestonePhase, readMilestoneGift, type MilestoneState } from "./milestone-reader";
import { SHAPE_HAVE_OR_NOT, type MilestoneProofMessage } from "./milestone-protocol";
import { relayProve } from "./milestone-relay";
import { escrowOf } from "./relayer";

/**
 * Proving a supervised result (U3, C3). Server only.
 *
 * The recipient pastes the link of the certificate they made public. This reads it, says in their own words why it
 * does not pay when it does not, and relays the proof when it does. Nothing here decides anything the contract does
 * not check again: the subject, the score, the day, the window. What it adds is a sentence instead of a revert.
 *
 * Every outcome is typed, because this is the money path of the whole condition: the thing that must never happen is
 * a person pasting the right certificate and being told nothing.
 */

export type CertificateOutcome =
  | { kind: "reached"; giftId: string; score: number; testDay: number; hash: string }
  /** The link reads, and it cannot pay. Each reason is its own, in the register's words. */
  | { kind: "refused"; giftId: string; code: CertificateRefusal; message: string; score?: number }
  /** Nothing to do: not a certificate gift, not opened, already settled. */
  | { kind: "already"; giftId: string; reason: string };

export type CertificateRefusal =
  | "INVALID_LINK"
  | "CERTIFICATE_PRIVATE"
  | "CERTIFICATE_EXPIRED"
  | "NO_CERTIFICATE"
  | "ANOTHER_NAME"
  | "BELOW_THE_TARGET"
  | "BEFORE_THE_GIFT"
  | "AFTER_THE_DEADLINE"
  | "SOURCE_UNAVAILABLE";

/** How long an attestation is good for, as the contract's window expects. */
const ATTESTATION_SECONDS = 10 * 60;

/**
 * What any certificate reading gives this path, whichever source it came from (C3). The score is the number the
 * contract compares with the target: a test has one, and a course certificate has nothing to score, so it carries
 * the one that says it exists.
 */
export type ReadCertificate = Readonly<{
  subject: Hex;
  score: number;
  /** The day the source itself says the thing was granted, in seconds. */
  testDay: number;
  observedAt: number;
  nullifier: Hex;
  /** What every attestation for this goal must carry, so one source can never settle another's gift. */
  providerId: Hex;
}>;

export type CertificateReadingDeps = {
  loadGift: (giftId: string) => Promise<GiftRecord | null>;
  readState: (contract: Hex, giftId: string) => Promise<MilestoneState>;
  attest: (goalType: number, link: string) => Promise<ReadCertificate>;
  prove: (input: { contract: Hex; message: MilestoneProofMessage }) => Promise<{ hash: string }>;
  record: (reading: Parameters<typeof recordReading>[0]) => Promise<void>;
  now: () => number;
};

export function liveCertificateReadingDeps(): CertificateReadingDeps {
  return {
    loadGift,
    readState: (contract, giftId) => readMilestoneGift(contract, giftId),
    attest: attestByGoal,
    prove: relayProve,
    record: recordReading,
    now: () => Math.floor(Date.now() / 1_000),
  };
}

/**
 * The reading a goal is settled by. The goal type is the contract's own, signed by the funder, so a Coursera proof
 * can never be offered to a gift made on the test, nor the other way round: each carries its own provider id and the
 * contract checks it again.
 */
async function attestByGoal(goalType: number, link: string): Promise<ReadCertificate> {
  if (goalType === CREDLY_GOAL_TYPE) {
    const reading = await attestCredlyBadge(link);
    // Nothing to score: the badge exists, and the certification is inside the subject the funder signed.
    return { subject: reading.subject, score: CREDLY_HAS_IT, testDay: reading.issuedDay, observedAt: reading.observedAt, nullifier: reading.nullifier, providerId: credlyProviderId() };
  }
  if (goalType === COURSERA_GOAL_TYPE) {
    const reading = await attestCourseraCertificate(link);
    // Nothing to score: the certificate exists, and the course is inside the subject the funder signed.
    return { subject: reading.subject, score: COURSERA_HAS_IT, testDay: reading.grantedDay, observedAt: reading.observedAt, nullifier: reading.nullifier, providerId: courseraProviderId() };
  }
  const reading: AttestedDetReading = await attestDetCertificate(link);
  return { subject: reading.subject, score: reading.score, testDay: reading.testDay, observedAt: reading.observedAt, nullifier: reading.nullifier, providerId: detProviderId() };
}

/** The UTC day of a moment in seconds, which is how the contract compares a granting day with a window (D49). */
function dayOf(seconds: number): number {
  return Math.floor(seconds / 86_400);
}

function refuse(giftId: string, code: CertificateRefusal, message: string, score?: number): CertificateOutcome {
  return { kind: "refused", giftId, code, message, score };
}

/**
 * Reads the certificate a recipient pasted for their gift, and settles it when it is the one the gift was made for.
 *
 * The order of the refusals is the order a person would ask them in: is this a link at all, is it still public, is it
 * theirs, is it the score, was it taken inside the gift.
 */
export async function proveCertificate(
  input: { giftId: string; link: string },
  deps: CertificateReadingDeps = liveCertificateReadingDeps(),
): Promise<CertificateOutcome> {
  const { giftId } = input;
  const record = await deps.loadGift(giftId);
  if (!record || !record.recipient) return { kind: "already", giftId, reason: "not_opened" };
  const contract = escrowOf(record);
  const state = await deps.readState(contract, giftId);
  // The words belong to the goal the funder signed, which is what the contract judges this gift by.
  const certificate = certificateOfGoal(state.goalType);
  if (state.shape !== SHAPE_HAVE_OR_NOT) return { kind: "already", giftId, reason: "not_a_certificate" };
  const phase = milestonePhase(state, deps.now());
  if (phase === "cancelled") return { kind: "already", giftId, reason: "cancelled" };
  if (phase === "reached" || phase === "returned") return { kind: "already", giftId, reason: "finished" };
  const words = certificate?.words.refusals;

  let reading: ReadCertificate;
  try {
    reading = await deps.attest(state.goalType, input.link);
  } catch (error) {
    if (!(error instanceof DetReadError) && !(error instanceof CourseraReadError) && !(error instanceof CredlyReadError)) {
      return refuse(giftId, "SOURCE_UNAVAILABLE", words?.unavailable ?? "That could not be read right now");
    }
    switch (error.code) {
      case "INVALID_LINK":
        return refuse(giftId, "INVALID_LINK", words?.linkShape ?? error.message);
      // A badge that exists and is for a certification Viky does not read is not this gift's, which is the same
      // answer as a badge in another name: nothing was wrong with the reading, and it is not what the gift is for.
      case "NOT_LISTED":
        return refuse(giftId, "ANOTHER_NAME", words?.anotherName ?? error.message);
      case "NO_BADGE":
        return refuse(giftId, "NO_CERTIFICATE", words?.notFound ?? error.message);
      case "CERTIFICATE_PRIVATE":
        return refuse(giftId, "CERTIFICATE_PRIVATE", words?.notPublic ?? error.message);
      case "CERTIFICATE_EXPIRED":
        return refuse(giftId, "CERTIFICATE_EXPIRED", words?.expired ?? error.message);
      case "NO_CERTIFICATE":
        return refuse(giftId, "NO_CERTIFICATE", words?.notFound ?? error.message);
      default:
        return refuse(giftId, "SOURCE_UNAVAILABLE", words?.unavailable ?? error.message);
    }
  }

  // The person and the thing the funder signed. The contract checks it too; this is so nobody meets a revert.
  if (reading.subject.toLowerCase() !== state.subject.toLowerCase()) {
    return refuse(giftId, "ANOTHER_NAME", words?.anotherName ?? "That certificate is in another name");
  }
  const target = Number(state.target);
  if (reading.score < target) {
    return refuse(giftId, "BELOW_THE_TARGET", words?.below(target, reading.score) ?? `That certificate is ${reading.score}. This gift is for ${target}.`, reading.score);
  }
  if (dayOf(reading.testDay) < dayOf(state.fundedAt)) {
    return refuse(giftId, "BEFORE_THE_GIFT", words?.beforeTheGift ?? "That test was taken before this gift was made", reading.score);
  }
  if (dayOf(reading.testDay) > dayOf(state.deadline)) {
    return refuse(giftId, "AFTER_THE_DEADLINE", words?.afterTheDeadline ?? "That test was taken after this gift's last day", reading.score);
  }

  const issuedAt = deps.now();
  const message: MilestoneProofMessage = {
    giftId: BigInt(giftId),
    recipient: state.recipient as Hex,
    identityHash: reading.subject,
    providerId: reading.providerId,
    metricValue: BigInt(reading.score),
    // The day the page itself says the test was taken, which is what this shape is judged by (D47).
    eventAt: BigInt(reading.testDay),
    observedAt: BigInt(reading.observedAt),
    nullifier: reading.nullifier,
    issuedAt: BigInt(issuedAt),
    expiresAt: BigInt(issuedAt + ATTESTATION_SECONDS),
  };
  const proved = await deps.prove({ contract, message });
  // The history line keeps the score and the day, and not the link: the alias is a key to a page carrying a date of
  // birth and a photograph, and this condition keeps three fields (D100). Nothing ever re-reads it, because a
  // certificate settles the whole gift at once.
  await deps
    .record({
      giftId,
      purpose: "reach",
      attested: true,
      username: "",
      playerId: null,
      rating: reading.score,
      ratedAt: reading.testDay,
      rd: null,
      observedAt: reading.observedAt,
      nullifier: reading.nullifier,
      outcome: "reached",
      txHash: proved.hash as Hex,
    })
    .catch(() => undefined);
  return { kind: "reached", giftId, score: reading.score, testDay: reading.testDay, hash: proved.hash };
}
