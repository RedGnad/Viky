import { NextResponse } from "next/server";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { fitbitConnectConfigured, fitbitGiftOf } from "@/src/connect-fitbit";
import { connectionInWords, loadConnection } from "@/src/connection-store";
import { giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** What the recipient's screen may know of their connection: that it exists and since when, and whether connecting is open at all. */
export async function GET(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("status", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const giftId = new URL(request.url).searchParams.get("giftId") ?? "";
    const gift = await fitbitGiftOf(giftId, auth.account);
    const connection = await loadConnection(giftId);
    return NextResponse.json({ ...connectionInWords(connection), bound: gift.boundAt !== null, configured: fitbitConnectConfigured() }, { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
