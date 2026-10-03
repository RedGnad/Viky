import { contactEmail } from "./contact";
import { LIMIT } from "./sentences";
import type { Hex } from "viem";
import { NO_AGREEMENT, readingLeave, type ReadingLeave } from "./consent-guard";
import { signedSubjectOf } from "./subject-key";
import { COURSERA_GOAL_TYPE, COURSERA_HAS_IT, courseraProviderId } from "./coursera-certificate";
import { attestCourseraCertificate, CourseraReadError } from "./coursera-reading";
import { EDX_GOAL_TYPE, EDX_HAS_IT, edxProviderId } from "./edx-certificate";
import { ACCREDIBLE_GOAL_TYPE, ACCREDIBLE_HAS_IT, accredibleProviderId } from "./accredible-credential";
import { AccredibleReadError, attestAccredibleCredential } from "./accredible-reading";
import { attestEdxCertificate, EdxReadError } from "./edx-reading";
import { MITX_ONLINE_GOAL_TYPE, MITX_ONLINE_HAS_IT, mitxOnlineProviderId } from "./mitx-online-certificate";
import { attestMitxOnlineCertificate, MitxOnlineReadError } from "./mitx-online-reading";
import { finishInWords, MARATHON_TIMERS, marathonGoalTypeOf, marathonProviderIdOf } from "./marathon";
import { attestMarathonResult, MarathonReadError } from "./marathon-reading";
import { WCA_GOAL_TYPE, wcaProviderId } from "./wca";
import { attestWcaResult, WcaReadError } from "./wca-reading";
import { CREDLY_GOAL_TYPE, CREDLY_HAS_IT, credlyProviderId } from "./credly-badge";
import { attestCredlyBadge, CredlyReadError } from "./credly-reading";
import { attestDetCertificate, DetReadError, type AttestedDetReading } from "./det-reading";
import { detProviderId } from "./duolingo-english-test";
import { loadGift, type GiftRecord } from "./gift-store";
import { certificateOfGoal } from "./milestone-conditions";
import { loadMilestoneGift, recordReading } from "./milestone-store";
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
  | { kind: "reached"; giftId: string; score: number; testDay: number; hash: string; line?: { runner: string; bib: string; official: string; finishSeconds: number } }
  /** The link reads, and it cannot pay. Each reason is its own, in the register's words. */
  | { kind: "refused"; giftId: string; code: CertificateRefusal; message: string; score?: number }
  /** Nothing to do: not a certificate gift, not opened, already settled. */
  | { kind: "already"; giftId: string; reason: string };

export type CertificateRefusal =
  | "NO_AGREEMENT"
  | "INVALID_LINK"
  | "CERTIFICATE_PRIVATE"
  | "CERTIFICATE_EXPIRED"
  | "NO_CERTIFICATE"
  | "ANOTHER_NAME"
  | "BELOW_THE_TARGET"
  | "BEFORE_THE_GIFT"
  | "AFTER_THE_DEADLINE"
  /** The month's limit of attested readings is reached: nothing was read (src/attested-calls.ts). */
  | "LIMIT_REACHED"
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
  /** The line as the page printed it, kept with the reading where the gift's page shows it (a marathon's name, bib and time). */
  line?: Readonly<{ username: string; playerId: string; rating: number }>;
}>;

export type CertificateReadingDeps = {
  loadGift: (giftId: string) => Promise<GiftRecord | null>;
  readState: (contract: Hex, giftId: string) => Promise<MilestoneState>;
  /** The subject the funder signed rides along for a source whose reading can match several (Accredible's domains). */
  attest: (goalType: number, link: string, signedSubject?: Hex, subjectKey?: string | null) => Promise<ReadCertificate>;
  /** The key the gift's subject was hashed with (src/subject-key.ts), or nothing for a gift made before keys. */
  subjectKey?: (giftId: string) => Promise<string | null>;
  /** Whether the recipient's agreement lets this gift be read (src/consent-guard.ts); a test that omits it reads. */
  leave?: (giftId: string, fundedAt: number) => Promise<ReadingLeave>;
  prove: (input: { contract: Hex; message: MilestoneProofMessage }) => Promise<{ hash: string }>;
  record: (reading: Parameters<typeof recordReading>[0]) => Promise<void>;
  now: () => number;
};

export function liveCertificateReadingDeps(): CertificateReadingDeps {
  return {
    loadGift,
    readState: (contract, giftId) => readMilestoneGift(contract, giftId),
    attest: attestByGoal,
    subjectKey: (giftId) => loadMilestoneGift(giftId).then((gift) => gift?.subjectKey ?? null),
    leave: readingLeave,
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
export async function attestByGoal(goalType: number, link: string, signedSubject?: Hex, subjectKey?: string | null): Promise<ReadCertificate> {
  if (goalType === ACCREDIBLE_GOAL_TYPE) {
    const reading = await attestAccredibleCredential(link);
    // The issuer's site can sit under several domains; the one the funder named is the subject they signed.
    const subject = reading.subjects.find((candidate) => signedSubject && signedSubjectOf(candidate, subjectKey).toLowerCase() === signedSubject.toLowerCase()) ?? reading.subjects[0];
    return { subject, score: ACCREDIBLE_HAS_IT, testDay: reading.issuedDay, observedAt: reading.observedAt, nullifier: reading.nullifier, providerId: accredibleProviderId() };
  }
  if (goalType === CREDLY_GOAL_TYPE) {
    const reading = await attestCredlyBadge(link);
    // Nothing to score: the badge exists, and the certification is inside the subject the funder signed.
    return { subject: reading.subject, score: CREDLY_HAS_IT, testDay: reading.issuedDay, observedAt: reading.observedAt, nullifier: reading.nullifier, providerId: credlyProviderId() };
  }
  if (Object.values(MARATHON_TIMERS).some((timer) => timer.goalType === goalType)) {
    const reading = await attestMarathonResult(link);
    // One goal per timing company: a page of the other's would carry the other's provider, and the contract would
    // refuse it; it is refused here first, by its name.
    if (marathonGoalTypeOf(reading.race.timer) !== goalType) throw new MarathonReadError("PROOF_MISMATCH", "That result is from another timing company than the one this gift reads");
    // The day it is judged by is the day the result was read (D273): the race's own date is the register's, and the
    // bib entered before the start is what ties the reading to the race.
    return { subject: reading.subject, score: reading.metric, testDay: reading.observedAt, observedAt: reading.observedAt, nullifier: reading.nullifier, providerId: marathonProviderIdOf(reading.race.timer), line: { username: reading.runner, playerId: reading.bib, rating: reading.finishSeconds } };
  }
  if (goalType === WCA_GOAL_TYPE) {
    // The link is the competition and the event, then the person as they gave themselves on their page (their WCA
    // id or their name as on the competitors list): the row read is the best single of their rounds (D273's rule
    // for the day: judged by the day the result is read).
    const bar = link.indexOf("|");
    const reading = await attestWcaResult(bar > 0 ? link.slice(0, bar) : link, bar > 0 ? link.slice(bar + 1) : "");
    return { subject: reading.subject, score: reading.metric, testDay: reading.observedAt, observedAt: reading.observedAt, nullifier: reading.nullifier, providerId: wcaProviderId(), line: { username: reading.name, playerId: reading.wcaId, rating: reading.best } };
  }
  if (goalType === MITX_ONLINE_GOAL_TYPE) {
    const reading = await attestMitxOnlineCertificate(link);
    // Nothing to score: the certificate exists, and the course is inside the subject the funder signed.
    return { subject: reading.subject, score: MITX_ONLINE_HAS_IT, testDay: reading.issuedDay, observedAt: reading.observedAt, nullifier: reading.nullifier, providerId: mitxOnlineProviderId() };
  }
  if (goalType === EDX_GOAL_TYPE) {
    const reading = await attestEdxCertificate(link);
    // Nothing to score: a verified certificate exists, and the course is inside the subject the funder signed.
    return { subject: reading.subject, score: EDX_HAS_IT, testDay: reading.issuedDay, observedAt: reading.observedAt, nullifier: reading.nullifier, providerId: edxProviderId() };
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
  // No reading that moves money without the recipient's yes, and none after their stop (the founder, 29 Sep 2026).
  const leave = deps.leave ? await deps.leave(giftId, state.fundedAt) : null;
  if (leave && !leave.allowed) return refuse(giftId, "NO_AGREEMENT", NO_AGREEMENT.message);
  const subjectKey = deps.subjectKey ? await deps.subjectKey(giftId) : null;

  let reading: ReadCertificate;
  try {
    reading = await deps.attest(state.goalType, input.link, state.subject as Hex, subjectKey);
  } catch (error) {
    if (!(error instanceof DetReadError) && !(error instanceof CourseraReadError) && !(error instanceof CredlyReadError) && !(error instanceof EdxReadError) && !(error instanceof AccredibleReadError) && !(error instanceof MitxOnlineReadError) && !(error instanceof MarathonReadError) && !(error instanceof WcaReadError)) {
      return refuse(giftId, "SOURCE_UNAVAILABLE", words?.unavailable ?? "That could not be read right now");
    }
    // A reading put off by the pace says when to come back, in its own words, never "in a moment" (the audit of 27 Sep 2026).
    if (error instanceof MarathonReadError && error.code === "FETCH_FAILED" && error.message.startsWith("The timing company is being read too often")) {
      return refuse(giftId, "SOURCE_UNAVAILABLE", error.message);
    }
    switch (error.code) {
      case "INVALID_LINK":
        return refuse(giftId, "INVALID_LINK", words?.linkShape ?? error.message);
      case "NO_BADGE":
        return refuse(giftId, "NO_CERTIFICATE", words?.notFound ?? error.message);
      case "CERTIFICATE_PRIVATE":
        return refuse(giftId, "CERTIFICATE_PRIVATE", words?.notPublic ?? error.message);
      case "CERTIFICATE_EXPIRED":
        return refuse(giftId, "CERTIFICATE_EXPIRED", words?.expired ?? error.message);
      case "NO_CERTIFICATE":
        return refuse(giftId, "NO_CERTIFICATE", words?.notFound ?? error.message);
      case "NOT_FINISHED":
        // A runner who did not finish (D273): real, and not what the gift is for.
        return refuse(giftId, "BELOW_THE_TARGET", words?.below(1, 0) ?? error.message);
      case "UNKNOWN_RACE":
      case "ANOTHER_BIB":
      case "UNKNOWN_COMPETITION":
      case "NOT_REGISTERED":
      case "NO_RESULT":
        return refuse(giftId, "NO_CERTIFICATE", words?.notFound ?? error.message);
      case "NOT_VERIFIED":
        // An edX certificate of a track edX does not verify (D212): real, and not what the gift is for.
        return refuse(giftId, "BELOW_THE_TARGET", words?.below(1, 0) ?? error.message);
      case "LIMIT_REACHED":
        // Nothing was read: said as it is, with where to write, and no day to count on a gift of this shape.
        return refuse(giftId, "LIMIT_REACHED", LIMIT.reading(null, contactEmail()));
      default:
        return refuse(giftId, "SOURCE_UNAVAILABLE", words?.unavailable ?? error.message);
    }
  }

  // The person and the thing the funder signed, hashed with the gift's key when it has one (src/subject-key.ts). The
  // contract checks it too; this is so nobody meets a revert.
  const signedSubject = signedSubjectOf(reading.subject, subjectKey);
  if (signedSubject.toLowerCase() !== state.subject.toLowerCase()) {
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
    identityHash: signedSubject,
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
      username: reading.line?.username ?? "",
      playerId: reading.line?.playerId ?? null,
      rating: reading.line?.rating ?? reading.score,
      ratedAt: reading.testDay,
      rd: null,
      observedAt: reading.observedAt,
      nullifier: reading.nullifier,
      outcome: "reached",
      txHash: proved.hash as Hex,
    })
    .catch(() => undefined);
  return { kind: "reached", giftId, score: reading.score, testDay: reading.testDay, hash: proved.hash, ...(reading.line ? { line: { runner: reading.line.username, bib: reading.line.playerId, official: finishInWords(reading.line.rating), finishSeconds: reading.line.rating } } : {}) };
}
