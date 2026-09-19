import { getAddress, type Hex } from "viem";
import { CHESS_IDENTITY_LABEL, chessModeOfGoal, chessProviderId, type ChessMode } from "./chess-com";
import { attestChessRating, ChessReadError, nameHasChessCode, readChessStanding, type AttestedChessReading } from "./chess-reading";
import { identityPseudonym } from "./gift-attestation";
import { loadGift, markBound, type GiftRecord } from "./gift-store";
import { milestoneRefusal } from "./milestone-api";
import { MILESTONE_ATTESTATION_TTL_SECONDS, type MilestoneProofMessage } from "./milestone-protocol";
import { milestonePhase, readMilestoneGift, type MilestoneState } from "./milestone-reader";
import { relayProve, type ProvedReading } from "./milestone-relay";
import { readSince, recordReading, type MilestoneReading, type ReadingPurpose } from "./milestone-store";
import { escrowOf, RelayerError } from "./relayer";
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
  | Readonly<{ kind: "refused"; giftId: string; code: string; message: string; rating?: number }>;

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
  loadGift: (giftId: string) => Promise<GiftRecord | null>;
  readState: (contract: Hex, giftId: string) => Promise<MilestoneState>;
  plain: (username: string, mode: ChessMode) => Promise<ChessStanding>;
  attest: (input: { username: string; mode: ChessMode; withName: boolean }) => Promise<AttestedChessReading>;
  identity: (playerId: string) => Hex;
  prove: (input: { contract: Hex; message: MilestoneProofMessage }) => Promise<ProvedReading>;
  markBound: (giftId: string, playerId: string) => Promise<boolean>;
  record: (reading: MilestoneReading) => Promise<void>;
  readRecently: (giftId: string, sinceSeconds: number) => Promise<boolean>;
  now: () => number;
};

export function liveMilestoneReadingDeps(): MilestoneReadingDeps {
  return {
    loadGift,
    readState: (contract, giftId) => readMilestoneGift(contract, giftId),
    plain: (username, mode) => readChessStanding(username, mode),
    attest: (input) => attestChessRating(input),
    identity: (playerId) => identityPseudonym(CHESS_IDENTITY_LABEL, playerId),
    prove: relayProve,
    markBound,
    record: recordReading,
    readRecently: readSince,
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

function readingOf(giftId: string, purpose: ReadingPurpose, attested: AttestedChessReading, outcome: MilestoneReading["outcome"], txHash: Hex | null): MilestoneReading {
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

export async function runMilestoneReading(
  input: { giftId: string; purpose: "start" | "reach"; force?: boolean },
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
    if (phase === "overdue") return { kind: "already", giftId, reason: "deadline_passed" };
    if (phase !== "climbing") return { kind: "already", giftId, reason: "not_bound" };
  }
  const mode = chessModeOfGoal(state.goalType);
  if (!mode) return refused(giftId, "NOT_CONFIGURED");
  const username = record.goalUsername;
  const target = Number(state.target);

  if (purpose === "start") {
    // D27, the rule both sources share: a code proves control only when the recipient named the account themselves.
    // When the funder named it, that name is what they signed for, and the first attested reading binds the player
    // straight away: nobody is asked to put anything in their own profile, and a profile with no name works.
    const provesItsOwn = record.usernameSource === "recipient";
    if (provesItsOwn && (!record.bindingCode || !record.bindingCodeExpiresAt || record.bindingCodeExpiresAt.getTime() < now * 1_000)) {
      return refused(giftId, "CODE_EXPIRED");
    }
    let reading: AttestedChessReading;
    try {
      reading = await deps.attest({ username, mode, withName: provesItsOwn });
    } catch (error) {
      if (error instanceof ChessReadError && error.code === "ACCOUNT_CLOSED") return accountClosed(giftId, username, deps);
      if (error instanceof ChessReadError) return refused(giftId, error.code);
      throw error;
    }
    if (provesItsOwn && !nameHasChessCode(reading.name, record.bindingCode ?? "")) return refused(giftId, "CODE_NOT_IN_NAME", reading.rating);
    return prove(record, state, contract, reading, "start", deps);
  }

  if (!input.force && (await deps.readRecently(giftId, now - RECENT_READING_SECONDS))) return { kind: "already", giftId, reason: "read_recently" };

  // Look first. Below the target nothing can move, so no proof is paid for; any failure to look goes on to the proof.
  try {
    const standing = await deps.plain(username, mode);
    if (standing.playerId !== record.goalProfileId) return refused(giftId, "OTHER_PLAYER", standing.rating ?? undefined);
    if (standing.rating !== null && standing.rating < target) {
      await deps.record({
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
      });
      return { kind: "notYet", giftId, rating: standing.rating, target, attested: false };
    }
  } catch (error) {
    // A name that no longer resolves, or an account Chess.com has closed, is a fact about the account: the proof would
    // say the same thing, so no proof is paid for.
    if (error instanceof ChessReadError && error.code === "PROFILE_NOT_FOUND") return refused(giftId, "PROFILE_NOT_FOUND");
    if (error instanceof ChessReadError && error.code === "ACCOUNT_CLOSED") return accountClosed(giftId, username, deps);
    if (!(error instanceof ChessReadError)) throw error;
  }

  let reading: AttestedChessReading;
  try {
    reading = await deps.attest({ username, mode, withName: false });
  } catch (error) {
    if (error instanceof ChessReadError && error.code === "ACCOUNT_CLOSED") return accountClosed(giftId, username, deps);
    if (error instanceof ChessReadError) return refused(giftId, error.code);
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
  reading: AttestedChessReading,
  purpose: "start" | "reach",
  deps: MilestoneReadingDeps,
): Promise<MilestoneOutcome> {
  const giftId = record.giftId;
  const now = deps.now();
  const mode = reading.mode;
  const message: MilestoneProofMessage = {
    giftId: BigInt(giftId),
    recipient: getAddress(record.recipient!),
    identityHash: deps.identity(reading.playerId),
    providerId: chessProviderId(mode),
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
    if (error instanceof RelayerError && error.code === "REVERTED") {
      const name = error.contractError ?? "REFUSED";
      await deps.record(readingOf(giftId, purpose, reading, `refused:${name}`, null));
      const mapped = milestoneRefusal(error.contractError);
      return refused(giftId, mapped?.code ?? name, reading.rating, mapped?.message);
    }
    throw error;
  }
}
