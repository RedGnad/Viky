import { NextResponse } from "next/server";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { openWithdrawalOf } from "@/src/open-withdrawal";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The withdrawal the signed-in account has open, or none (src/open-withdrawal.ts): what the way out reads before it
 * says that money is ready for a payout service. The account is the session's, never one the browser names.
 */
export async function GET(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("status", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly.", code: "RATE_LIMITED" }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const open = await openWithdrawalOf(auth.account);
    return NextResponse.json({ open: open ? { coin: open.coin, atLeast: open.atLeast.toString(), sinceMs: open.sinceMs } : null }, { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
