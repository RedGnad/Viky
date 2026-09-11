import { NextResponse } from "next/server";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { formatAusd, readGift } from "@/src/gift-reader";
import { loadGiftsOf } from "@/src/gift-store";
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
    const gifts = await Promise.all(
      records.map(async (record) => {
        const gift = await readGift(escrowOf(record), record.giftId);
        const role = record.funder.toLowerCase() === auth.account.toLowerCase() ? "funder" : "recipient";
        return {
          giftId: record.giftId,
          role,
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
          returnedDisplay: formatAusd(gift.refundedToFunder),
        };
      }),
    );
    return NextResponse.json({ account: auth.account, gifts }, { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
