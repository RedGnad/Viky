import { NextResponse } from "next/server";
import { getAddress } from "viem";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { readJsonBody } from "@/src/api-guard";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { kuruQuote, NATIVE_MON } from "@/src/kuru";
import { AUSD_ADDRESS } from "@/src/monad/chain";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The conversion the way out needs, for the signed-in account only: what a gift holds, turned into what a
 * payout service will take. The pair is fixed here rather than read from the request, so this can never be
 * used as a general exchange.
 */
export async function POST(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("status", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const body = await readJsonBody<{ amount?: string }>(request, 1_024);
    let amount: bigint;
    try {
      amount = BigInt(String(body.amount ?? ""));
    } catch {
      throw new GiftApiError("INVALID_REQUEST", "Please try again");
    }
    if (amount <= 0n) throw new GiftApiError("INVALID_REQUEST", "Please try again");
    const quote = await kuruQuote({ userAddress: getAddress(auth.account), tokenIn: AUSD_ADDRESS, tokenOut: NATIVE_MON, amount });
    return NextResponse.json(quote, { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
