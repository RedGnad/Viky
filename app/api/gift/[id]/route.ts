import { NextResponse } from "next/server";
import { catchUpSecondsOf } from "@/src/catch-up";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { checkInDayIndex, formatAusd, readGift, utcDayOf } from "@/src/gift-reader";
import { holdsGiftLink, lastRefundAt, loadGift, loadRelayed, loadSettledDays } from "@/src/gift-store";
import { milestoneErrorResponse } from "@/src/milestone-api";
import { isMilestoneGiftId } from "@/src/milestone-protocol";
import { milestoneStatusResponse } from "@/src/milestone-routes";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";
import { escrowOf } from "@/src/relayer";
import { readAccountAuthSession } from "@/src/account-auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The state of a gift for its screens: what is already the recipient's, what came back, which day it
 * is. Numbers are raw units plus a formatted dollar string; the transaction list serves the judges
 * page only. Reading a gift needs no sign-in: the contract is public and the page is reached by link.
 *
 * The two names are not public. Gift numbers follow each other, so anyone could read gift after gift; the names go
 * only to a request that carries the link's key, or to the funder or the recipient signed in. That is what the check
 * screen promises the funder: the names show to whoever has the link.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const rate = checkRateLimit("status", request);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const { id } = await context.params;
    if (!/^\d{1,78}$/.test(id)) throw new GiftApiError("UNKNOWN_GIFT", "Unknown gift", 404);

    const [record, relayed, recordedDays, refundedAt] = await Promise.all([loadGift(id), loadRelayed(id), loadSettledDays([id]), lastRefundAt(id)]);
    if (!record) throw new GiftApiError("UNKNOWN_GIFT", "Unknown gift", 404);
    // A milestone gift has its own contract and its own shape of state (C2): `kind: "milestone"` tells the page.
    if (isMilestoneGiftId(id)) return await milestoneStatusResponse(request, record).catch((error: unknown) => milestoneErrorResponse(error));
    const escrow = escrowOf(record);
    const gift = await readGift(escrow, id);
    const now = Math.floor(Date.now() / 1_000);
    const today = utcDayOf(now);
    const missedSoFar = gift.drainedDays;
    const opened = gift.recipient !== null;
    const connected = gift.startDay !== 0;
    let viewerIsRecipient = false;
    let viewerIsFunder = false;
    try {
      const session = readAccountAuthSession(request);
      viewerIsRecipient = gift.recipient !== null && session.account.toLowerCase() === gift.recipient.toLowerCase();
      viewerIsFunder = session.account.toLowerCase() === gift.funder.toLowerCase();
    } catch {
      viewerIsRecipient = false;
      viewerIsFunder = false;
    }
    const holdsTheLink = holdsGiftLink(record, new URL(request.url).searchParams.get("t"));
    const names = viewerIsRecipient || viewerIsFunder || holdsTheLink ? { recipientName: record.recipientName, funderName: record.funderName } : null;
    const goalAccount = {
      username: record?.goalUsername ?? null,
      source: record?.usernameSource ?? null,
      bound: record?.boundAt !== null && record?.boundAt !== undefined,
      code: viewerIsRecipient ? (record?.bindingCode ?? null) : null,
      codeExpiresAt: viewerIsRecipient ? (record?.bindingCodeExpiresAt?.toISOString() ?? null) : null,
    };
    return NextResponse.json(
      {
        giftId: id,
        // Which side of the gift the person reading this is on. Without it every screen showed the
        // recipient's words and the recipient's buttons to whoever was signed in, and a funder was offered a
        // "take it" the contract then refused.
        youAreTheRecipient: viewerIsRecipient,
        // Before anybody opens the gift the recipient is nobody, so "not the recipient" also describes the funder;
        // the page needs to know which of the two is reading (decision 13 of the drawn flows).
        youAreTheFunder: viewerIsFunder,
        kind: "daily",
        // How long a day stays catchable on the contract that holds this gift. The two live contracts do not
        // agree, which is a defect recorded in D50, so the screen is told rather than left to assume.
        catchUpSeconds: catchUpSecondsOf(escrow),
        // Used by the recipient's browser to sign a withdraw intent for the right contract; never displayed.
        escrow,
        goalAccount,
        names,
        goalType: gift.goalType,
        dailyTarget: gift.dailyTarget,
        durationDays: gift.durationDays,
        amount: gift.amount.toString(),
        amountDisplay: formatAusd(gift.amount),
        perDay: gift.perDay.toString(),
        perDayDisplay: formatAusd(gift.perDay),
        opened,
        connected,
        cancelled: gift.cancelled,
        finished: gift.finalised,
        creditedDays: gift.creditedDays,
        missedDays: missedSoFar,
        daysLeft: connected ? Math.max(0, gift.endDay - Math.max(today - 1, gift.settledThroughDay)) : gift.durationDays,
        earned: gift.earnedBalance.toString(),
        earnedDisplay: formatAusd(gift.earnedBalance),
        alreadyTheirs: (BigInt(gift.creditedDays) * gift.perDay).toString(),
        alreadyTheirsDisplay: formatAusd(BigInt(gift.creditedDays) * gift.perDay),
        returned: gift.refundedToFunder.toString(),
        returnedDisplay: formatAusd(gift.refundedToFunder),
        // What the recipient has already taken out of the gift, as the contract counts it.
        takenDisplay: formatAusd(gift.withdrawnByRecipient),
        // Which settled day was earned and which went back, from the keeper's record (D86); days settled before the
        // record existed are absent and the page falls back to the counts for them.
        days: recordedDays.get(id) ?? [],
        // When missed days were last sent back to the funder: the time of the last refund Viky relayed.
        lastReturnAtMs: refundedAt ? refundedAt.getTime() : null,
        claimedAtChain: gift.claimedAt,
        returnable: gift.refundableBalance.toString(),
        todayDayIndex: checkInDayIndex(gift, now),
        startDay: gift.startDay,
        endDay: gift.endDay,
        withdrawNonce: gift.withdrawNonce.toString(),
        funderIsRecipient: gift.recipient !== null && gift.recipient.toLowerCase() === gift.funder.toLowerCase(),
        recorded: relayed.map((entry) => ({ kind: entry.kind, txHash: entry.txHash, blockNumber: entry.blockNumber?.toString() ?? null })),
        createdAtChain: gift.fundedAt,
        hasRecord: record !== null,
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    return giftErrorResponse(error);
  }
}
