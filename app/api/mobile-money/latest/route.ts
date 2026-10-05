import { NextResponse } from "next/server";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { latestPayout } from "@/src/mobile-money-server";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The payout the way out still owes this account a screen for, or none: the last one money left for, while it is not
 * finished or was not yet seen finished. The account is the session's, and the payout is read from the ledger.
 */
export async function GET(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("status", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    return NextResponse.json({ payout: await latestPayout(auth.account) }, { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
