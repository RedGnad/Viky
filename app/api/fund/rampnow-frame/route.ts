import { NextResponse } from "next/server";
import { getAddress } from "viem";
import { isCurrencyCode } from "@/src/currencies";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { rampnowFrameAddress, rampnowFrameOn } from "@/src/rampnow-frame";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The address of Rampnow's frame for the signed-in account (src/rampnow-frame.ts): the locked page, with the partner's
 * public key when `RAMPNOW_API_KEY` holds one here, and as it is when it holds none. The account is the session's,
 * never one the browser names, so the frame can only ever pay into the payer's own account. The amount is in euros,
 * or in the currency named with it (`currency` and `amount`, 9 Oct 2026).
 */
export async function GET(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("status", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const key = process.env.RAMPNOW_API_KEY ?? "";
    const params = new URL(request.url).searchParams;
    const euros = Number(params.get("euros") ?? "");
    const currency = params.get("currency") ?? "";
    const amount = Number(params.get("amount") ?? "");
    const ask = isCurrencyCode(currency) && Number.isFinite(amount) && amount > 0 ? { currency, amount } : undefined;
    const url = rampnowFrameOn() ? rampnowFrameAddress({ account: getAddress(auth.account), euros: Number.isFinite(euros) && euros > 0 ? euros : undefined, ask }, key) : null;
    if (!url) throw new GiftApiError("NOT_CONFIGURED", "Paying by card here is not open yet. Nothing was taken.", 503);
    return NextResponse.json({ url }, { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
