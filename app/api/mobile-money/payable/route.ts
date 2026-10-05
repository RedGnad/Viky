import { NextResponse } from "next/server";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { payableNow } from "@/src/mobile-money-server";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What the signed-in account can send to a number in its country now, in that country's money and with the cost of
 * changing it included: the bounds the amount opens between, and dollars already changed that a payout can leave from.
 * Asked when the card is opened, since it reads the balance, the exchange and Switch. It moves nothing.
 */
export async function GET(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("status", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const country = new URL(request.url).searchParams.get("country") ?? "";
    return NextResponse.json(await payableNow({ account: auth.account, country }), { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
