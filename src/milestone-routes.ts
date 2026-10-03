import { NextResponse } from "next/server";
import { getAddress, isAddress, type Hex } from "viem";
import { readAccountAuthSession } from "./account-auth-server";
import { assertNotTooSmall, countedIfSent, type Admission } from "./relay-admission";
import { newChessCode } from "./chess-reading";
import { readingFor } from "./attested-calls";
import { attestClimbRating, climbFetches, isClimbReadError, readClimbStanding } from "./climb-reading";
import { GiftApiError, NO_STORE, refuseOwnGift } from "./gift-api";
import { loadGift, loadRelayed, markClaimed, reconcileClaim, type GiftRecord } from "./gift-store";
import { assertWithdrawStands } from "./relay-free-checks";
import { holdsTheLinkOf } from "./v2-opening";
import { milestoneById, cadenceOfGoal, CHESS_MILESTONE } from "./milestone-conditions";
import { runMilestoneReading } from "./milestone-reading";
import { tellAboutMilestone } from "./morning-send";
import { liveTellingDeps } from "./morning-send-live";
import { relayMilestoneClaim, relayMilestoneWithdraw } from "./milestone-relay";
import { loadMilestoneStatus } from "./milestone-status";
import type { MilestoneStatus } from "./milestone-view";
import { followRename, loadMilestoneGift, setMilestoneCode } from "./milestone-store";
import { climbOfGoal } from "./climbs";
import { readMilestoneGift } from "./milestone-reader";
import { escrowOf } from "./relayer";

/**
 * The milestone half of the gift routes (C2). Each gift route asks `isMilestoneGiftId` first and hands a milestone gift
 * here, so a person's link, their page and their buttons stay the same whichever contract holds the gift, and the daily
 * routes never read a milestone gift with the daily contract's ABI.
 */

/** How long the Chess.com code stays valid, the same hour as the Duolingo code. */
export const MILESTONE_CODE_TTL_SECONDS = 60 * 60;

function viewerOf(request: Request): string | null {
  try {
    return readAccountAuthSession(request).account.toLowerCase();
  } catch {
    return null;
  }
}

export type RecordedRelay = Readonly<{ kind: string; txHash: string; blockNumber: string | null }>;

/**
 * The state of a milestone gift for its page, for whoever is reading. The names and the code follow a daily gift's
 * rules. Separate from the response around it so the page can read it while it renders (D160).
 */
export async function milestoneStatusFor(
  record: GiftRecord,
  reader: Readonly<{ account: string | null; linkKey: string | null }>,
): Promise<MilestoneStatus & { recorded: readonly RecordedRelay[] }> {
  const viewer = reader.account?.toLowerCase() ?? null;
  const [state, relayed] = await Promise.all([readMilestoneGift(escrowOf(record), record.giftId), loadRelayed(record.giftId)]);
  const isRecipient = viewer !== null && state.recipient !== null && viewer === state.recipient.toLowerCase();
  const isFunder = viewer !== null && viewer === state.funder.toLowerCase();
  const holdsTheLink = holdsTheLinkOf(record, reader.linkKey);
  // An opening the contract holds and the database missed is written down as the gift is read.
  const kept = await reconcileClaim(record, state.recipient, relayed.find((entry) => entry.kind === "claim")?.txHash ?? null);
  const { status } = await loadMilestoneStatus(kept, { isRecipient, isFunder, holdsTheLink });
  return { ...status, recorded: relayed.map((entry) => ({ kind: entry.kind, txHash: entry.txHash, blockNumber: entry.blockNumber?.toString() ?? null })) };
}

export async function milestoneStatusResponse(request: Request, record: GiftRecord): Promise<NextResponse> {
  const status = await milestoneStatusFor(record, { account: viewerOf(request), linkKey: new URL(request.url).searchParams.get("t") });
  return NextResponse.json(status, { headers: NO_STORE });
}

export async function milestoneClaim(input: { record: GiftRecord; recipient: string }): Promise<NextResponse> {
  refuseOwnGift(input.record, input.recipient);
  const result = await relayMilestoneClaim({ giftId: input.record.giftId, contract: escrowOf(input.record), recipient: getAddress(input.recipient), contactHash: input.record.contactHash });
  await markClaimed(input.record.giftId, input.recipient, result.hash);
  return NextResponse.json({ giftId: input.record.giftId, opened: true }, { headers: NO_STORE });
}

function recipientRecord(record: GiftRecord | null, account: string): GiftRecord {
  if (!record || !record.recipient || record.recipient.toLowerCase() !== account.toLowerCase()) throw new GiftApiError("NOT_RECIPIENT", "Open the gift first.", 403);
  return record;
}

/**
 * The recipient's side of the name. Before the first reading: a fresh code for the name the funder gave, which is part of
 * what they signed for and never changes here. After it: a new name, accepted only once an attested reading shows it
 * belongs to the same player, because Chess.com lets a person change their name every ninety days.
 */
export async function milestoneAccount(request: Request, giftId: string, body: { username?: string }): Promise<NextResponse> {
  const auth = readAccountAuthSession(request);
  const record = recipientRecord(await loadGift(giftId), auth.account);
  const milestone = milestoneById((await loadMilestoneGift(giftId))?.conditionId ?? "") ?? CHESS_MILESTONE;
  if (!record.boundAt) {
    // A code exists for one case only (D27): the recipient named the account themselves, so something has to prove it
    // is theirs. When the funder named it, there is nothing to prove here and nothing to put in a profile.
    if (record.usernameSource !== "recipient") throw new GiftApiError("NO_CODE_NEEDED", "This gift already knows the account it reads.", 409);
    const code = newChessCode(() => crypto.getRandomValues(new Uint8Array(1))[0]);
    const expiresAt = new Date(Date.now() + MILESTONE_CODE_TTL_SECONDS * 1_000);
    if (!(await setMilestoneCode(giftId, code, expiresAt))) throw new GiftApiError("ALREADY_BOUND", "This gift is already reading.", 409);
    return NextResponse.json({ giftId, username: record.goalUsername, code, expiresAt: expiresAt.toISOString() }, { headers: NO_STORE });
  }
  const username = String(body.username ?? "").trim();
  if (!milestone.validName(username)) throw new GiftApiError("INVALID_USERNAME", milestone.words.refusals.nameShape, 400);
  const state = await readMilestoneGift(escrowOf(record), giftId);
  const mode = climbOfGoal(state.goalType);
  if (!mode || !cadenceOfGoal(milestone, state.goalType)) throw new GiftApiError("NOT_CONFIGURED", "Viky is not ready for this yet. Nothing was changed.", 503);
  try {
    // The name is looked at plainly first (3 Oct 2026): a name that is another player's, or that cannot be looked at,
    // used to cost a proof at each try, two fetches on Chess.com. The attested reading is still what follows the name.
    const looked = await readClimbStanding(username, mode);
    if (looked.playerId !== record.goalProfileId) throw new GiftApiError("OTHER_PLAYER", "That name belongs to another Chess.com player than the one this gift is for.", 409);
    const reading = await readingFor({ giftId, reason: "a climb's new name, followed", fetches: climbFetches(mode) }, () => attestClimbRating({ username, mode, withName: false }));
    if (reading.playerId !== record.goalProfileId) throw new GiftApiError("OTHER_PLAYER", "That name belongs to another Chess.com player than the one this gift is for.", 409);
    await followRename(giftId, reading.playerId, reading.username);
    return NextResponse.json({ giftId, username: reading.username }, { headers: NO_STORE });
  } catch (error) {
    if (isClimbReadError(error) && error.code === "PROFILE_NOT_FOUND") throw new GiftApiError("NO_SUCH_PROFILE", milestone.words.refusals.notFound, 404);
    if (isClimbReadError(error)) throw new GiftApiError("SOURCE_UNAVAILABLE", milestone.words.refusals.unavailable, 503);
    throw error;
  }
}

export async function milestoneBind(request: Request, giftId: string): Promise<NextResponse> {
  const auth = readAccountAuthSession(request);
  recipientRecord(await loadGift(giftId), auth.account);
  return NextResponse.json(await runMilestoneReading({ giftId, purpose: "start" }), { headers: NO_STORE });
}

/**
 * A reading on opening the gift's page (the founder, 29 Sep 2026: the page reads the source each time it opens, and
 * "Count now" is gone), asked by either of the gift's two people: a reading only ever pays the person it is for, so the
 * funder watching it climb may start one too. When it is the reading that reaches the target, the two are told at once
 * rather than at the next pass; `claimTelling` makes sure they are told once.
 */
export async function milestoneCount(request: Request, giftId: string): Promise<NextResponse> {
  const auth = readAccountAuthSession(request);
  const record = await loadGift(giftId);
  if (!record || record.funder.toLowerCase() !== auth.account.toLowerCase()) recipientRecord(record, auth.account);
  const outcome = await runMilestoneReading({ giftId, purpose: "reach", force: true });
  if (outcome.kind === "reached") await tellAboutMilestone(giftId, "reached", liveTellingDeps()).catch(() => 0);
  return NextResponse.json(outcome, { headers: NO_STORE });
}

export async function milestoneWithdraw(
  input: {
    account: string;
    giftId: string;
    to: string;
    amount: bigint;
    nonce: bigint;
    deadline: bigint;
    signature: Hex;
  },
  /** Counts the request, once everything that costs nothing has been checked (src/relay-admission.ts). */
  admit: () => Promise<Admission>,
): Promise<NextResponse> {
  const record = await loadGift(input.giftId);
  if (!record) throw new GiftApiError("UNKNOWN_GIFT", "Unknown gift", 404);
  if (!isAddress(input.to)) throw new GiftApiError("INVALID_DESTINATION", "The destination is invalid");
  const contract = escrowOf(record);
  const state = await readMilestoneGift(contract, input.giftId);
  if (!state.recipient || state.recipient.toLowerCase() !== input.account.toLowerCase()) throw new GiftApiError("NOT_YOURS", "Only the person the gift is for can take it", 403);
  if (input.amount <= 0n || input.amount > state.earnedBalance) throw new GiftApiError("NOT_ENOUGH_EARNED", "That is more than what is yours so far", 409);
  assertNotTooSmall("takeOut", input.amount, state.earnedBalance);
  await assertWithdrawStands({ giftId: input.giftId, contract, recipient: input.account, to: getAddress(input.to), amount: input.amount, nonce: input.nonce, deadline: input.deadline, signature: input.signature }, state.withdrawNonce);
  const result = await countedIfSent(await admit(), () => relayMilestoneWithdraw({ ...input, contract, to: getAddress(input.to) }));
  return NextResponse.json({ giftId: input.giftId, sent: true, amount: input.amount.toString(), hash: result.hash }, { headers: NO_STORE });
}
