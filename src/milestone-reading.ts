import { getAddress, type Hex } from "viem";
import { MILESTONE_ACTIONS } from "./sentences";
import { NO_AGREEMENT, readingLeave, type ReadingLeave } from "./consent-guard";
import { attestClimbRating, isClimbReadError, readClimbStanding, type AttestedClimbReading } from "./climb-reading";
import { climbIdentityLabel, climbOfGoal, climbProviderId, type ClimbId } from "./climbs";
import { nameHasChessCode } from "./chess-reading";
import { identityPseudonym } from "./gift-attestation";
import { holdTheStart, type StartAsked } from "./held-start";
import { loadGift, markBound, type GiftRecord } from "./gift-store";
import { milestoneRefusal } from "./milestone-api";
import { MILESTONE_ATTESTATION_TTL_SECONDS, type MilestoneProofMessage } from "./milestone-protocol";
import { milestonePhase, readingTakenBy, readMilestoneGift, type MilestoneState } from "./milestone-reader";
import { relayProve, type ProvedReading } from "./milestone-relay";
import { attestedReadings, lastReading, readSince, recordReading, touchSameLook, type MilestoneReading, type ReadingPurpose } from "./milestone-store";
import { escrowOf, RelayerError } from "./relayer";
import { StartNotSigned } from "./v2-start";
import type { ChessStanding } from "./chess-com";

/**
 * Reading a milestone gift and acting on what the reading says (C2). Two purposes, as for Duolingo's public mode:
 *
 * - `start`: the first reading. It proves the Chess.com account is the recipient's (the code in its name), binds the
 *   gift to that player, and is recorded on the contract as the start whatever it says, which starts the clock. This
 *   is the rule the contract rests on (D44): a refusal would leave no trace, and the recipient could try again until a
 *   reading suited them.
 * - `reach`: every later reading, by the keeper each day or by the recipient on demand. The first one at or past the
 *   target releases the whole gift.
 *
 * A reach reading looks before it pays for a proof. A plain read of the page says where the person stands; below the
 * target nothing could move, because the contract refuses a reading short of the target and keeps no trace of it, so
 * an attested reading there would cost a proof and change nothing. At or past the target, or when the plain read
 * fails for any reason, an attested reading is taken, and only that one is ever sent. The plain read can therefore
 * cost the recipient nothing: it never stops an attested reading, it only skips one that could not have mattered.
 *
 * A reading a pause kept from being sent is not lost (the review of 2 Oct 2026, R-14). While readings are paused the
 * contract takes none, so a reading that reached the target then was refused and written down here. When they
 * reopen, that reading is signed again and sent, inside the grace the contract counts from the reopening: on the
 * second version a deadline that fell inside the pause is judged on a reading taken until the pause ended. Before,
 * the server answered that the deadline had passed, and the whole gift went back to its funder six hours later. And
 * while the pause runs, one such reading is enough: no proof is paid for again at every pass.
 *
 * Every outcome is typed, refusals included, so the screen and the keeper's report say why.
 */

export type MilestoneOutcome =
  | Readonly<{ kind: "started"; giftId: string; rating: number; hash: Hex; aboveAccepted: boolean; deadline: number }>
  | Readonly<{ kind: "reached"; giftId: string; rating: number; hash: Hex }>
  | Readonly<{ kind: "notYet"; giftId: string; rating: number; target: number; attested: boolean }>
  | Readonly<{
      kind: "already";
      giftId: string;
      reason: "not_opened" | "no_account" | "not_bound" | "already_bound" | "read_recently" | "finished" | "cancelled" | "start_too_high" | "deadline_passed";
    }>
  | Readonly<{ kind: "refused"; giftId: string; code: string; message: string; rating?: number }>
  /** The second version: the start was read, and waits for the recipient's own signature (src/held-start.ts). */
  | StartAsked;

/**
 * Refusals that say something broke on our side rather than anything about the person's account. The pass holds a
 * gift whose reading failed for one of these, so nothing is settled against a reading that never happened (D57).
 */
export const MILESTONE_OURS_TO_FIX: ReadonlySet<string> = new Set(["FETCH_FAILED", "PROOF_INVALID", "PROOF_MISMATCH", "WORKER_OUT_OF_DATE", "NOT_CONFIGURED"]);

/** What a person reads for each refusal of the reading itself. The contract's refusals have their own table (gift-api). */
const MESSAGES: Readonly<Record<string, string>> = {
  INVALID_USERNAME: "That does not look like a Chess.com name.",
  PROFILE_NOT_FOUND: "Chess.com has no player by that name now. If the name was changed, give the new one.",
  NO_NAME: "Your Chess.com profile has no name yet. Put the code in your name, save, and try again.",
  NO_RATING: "There is no rating in this cadence on that account.",
  ACCOUNT_CLOSED: "Chess.com has closed this account, so this gift can no longer be earned.",
  CODE_EXPIRED: "The code has expired. Ask for a new one.",
  CODE_NOT_IN_NAME: "The code is not in your Chess.com name yet. Add it, save, wait a moment, and try again.",
  OTHER_PLAYER: "That name belongs to another Chess.com player than the one this gift is for.",
  FETCH_FAILED: "Chess.com could not be read just now. Nothing was changed. Try again in a minute.",
  PROOF_INVALID: "The reading could not be verified. Nothing was changed. Try again in a minute.",
  PROOF_MISMATCH: "The reading could not be verified. Nothing was changed. Try again in a minute.",
  // Never "try again": trying again changes nothing until the reading service is redeployed, and the sentence says
  // we know because the refusal is logged and counted where we read it (incident of 18 Sep 2026).
  WORKER_OUT_OF_DATE: "Our reading service needs an update. Nothing was changed, and we have been told.",
  NOT_CONFIGURED: "Reading is not switched on yet.",
};

export type MilestoneReadingDeps = {
  /** Whether the recipient's agreement lets this gift be read (src/consent-guard.ts); a test that omits it reads. */
  leave?: (giftId: string, fundedAt: number) => Promise<ReadingLeave>;
  loadGift: (giftId: string) => Promise<GiftRecord | null>;
  readState: (contract: Hex, giftId: string) => Promise<MilestoneState>;
  plain: (username: string, mode: ClimbId) => Promise<ChessStanding>;
  attest: (input: { username: string; mode: ClimbId; withName: boolean }) => Promise<AttestedClimbReading>;
  /** The identity pseudonym of the player, with the label of the house the climb is read on. */
  identity: (playerId: string, mode: ClimbId) => Hex;
  prove: (input: { contract: Hex; message: MilestoneProofMessage }) => Promise<ProvedReading>;
  /** Holds a start the relay would not send without the recipient's signature; a test that omits it lets the refusal through. */
  hold?: typeof holdTheStart;
  markBound: (giftId: string, playerId: string) => Promise<boolean>;
  record: (reading: MilestoneReading) => Promise<void>;
  readRecently: (giftId: string, sinceSeconds: number) => Promise<boolean>;
  /** The gift's newest reading, so a refusal repeated by every pass is written once. */
  last?: (giftId: string) => Promise<MilestoneReading | null>;
  /** The gift's attested readings, oldest first: where one that a pause kept from being sent is found again. */
  attested?: (giftId: string) => Promise<MilestoneReading[]>;
  /**
   * A look that found exactly what the gift's newest reading found: the newest row's moment is moved to now and no
   * row is added. Answers whether there was such a row. A pass every five minutes wrote one identical row each time
   * (the audit of 1 Oct 2026, F-02); the first reading of a gift, which the journal page reads, is never touched.
   */
  sameLookAgain?: (look: MilestoneReading) => Promise<boolean>;
  now: () => number;
};

export function liveMilestoneReadingDeps(): MilestoneReadingDeps {
  return {
    leave: readingLeave,
    loadGift,
    readState: (contract, giftId) => readMilestoneGift(contract, giftId),
    plain: (username, mode) => readClimbStanding(username, mode),
    attest: (input) => attestClimbRating(input),
    identity: (playerId, mode) => identityPseudonym(climbIdentityLabel(mode), playerId),
    prove: relayProve,
    hold: holdTheStart,
    markBound,
    record: recordReading,
    readRecently: readSince,
    last: lastReading,
    attested: attestedReadings,
    sameLookAgain: touchSameLook,
    now: () => Math.floor(Date.now() / 1_000),
  };
}

/**
 * A keeper pass does not read a gift read this recently, so a retried cron costs nothing. Short on purpose: a reading
 * the recipient asked for an hour before the pass must not stand in for the pass's own.
 */
export const RECENT_READING_SECONDS = 30 * 60;

/** What one refusal says, so a test can hold a sentence to what it promises without going through a whole reading. */
export function refusalMessage(code: string): string {
  return MESSAGES[code] ?? "This could not be recorded.";
}

function refused(giftId: string, code: string, rating?: number, message?: string): MilestoneOutcome {
  return { kind: "refused", giftId, code, message: message ?? refusalMessage(code), rating };
}

/**
 * Nothing read, for want of an agreement (the founder, 29 Sep 2026), written down where the journal of both people
 * reads it: once, not at every pass, and never sent to the contract. The deadline does the rest: a target not read by
 * then brings the whole gift back.
 */
async function noAgreement(giftId: string, username: string, deps: MilestoneReadingDeps): Promise<MilestoneOutcome> {
  const last = deps.last ? await deps.last(giftId) : null;
  if (last?.outcome !== `refused:${NO_AGREEMENT.code}`) {
    await deps.record({
      giftId,
      purpose: "look",
      attested: false,
      username,
      playerId: null,
      rating: null,
      ratedAt: null,
      rd: null,
      observedAt: deps.now(),
      nullifier: null,
      outcome: `refused:${NO_AGREEMENT.code}`,
      txHash: null,
    });
  }
  return refused(giftId, NO_AGREEMENT.code, undefined, NO_AGREEMENT.message);
}

/**
 * A closed account, written down where the gift's pages read it (U1). Nothing is sent to the contract: the gift is
 * held until its deadline, and the whole amount goes back to the funder then, exactly as for a target not reached.
 */
async function accountClosed(giftId: string, username: string, deps: MilestoneReadingDeps): Promise<MilestoneOutcome> {
  await deps.record({
    giftId,
    purpose: "look",
    attested: false,
    username,
    playerId: null,
    rating: null,
    ratedAt: null,
    rd: null,
    observedAt: deps.now(),
    nullifier: null,
    outcome: "refused:ACCOUNT_CLOSED",
    txHash: null,
  });
  return refused(giftId, "ACCOUNT_CLOSED");
}

function readingOf(giftId: string, purpose: ReadingPurpose, attested: AttestedClimbReading, outcome: MilestoneReading["outcome"], txHash: Hex | null): MilestoneReading {
  return {
    giftId,
    purpose,
    attested: true,
    username: attested.username,
    playerId: attested.playerId,
    rating: attested.rating,
    ratedAt: attested.ratedAt,
    rd: attested.rd,
    observedAt: attested.observedAt,
    nullifier: attested.nullifier,
    outcome,
    txHash,
    proofs: attested.proofs,
  };
}

/** How the journal names a reading the contract refused because readings were paused. */
export const HELD_BY_A_PAUSE = "refused:ProofIsPaused";

/**
 * The newest reading a pause kept from being sent that could still settle the gift: attested, of the player the gift is
 * bound to, at or past the target, newer than the last reading the contract took, and taken by the moment the contract
 * judges a reading by, which on the second version is the end of the pause when the deadline fell inside it.
 */
async function heldByAPause(record: GiftRecord, state: MilestoneState, target: number, deps: MilestoneReadingDeps): Promise<MilestoneReading | null> {
  if (!deps.attested) return null;
  const takenBy = state.version === 2 ? readingTakenBy(state.deadline, { began: state.proofPauseBegan, until: state.proofResumedAt }) : state.deadline;
  const readings = await deps.attested(record.giftId);
  for (const reading of [...readings].reverse()) {
    if (reading.outcome !== HELD_BY_A_PAUSE || reading.rating === null || reading.nullifier === null || reading.playerId === null) continue;
    if (reading.playerId !== record.goalProfileId || reading.rating < target) continue;
    if (reading.observedAt > takenBy || reading.observedAt <= state.lastProofAt) continue;
    return reading;
  }
  return null;
}

/**
 * How close to its deadline a gift is read with a proof even when the look failed: its last day. Until then a pass that
 * asks for it (`lookMustSucceed`) stops at a look that failed.
 */
export const LOOK_MAY_FAIL_IN_THE_LAST_SECONDS = 86_400;

export async function runMilestoneReading(
  input: {
    giftId: string;
    purpose: "start" | "reach";
    force?: boolean;
    recentSeconds?: number;
    /**
     * Set by the pass that runs every five minutes (src/frequent-pass.ts; the audit of 1 Oct 2026, F-08): when the
     * look fails, a limit met, a wait that ran out, a body that cannot be read, no proof is paid for and the reading
     * stops there. Otherwise a source that falters for an hour costs two attested fetches per gift every five minutes
     * and uses up the month's allowance, after which nothing attested can be read for anybody. It is lifted in a
     * gift's last day, and never set for a reading a person asks for: there the proof is still taken.
     */
    lookMustSucceed?: boolean;
  },
  deps: MilestoneReadingDeps = liveMilestoneReadingDeps(),
): Promise<MilestoneOutcome> {
  const { giftId, purpose } = input;
  const record = await deps.loadGift(giftId);
  if (!record || !record.recipient) return { kind: "already", giftId, reason: "not_opened" };
  if (!record.goalUsername) return { kind: "already", giftId, reason: "no_account" };
  if (purpose === "start" && record.boundAt) return { kind: "already", giftId, reason: "already_bound" };
  if (purpose === "reach" && !record.boundAt) return { kind: "already", giftId, reason: "not_bound" };

  const contract = escrowOf(record);
  const state = await deps.readState(contract, giftId);
  const now = deps.now();
  const phase = milestonePhase(state, now);
  if (phase === "cancelled") return { kind: "already", giftId, reason: "cancelled" };
  if (phase === "reached" || phase === "returned") return { kind: "already", giftId, reason: "finished" };
  if (purpose === "start" && phase !== "opened") return { kind: "already", giftId, reason: "already_bound" };
  if (purpose === "reach") {
    if (phase === "startTooHigh") return { kind: "already", giftId, reason: "start_too_high" };
    if (phase !== "climbing" && phase !== "overdue") return { kind: "already", giftId, reason: "not_bound" };
  }
  // No reading that moves money without the recipient's yes, and none after their stop (the founder, 29 Sep 2026).
  const leave = deps.leave ? await deps.leave(giftId, state.fundedAt) : null;
  if (leave && !leave.allowed) return phase === "overdue" ? { kind: "already", giftId, reason: "deadline_passed" } : noAgreement(giftId, record.goalUsername, deps);
  const mode = climbOfGoal(state.goalType);
  if (!mode) return refused(giftId, "NOT_CONFIGURED");
  const username = record.goalUsername;
  const target = Number(state.target);

  if (purpose === "reach" && (phase === "overdue" || state.proofPaused)) {
    const held = await heldByAPause(record, state, target, deps);
    // While readings are paused, one reading that reached the target is enough: it is kept, and no proof is paid for
    // again at every pass. Nothing can be sent until they reopen.
    if (state.proofPaused && held) return refused(giftId, "PAUSED", held.rating ?? undefined, milestoneRefusal("ProofIsPaused")?.message);
    if (phase === "overdue") {
      // Past the moment a reading is judged by, nothing read now can count. What a pause kept from being sent can:
      // signed again and sent, and the contract says whether it is still inside the grace.
      if (state.proofPaused || !held) return { kind: "already", giftId, reason: "deadline_passed" };
      return prove(record, state, contract, { username: held.username, playerId: held.playerId as string, status: "", name: null, mode, rating: held.rating as number, ratedAt: held.ratedAt ?? 0, rd: held.rd ?? null, observedAt: held.observedAt, nullifier: held.nullifier as Hex, proofs: [] }, "reach", deps);
    }
  }

  if (purpose === "start") {
    // D27, the rule both sources share: a code proves control only when the recipient named the account themselves.
    // When the funder named it, that name is what they signed for, and the first attested reading binds the player
    // straight away: nobody is asked to put anything in their own profile, and a profile with no name works.
    const provesItsOwn = record.usernameSource === "recipient";
    if (provesItsOwn && (!record.bindingCode || !record.bindingCodeExpiresAt || record.bindingCodeExpiresAt.getTime() < now * 1_000)) {
      return refused(giftId, "CODE_EXPIRED");
    }
    let reading: AttestedClimbReading;
    try {
      reading = await deps.attest({ username, mode, withName: provesItsOwn });
    } catch (error) {
      if (isClimbReadError(error) && error.code === "ACCOUNT_CLOSED") return accountClosed(giftId, username, deps);
      if (isClimbReadError(error)) return refused(giftId, error.code);
      throw error;
    }
    if (provesItsOwn && !nameHasChessCode(reading.name, record.bindingCode ?? "")) return refused(giftId, "CODE_NOT_IN_NAME", reading.rating);
    // Above the most the funder said it may start from, a start could never settle: nothing is sent and nothing is
    // started (the audit, 29 Sep 2026). The reading is written down unsent, so the two people read why, and a later
    // reading at the cap or below can still start it.
    if (BigInt(reading.rating) > state.maximumStart) {
      await deps.record({
        giftId,
        purpose: "look",
        attested: false,
        username: reading.username,
        playerId: reading.playerId,
        rating: reading.rating,
        ratedAt: reading.ratedAt,
        rd: reading.rd,
        observedAt: reading.observedAt,
        nullifier: null,
        outcome: "refused:START_TOO_HIGH",
        txHash: null,
      });
      return refused(giftId, "START_TOO_HIGH", reading.rating, MILESTONE_ACTIONS.startAboveCapMine(reading.rating, Number(state.maximumStart)).join(" "));
    }
    return prove(record, state, contract, reading, "start", deps);
  }

  // A pass skips a gift read this recently; the frequent pass looks back less far than the nightly ones.
  if (!input.force && (await deps.readRecently(giftId, now - (input.recentSeconds ?? RECENT_READING_SECONDS)))) return { kind: "already", giftId, reason: "read_recently" };

  // Look first. Below the target nothing can move, so no proof is paid for; any failure to look goes on to the proof.
  try {
    const standing = await deps.plain(username, mode);
    if (standing.playerId !== record.goalProfileId) return refused(giftId, "OTHER_PLAYER", standing.rating ?? undefined);
    if (standing.rating !== null && standing.rating < target) {
      const look: MilestoneReading = {
        giftId,
        purpose: "look",
        attested: false,
        username: standing.username,
        playerId: standing.playerId,
        rating: standing.rating,
        ratedAt: standing.ratedAt,
        rd: standing.rd,
        observedAt: now,
        nullifier: null,
        outcome: "notYet",
        txHash: null,
      };
      // The same look as the last one is not a new line of the journal: its moment is brought up to now.
      if (!deps.sameLookAgain || !(await deps.sameLookAgain(look))) await deps.record(look);
      return { kind: "notYet", giftId, rating: standing.rating, target, attested: false };
    }
  } catch (error) {
    // A name that no longer resolves, or an account Chess.com has closed, is a fact about the account: the proof would
    // say the same thing, so no proof is paid for.
    if (isClimbReadError(error) && error.code === "PROFILE_NOT_FOUND") return refused(giftId, "PROFILE_NOT_FOUND");
    if (isClimbReadError(error) && error.code === "ACCOUNT_CLOSED") return accountClosed(giftId, username, deps);
    if (!isClimbReadError(error)) throw error;
    // The look itself failed. A pass that asked for it stops here, except in the gift's last day.
    const lastDay = state.deadline > 0 && now >= state.deadline - LOOK_MAY_FAIL_IN_THE_LAST_SECONDS;
    if (input.lookMustSucceed && !lastDay) return refused(giftId, error.code);
  }

  let reading: AttestedClimbReading;
  try {
    reading = await deps.attest({ username, mode, withName: false });
  } catch (error) {
    if (isClimbReadError(error) && error.code === "ACCOUNT_CLOSED") return accountClosed(giftId, username, deps);
    if (isClimbReadError(error)) return refused(giftId, error.code);
    throw error;
  }
  if (reading.playerId !== record.goalProfileId) return refused(giftId, "OTHER_PLAYER", reading.rating);
  if (reading.rating < target) {
    // Attested and short: the contract would refuse it and keep nothing, so it is recorded here and never sent.
    await deps.record(readingOf(giftId, "reach", reading, "notYet", null));
    return { kind: "notYet", giftId, rating: reading.rating, target, attested: true };
  }
  return prove(record, state, contract, reading, "reach", deps);
}

async function prove(
  record: GiftRecord,
  state: MilestoneState,
  contract: Hex,
  reading: AttestedClimbReading,
  purpose: "start" | "reach",
  deps: MilestoneReadingDeps,
): Promise<MilestoneOutcome> {
  const giftId = record.giftId;
  const now = deps.now();
  const mode = reading.mode;
  const message: MilestoneProofMessage = {
    giftId: BigInt(giftId),
    recipient: getAddress(record.recipient!),
    identityHash: deps.identity(reading.playerId, mode),
    providerId: climbProviderId(mode),
    metricValue: BigInt(reading.rating),
    eventAt: 0n,
    observedAt: BigInt(reading.observedAt),
    nullifier: reading.nullifier,
    issuedAt: BigInt(now),
    expiresAt: BigInt(now + MILESTONE_ATTESTATION_TTL_SECONDS),
  };
  try {
    const proved = await deps.prove({ contract, message });
    // Bound before anything else is written: the contract has started, and every later reading needs the player.
    if (proved.happened === "started") await deps.markBound(giftId, reading.playerId);
    await deps.record(readingOf(giftId, purpose, reading, proved.happened, proved.hash));
    if (proved.happened === "started") {
      return { kind: "started", giftId, rating: reading.rating, hash: proved.hash, aboveAccepted: BigInt(reading.rating) > state.maximumStart, deadline: proved.deadline ?? 0 };
    }
    return { kind: "reached", giftId, rating: reading.rating, hash: proved.hash };
  } catch (error) {
    // The second version takes the start of a climb only with the recipient's own signature: it is held, with the
    // row its journal will carry once it is sent, and asked for.
    if (error instanceof StartNotSigned && deps.hold) {
      return deps.hold(error, {
        account: message.recipient,
        message: Object.fromEntries(Object.entries(message).map(([key, value]) => [key, typeof value === "bigint" ? value.toString() : value])),
        after: { bindTo: reading.playerId, reading: readingOf(giftId, purpose, reading, "started", null) as unknown as Record<string, unknown>, maximumStart: state.maximumStart.toString() },
      });
    }
    if (error instanceof RelayerError && error.code === "REVERTED") {
      const name = error.contractError ?? "REFUSED";
      await deps.record(readingOf(giftId, purpose, reading, `refused:${name}`, null));
      const mapped = milestoneRefusal(error.contractError);
      return refused(giftId, mapped?.code ?? name, reading.rating, mapped?.message);
    }
    throw error;
  }
}
