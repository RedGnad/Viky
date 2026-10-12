import { NextResponse } from "next/server";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { openWithdrawalOf } from "@/src/open-withdrawal";
import { relayCeilings } from "@/src/relay-ceiling";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The withdrawal the signed-in account has open, or none (src/open-withdrawal.ts): what the way out reads before it
 * says that money is ready for a payout service. The account is the session's, never one the browser names.
 *
 * And the smallest amount Viky sends at a time (`sendsAtLeast`, the founder, 12 Oct 2026): the figure the send route
 * refuses under, from the same setting, so the screen says it under the field before the press and never guesses it.
 */
export async function GET(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("status", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly.", code: "RATE_LIMITED" }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const open = await openWithdrawalOf(auth.account);
    return NextResponse.json({ open: open ? { coin: open.coin, atLeast: open.atLeast.toString(), sinceMs: open.sinceMs } : null, sendsAtLeast: relayCeilings().minimumUnits.toString() }, { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
