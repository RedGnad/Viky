import { getAddress, type Hex } from "viem";
import { NO_AGREEMENT, readingLeave, type ReadingLeave } from "./consent-guard";
import { readDuolingoCourse, CourseReadError, type CourseReading } from "./duolingo-course-reading";
import { fetchPublicProfile, PublicProfileError, reclaimPublicProfileDeps, type PublicProfile, type PublicProfileDeps } from "./duolingo-public";
import { checkInSubject, displayNameHasCode, DUOLINGO_PUBLIC_PROVIDER_LABEL } from "./duolingo-public-terms";
import { DUOLINGO_DAILY } from "./conditions";
import { contactEmail } from "./contact";
import { catchUpSecondsOf } from "./catch-up";
import { LAST_RESORT_WITHIN_SECONDS, lastResortDue, lookBeforeCount, lookForCode, type ProfileLook } from "./daily-look";
import { resolvePublicDuolingoProfile } from "./duolingo-profile";
import { LIMIT } from "./sentences";
import { contractRefusal } from "./gift-api";
import { ATTESTATION_TTL_SECONDS, identityPseudonym, serialiseMessage, signCheckIn, type CheckInMessage } from "./gift-attestation";
import { checkInDayIndex, readGift, utcDayOf } from "./gift-reader";
import { assertReadingInProportion, ReadingOutOfProportion } from "./reading-proportion";
import { relayCheckIn } from "./gift-relay";
import { loadGift, loadRelayed, markBound, type GiftRecord } from "./gift-store";
import { holdTheStart, type StartAsked } from "./held-start";
import { consumeAndSaveVerification, saveProofSession } from "./proof-session-store";
import { escrowOf, RelayerError } from "./relayer";
import { claimPass } from "./pass-guard";
import { StartNotSigned } from "./v2-start";

/**
 * The public mode (D27): one attested read of the recipient's public Duolingo profile becomes one
 * check-in attestation, with nobody signing in anywhere. `bind` is the first read (it proves control
 * when the recipient named the account, and opens the window); `count` is the daily read the keeper
 * runs. Every outcome is typed, refusals included, so the screen and the keeper log say why.
 *
 * Both look plainly before they pay for the attested read (src/daily-look.ts): a count takes none when the contract
 * would credit no day with what the profile shows, and a connection by code takes none until the code is in the name.
 * A look that failed takes none either, but for the reading of last resort: by a pass, once for a gift in a day, when
 * the window of its oldest open day closes before the next pass.
 */

export type PublicCheckInPurpose = "bind" | "count";

export type PublicCheckInOutcome =
  /** `unit` says what `xp` counts when it is not experience: a connected source counts verdicts (D188). */
  | Readonly<{ kind: "bound"; giftId: string; xp: number; hash: Hex; unit?: string }>
  | Readonly<{ kind: "counted"; giftId: string; xp: number; creditedDays: number; hash: Hex; unit?: string }>
  | Readonly<{ kind: "already"; giftId: string; reason: "counted_today" | "not_bound" | "not_opened" | "no_account" | "already_bound" | "finished" | "cancelled" }>
  /**
   * `countableUntil`, with the refusal `LIMIT_REACHED` only: when the window of the day still to count closes, in UTC
   * seconds (src/daily-count.ts). `looked`, when a plain look answered and no attested reading was taken.
   */
  | Readonly<{ kind: "refused"; giftId: string; code: string; message: string; xp?: number; countableUntil?: number | null; looked?: true }>
  /** The second version: the first reading was taken, and waits for the recipient's own signature (src/held-start.ts). */
  | StartAsked;

export type PublicCheckInDeps = {
  profile: () => Promise<PublicProfileDeps>;
  /** One course's experience, for a gift made on a course rather than on the total (U1). */
  course: (username: string, courseId: string) => Promise<CourseReading>;
  now: () => number;
  /** Whether the recipient's agreement lets this gift be read (src/consent-guard.ts); a test that omits it reads. */
  leave?: (giftId: string, fundedAt: number) => Promise<ReadingLeave>;
  /** The gift as its contract holds it; the chain's own answer when absent (src/gift-reader.ts). */
  gift?: typeof readGift;
  /** The plain look taken before a proof is paid for (src/daily-look.ts); a test that omits it pays every time. */
  look?: ProfileLook;
  /**
   * Whether the reading of last resort may be taken for this gift on this UTC day: true once, whichever instance asks
   * first (src/pass-guard.ts). A test that omits it takes it every time it is due.
   */
  claimLastResort?: (giftId: string, day: number) => Promise<boolean>;
};

/** Two days: the name carries the day, so a claim never comes back for it. */
const LAST_RESORT_CLAIMED_FOR_SECONDS = 2 * 86_400;

const defaultDeps: PublicCheckInDeps = {
  look: resolvePublicDuolingoProfile,
  claimLastResort: (giftId, day) => claimPass(`daily-last-resort:${giftId}:${day}`, LAST_RESORT_CLAIMED_FOR_SECONDS),
  profile: reclaimPublicProfileDeps,
  course: (username, courseId) => readDuolingoCourse({ username, courseId }),
  now: () => Math.floor(Date.now() / 1_000),
  leave: readingLeave,
};

function refusal(giftId: string, code: string, message: string, xp?: number): PublicCheckInOutcome {
  return { kind: "refused", giftId, code, message, xp };
}

async function countedToday(giftId: string, nowSeconds: number): Promise<boolean> {
  const today = utcDayOf(nowSeconds);
  const relayed = await loadRelayed(giftId);
  // The relayed rows carry the session id, which the public mode stamps with the UTC day.
  return relayed.some((entry) => entry.kind === "check-in" && entry.sessionId?.startsWith(`public:${giftId}:count:${today}:`));
}

export async function runPublicCheckIn(
  input: {
    giftId: string;
    purpose: PublicCheckInPurpose;
    force?: boolean;
    /**
     * Which pass is reading, when a pass is: only a pass may take a reading of last resort after a look that failed,
     * and only the one that is the last before a window closes (`LAST_RESORT_WITHIN_SECONDS`). A count a person asks
     * for names none: after a look that failed it takes no proof, and they try again in a minute.
     */
    pass?: "counting" | "recount";
  },
  deps: PublicCheckInDeps = defaultDeps,
): Promise<PublicCheckInOutcome> {
  const { giftId, purpose } = input;
  const record: GiftRecord | null = await loadGift(giftId);
  if (!record || !record.recipient) return { kind: "already", giftId, reason: "not_opened" };
  if (!record.goalUsername) return { kind: "already", giftId, reason: "no_account" };
  if (purpose === "bind" && record.boundAt) return { kind: "already", giftId, reason: "already_bound" };
  if (purpose === "count" && !record.boundAt) return { kind: "already", giftId, reason: "not_bound" };

  const escrow = escrowOf(record);
  const onChain = await (deps.gift ?? readGift)(escrow, giftId);
  if (onChain.cancelled) return { kind: "already", giftId, reason: "cancelled" };
  if (onChain.finalised) return { kind: "already", giftId, reason: "finished" };
  // No reading that moves money without the recipient's yes, and none after their stop (the founder, 29 Sep 2026).
  const leave = deps.leave ? await deps.leave(giftId, onChain.fundedAt) : null;
  if (leave && !leave.allowed) return refusal(giftId, NO_AGREEMENT.code, NO_AGREEMENT.message);
  const now = deps.now();
  if (purpose === "count" && !input.force && (await countedToday(giftId, now))) return { kind: "already", giftId, reason: "counted_today" };
  if (purpose === "bind" && record.usernameSource === "recipient") {
    if (!record.bindingCode || !record.bindingCodeExpiresAt || record.bindingCodeExpiresAt.getTime() < now * 1_000) {
      return refusal(giftId, "CODE_EXPIRED", "The code has expired. Ask for a new one.");
    }
  }

  // A gift made on one course reads that course; every gift made before U1, and every gift made on the whole profile,
  // reads the total exactly as it always did. The two can never be mixed: they carry different provider ids, which the
  // contract checks against the gift's goal, and different identities, which it pins at the first reading.
  const courseId = record.goalCourse;
  const messages: Record<string, string> = {
    INVALID_USERNAME: "That does not look like a Duolingo username.",
    PROFILE_NOT_FOUND: "No public Duolingo profile has that username. Check the spelling, and that the profile is public.",
    // The register's own words, so the sentence that names a source lives where every such sentence lives.
    NO_SUCH_COURSE: DUOLINGO_DAILY.course?.missing(record.goalCourseTitle ?? "that course") ?? "That course is not on that account.",
    FETCH_FAILED: "Duolingo could not be read just now. Try again in a minute.",
    PROOF_INVALID: "The reading could not be verified. Try again in a minute.",
    PROOF_MISMATCH: "The reading could not be verified. Try again in a minute.",
    NOT_CONFIGURED: "Counting is not switched on yet.",
    // The month's limit of readings (src/attested-calls.ts). The screen adds until when the day can still be counted.
    LIMIT_REACHED: LIMIT.reading(null, contactEmail()),
  };
  const codeNotInName = (shown: string) => refusal(giftId, "CODE_NOT_IN_NAME", `The code is not in that profile's name yet (it reads "${shown}"). Add it, wait a moment, and try again.`);
  // Look first, which costs nothing: an attested reading is one of a month's hundred (src/daily-look.ts).
  if (deps.look && purpose === "count") {
    // No proof for a reading the contract would refuse: no day to credit, or not one full target since the last one.
    const looked = await lookBeforeCount({ username: record.goalUsername, courseId, gift: onChain, nowSeconds: now }, deps.look);
    const mapped = looked.kind === "refused" ? contractRefusal(looked.refusal) : null;
    if (looked.kind === "refused" && mapped) return { kind: "refused", giftId, code: mapped.code, message: mapped.message, xp: looked.xp, looked: true };
    // No profile by that name: the source's own answer about the account, which a proof would only repeat.
    if (looked.kind === "gone") return { kind: "refused", giftId, code: "PROFILE_NOT_FOUND", message: messages.PROFILE_NOT_FOUND, looked: true };
    if (looked.kind === "unseen") {
      // The look could not say, and no proof is taken for that: the day stays open and the next pass looks again. One
      // reading goes without a look, the last chance of a day about to close, once for a gift in a day.
      const within = input.pass === "recount" ? LAST_RESORT_WITHIN_SECONDS.recount : null;
      const lastResort = within !== null && lastResortDue(onChain, now, catchUpSecondsOf(escrow), within) && (!deps.claimLastResort || (await deps.claimLastResort(giftId, utcDayOf(now))));
      if (!lastResort) return { kind: "refused", giftId, code: "FETCH_FAILED", message: messages.FETCH_FAILED, looked: true };
    }
  }
  if (deps.look && purpose === "bind" && record.usernameSource === "recipient") {
    // No proof until the code is in the name, and none for a look that failed: the person tries again in a minute.
    const stopped = await lookForCode({ username: record.goalUsername, code: record.bindingCode ?? "" }, deps.look);
    if (stopped) return stopped.code === "CODE_NOT_IN_NAME" ? codeNotInName(stopped.shown) : refusal(giftId, stopped.code, messages[stopped.code]);
  }

  let read: { username: string; profileId: string; displayName: string; xp: number; observedAt: number; nullifier: Hex; proof: unknown; streak: number | null };
  try {
    if (courseId) {
      const course: CourseReading = await deps.course(record.goalUsername, courseId);
      read = { ...course, xp: course.courseXp, streak: null };
    } else {
      const profile: PublicProfile = await fetchPublicProfile(record.goalUsername, await deps.profile());
      read = { ...profile, xp: profile.totalXp, streak: profile.streak };
    }
  } catch (error) {
    if (error instanceof PublicProfileError || error instanceof CourseReadError) return refusal(giftId, error.code, messages[error.code] ?? error.message);
    throw error;
  }

  // The attested name is the one that proves the account is theirs: the look only kept a proof from being wasted.
  if (purpose === "bind" && record.usernameSource === "recipient" && !displayNameHasCode(read.displayName, record.bindingCode ?? "")) return codeNotInName(read.displayName);

  const recipient = getAddress(record.recipient);
  const subject = checkInSubject(read.profileId, courseId);
  const message: CheckInMessage = {
    giftId: BigInt(giftId),
    recipient,
    identityHash: identityPseudonym(DUOLINGO_PUBLIC_PROVIDER_LABEL, subject.identity),
    providerId: subject.providerId,
    metricValue: BigInt(read.xp),
    observedAt: BigInt(read.observedAt),
    nullifier: read.nullifier,
    issuedAt: BigInt(now),
    expiresAt: BigInt(now + ATTESTATION_TTL_SECONDS),
  };
  // A figure out of all proportion with the target is not signed for (src/reading-proportion.ts).
  try {
    await assertReadingInProportion(escrow, onChain, message);
  } catch (error) {
    if (error instanceof ReadingOutOfProportion) return refusal(giftId, error.code, error.message);
    throw error;
  }
  const signature = await signCheckIn(message, escrow);
  const sessionId = `public:${giftId}:${purpose}:${utcDayOf(now)}:${read.nullifier.slice(2, 18)}`;
  await saveProofSession({
    sessionId,
    conditionId: "duolingo-daily",
    account: recipient.toLowerCase(),
    giftId,
    goalType: record.goalType,
    phase: purpose === "bind" ? "baseline" : "check-in",
    dayIndex: checkInDayIndex(onChain, now),
    duolingoUsername: read.username,
    duolingoProfileId: read.profileId,
  });
  await consumeAndSaveVerification({
    sessionId,
    evidence: {
      source: "zkfetch",
      username: read.username,
      profileId: read.profileId,
      displayName: read.displayName,
      // The number counted, and what it is the number of: the whole profile, or the one course this gift is about.
      ...(courseId ? { courseId, courseXp: read.xp } : { totalXp: read.xp, streak: read.streak }),
      observedAt: read.observedAt,
    },
    attestation: { message: serialiseMessage(message), signature },
    proofs: read.proof,
  });

  try {
    const relayed = await relayCheckIn(sessionId, escrow);
    if (purpose === "bind") {
      await markBound(giftId, read.profileId);
      return { kind: "bound", giftId, xp: read.xp, hash: relayed.hash };
    }
    return { kind: "counted", giftId, xp: read.xp, creditedDays: relayed.creditedDays, hash: relayed.hash };
  } catch (error) {
    // The second version takes a first reading only with the recipient's own signature: it is held, and asked for.
    if (error instanceof StartNotSigned) {
      return holdTheStart(error, { account: recipient, message: serialiseMessage(message), sessionId, after: { bindTo: read.profileId, xp: read.xp } });
    }
    if (error instanceof RelayerError && error.code === "REVERTED") {
      const mapped = contractRefusal(error.contractError);
      return refusal(giftId, mapped?.code ?? error.contractError ?? "REFUSED", mapped?.message ?? "The contract refused this reading.", read.xp);
    }
    throw error;
  }
}
