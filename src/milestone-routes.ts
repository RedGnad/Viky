import { NextResponse } from "next/server";
import { getAddress, isAddress, type Hex } from "viem";
import { readAccountAuthSession } from "./account-auth-server";
import { attestChessRating, ChessReadError, newChessCode } from "./chess-reading";
import { GiftApiError, NO_STORE } from "./gift-api";
import { holdsGiftLink, loadGift, loadRelayed, markClaimed, type GiftRecord } from "./gift-store";
import { milestoneById, cadenceOfGoal, CHESS_MILESTONE } from "./milestone-conditions";
import { runMilestoneReading } from "./milestone-reading";
import { relayMilestoneClaim, relayMilestoneWithdraw } from "./milestone-relay";
import { loadMilestoneStatus } from "./milestone-status";
import type { MilestoneStatus } from "./milestone-view";
import { followRename, loadMilestoneGift, setMilestoneCode } from "./milestone-store";
import { chessClimbOfGoal } from "./chess-com";
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
  const holdsTheLink = holdsGiftLink(record, reader.linkKey);
  const { status } = await loadMilestoneStatus(record, { isRecipient, isFunder, holdsTheLink });
  return { ...status, recorded: relayed.map((entry) => ({ kind: entry.kind, txHash: entry.txHash, blockNumber: entry.blockNumber?.toString() ?? null })) };
}

export async function milestoneStatusResponse(request: Request, record: GiftRecord): Promise<NextResponse> {
  const status = await milestoneStatusFor(record, { account: viewerOf(request), linkKey: new URL(request.url).searchParams.get("t") });
  return NextResponse.json(status, { headers: NO_STORE });
}

export async function milestoneClaim(input: { record: GiftRecord; recipient: string }): Promise<NextResponse> {
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
  const mode = chessClimbOfGoal(state.goalType);
  if (!mode || !cadenceOfGoal(milestone, state.goalType)) throw new GiftApiError("NOT_CONFIGURED", "Viky is not ready for this yet. Nothing was changed.", 503);
  try {
    const reading = await attestChessRating({ username, mode, withName: false });
    if (reading.playerId !== record.goalProfileId) throw new GiftApiError("OTHER_PLAYER", "That name belongs to another Chess.com player than the one this gift is for.", 409);
    await followRename(giftId, reading.playerId, reading.username);
    return NextResponse.json({ giftId, username: reading.username }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof ChessReadError && error.code === "PROFILE_NOT_FOUND") throw new GiftApiError("NO_SUCH_PROFILE", milestone.words.refusals.notFound, 404);
    if (error instanceof ChessReadError) throw new GiftApiError("SOURCE_UNAVAILABLE", milestone.words.refusals.unavailable, 503);
    throw error;
  }
}

export async function milestoneBind(request: Request, giftId: string): Promise<NextResponse> {
  const auth = readAccountAuthSession(request);
  recipientRecord(await loadGift(giftId), auth.account);
  return NextResponse.json(await runMilestoneReading({ giftId, purpose: "start" }), { headers: NO_STORE });
}

export async function milestoneCount(request: Request, giftId: string): Promise<NextResponse> {
  const auth = readAccountAuthSession(request);
  recipientRecord(await loadGift(giftId), auth.account);
  return NextResponse.json(await runMilestoneReading({ giftId, purpose: "reach", force: true }), { headers: NO_STORE });
}

export async function milestoneWithdraw(input: {
  account: string;
  giftId: string;
  to: string;
  amount: bigint;
  nonce: bigint;
  deadline: bigint;
  signature: Hex;
}): Promise<NextResponse> {
  const record = await loadGift(input.giftId);
  if (!record) throw new GiftApiError("UNKNOWN_GIFT", "Unknown gift", 404);
  if (!isAddress(input.to)) throw new GiftApiError("INVALID_DESTINATION", "The destination is invalid");
  const contract = escrowOf(record);
  const state = await readMilestoneGift(contract, input.giftId);
  if (!state.recipient || state.recipient.toLowerCase() !== input.account.toLowerCase()) throw new GiftApiError("NOT_YOURS", "Only the person the gift is for can take it", 403);
  if (input.amount <= 0n || input.amount > state.earnedBalance) throw new GiftApiError("NOT_ENOUGH_EARNED", "That is more than what is yours so far", 409);
  const result = await relayMilestoneWithdraw({ ...input, contract, to: getAddress(input.to) });
  return NextResponse.json({ giftId: input.giftId, sent: true, amount: input.amount.toString(), hash: result.hash }, { headers: NO_STORE });
}
