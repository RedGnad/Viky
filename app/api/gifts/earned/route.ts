import { NextResponse } from "next/server";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { earnedInGiftsOf } from "@/src/earned-in-gifts";
import { giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** What the gifts made out to the signed-in account hold for it, for the way out to take first (D208). */
export async function GET(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("status", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly.", code: "RATE_LIMITED" }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    return NextResponse.json({ gifts: await earnedInGiftsOf(auth.account) }, { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
