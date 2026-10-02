import { NextResponse } from "next/server";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { followPayout } from "@/src/mobile-money-server";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Where a payout stands, for its own account: the webhook's word, or Switch's status route when the webhook is late. */
export async function GET(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("status", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const reference = new URL(request.url).searchParams.get("reference") ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(reference)) throw new GiftApiError("UNKNOWN_PAYOUT", "No such payout for this account.", 404);
    return NextResponse.json(await followPayout({ reference, account: auth.account }), { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
