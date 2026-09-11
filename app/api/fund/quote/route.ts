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
 * The one conversion the funder screen needs: what a funder bought with their card, turned into what a
 * gift holds, for the signed-in account only. The pair is fixed here rather than taken from the request,
 * so this route can never be used as a general exchange proxy.
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
    const quote = await kuruQuote({ userAddress: getAddress(auth.account), tokenIn: NATIVE_MON, tokenOut: AUSD_ADDRESS, amount });
    return NextResponse.json(quote, { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
