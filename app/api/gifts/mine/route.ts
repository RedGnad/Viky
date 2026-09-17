import { NextResponse } from "next/server";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { catchUpSecondsOf } from "@/src/catch-up";
import { giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { formatAusd, readGift, theirsSoFar } from "@/src/gift-reader";
import { loadGiftsOf, loadSettledDays } from "@/src/gift-store";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";
import { escrowOf } from "@/src/relayer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The gifts of the signed-in account, as funder or recipient, read from the contract. This is what lets
 * a person open Viky on a fresh device and find everything again from their passkey alone (the Mera
 * "stateless test"): nothing is kept on the device.
 */
export async function GET(request: Request) {
  try {
    const rate = checkRateLimit("status", request);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const auth = readAccountAuthSession(request);
    const records = await loadGiftsOf(auth.account);
    const recordedDays = await loadSettledDays(records.map((record) => record.giftId));
    const gifts = await Promise.all(
      records.map(async (record) => {
        const gift = await readGift(escrowOf(record), record.giftId);
        const role = record.funder.toLowerCase() === auth.account.toLowerCase() ? "funder" : "recipient";
        return {
          giftId: record.giftId,
          role,
          // What the card says the gift is for and whom, read from the register by the screen (C1): the goal type,
          // the name the funder gave when they gave one, and when it was made, so the newest comes first.
          goalType: gift.goalType,
          goalUsername: record.goalUsername,
          usernameSource: record.usernameSource,
          // The two names the card says "For" and "From" with. This account is the funder or the recipient.
          recipientName: record.recipientName,
          funderName: record.funderName,
          catchUpSeconds: catchUpSecondsOf(escrowOf(record)),
          // The keeper's record per day, so a card draws each day at its date (D86).
          days: recordedDays.get(record.giftId) ?? [],
          fundedAt: gift.fundedAt,
          startDay: gift.startDay,
          endDay: gift.endDay,
          amountDisplay: formatAusd(gift.amount),
          perDayDisplay: formatAusd(gift.perDay),
          durationDays: gift.durationDays,
          creditedDays: gift.creditedDays,
          missedDays: gift.drainedDays,
          opened: gift.recipient !== null,
          counting: record.boundAt !== null,
          finished: gift.finalised,
          cancelled: gift.cancelled,
          earnedDisplay: formatAusd(gift.earnedBalance),
          theirsDisplay: formatAusd(theirsSoFar(gift)),
          returnedDisplay: formatAusd(gift.refundedToFunder),
        };
      }),
    );
    // Newest first, by the moment the money went in, which is what "what's moving" shows first (structure, Home).
    gifts.sort((a, b) => b.fundedAt - a.fundedAt);
    return NextResponse.json({ account: auth.account, gifts }, { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
