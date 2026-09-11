import { NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { readJsonBody } from "@/src/api-guard";
import { requireOperator } from "@/src/dev-access";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { kuruQuote } from "@/src/kuru";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Operator only: the same quote as the funder screen, for any pair, used while running KT1 by hand. */
export async function POST(request: Request) {
  try {
    const auth = requireOperator(request);
    const rate = checkRateLimit("status", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const body = await readJsonBody<{ tokenIn?: string; tokenOut?: string; amount?: string }>(request, 1_024);
    const tokenIn = String(body.tokenIn ?? "");
    const tokenOut = String(body.tokenOut ?? "");
    if (!isAddress(tokenIn) || !isAddress(tokenOut)) throw new GiftApiError("INVALID_REQUEST", "Invalid pair");
    let amount: bigint;
    try {
      amount = BigInt(String(body.amount ?? ""));
    } catch {
      throw new GiftApiError("INVALID_REQUEST", "Invalid amount");
    }
    if (amount <= 0n) throw new GiftApiError("INVALID_REQUEST", "Invalid amount");
    const quote = await kuruQuote({ userAddress: getAddress(auth.account), tokenIn, tokenOut, amount });
    return NextResponse.json(quote, { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
