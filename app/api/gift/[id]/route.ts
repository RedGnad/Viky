import { NextResponse } from "next/server";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { checkInDayIndex, formatAusd, readGift, utcDayOf } from "@/src/gift-reader";
import { loadGift, loadRelayed } from "@/src/gift-store";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";
import { escrowAddress } from "@/src/relayer";
import { readAccountAuthSession } from "@/src/account-auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The state of a gift for its screens: what is already the recipient's, what came back, which day it
 * is. Numbers are raw units plus a formatted dollar string; the transaction list serves the judges
 * page only. Reading a gift needs no sign-in: the contract is public and the page is reached by link.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const rate = checkRateLimit("status", request);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const { id } = await context.params;
    if (!/^\d{1,78}$/.test(id)) throw new GiftApiError("UNKNOWN_GIFT", "Unknown gift", 404);

    const [gift, record, relayed] = await Promise.all([readGift(escrowAddress(), id), loadGift(id), loadRelayed(id)]);
    const now = Math.floor(Date.now() / 1_000);
    const today = utcDayOf(now);
    const missedSoFar = gift.drainedDays;
    const opened = gift.recipient !== null;
    const connected = gift.startDay !== 0;
    let viewerIsRecipient = false;
    try {
      const session = readAccountAuthSession(request);
      viewerIsRecipient = gift.recipient !== null && session.account.toLowerCase() === gift.recipient.toLowerCase();
    } catch {
      viewerIsRecipient = false;
    }
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
        goalAccount,
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
