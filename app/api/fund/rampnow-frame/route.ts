import { NextResponse } from "next/server";
import { getAddress } from "viem";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { rampnowFrameAddress, rampnowFrameOn } from "@/src/rampnow-frame";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The address of Rampnow's frame for the signed-in account (src/rampnow-frame.ts): the locked page, with the partner's
 * public key read from `RAMPNOW_API_KEY` here. The account is the session's, never one the browser names, so the frame
 * can only ever pay into the payer's own account.
 */
export async function GET(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("status", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const key = process.env.RAMPNOW_API_KEY ?? "";
    const euros = Number(new URL(request.url).searchParams.get("euros") ?? "");
    const url = rampnowFrameOn() ? rampnowFrameAddress({ account: getAddress(auth.account), euros: Number.isFinite(euros) && euros > 0 ? euros : undefined }, key) : null;
    if (!url) throw new GiftApiError("NOT_CONFIGURED", "Paying by card here is not open yet. Nothing was taken.", 503);
    return NextResponse.json({ url }, { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
