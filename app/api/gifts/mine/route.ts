import { NextResponse } from "next/server";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { giftsOf } from "@/src/my-gifts";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The gifts of the signed-in account, as funder or recipient, read from the contract. What it answers is built in
 * `src/my-gifts.ts`, which Home reads directly while it renders (D160); this route is what the browser asks when it
 * comes back to a screen it already has.
 */
export async function GET(request: Request) {
  try {
    const rate = checkRateLimit("status", request);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const auth = readAccountAuthSession(request);
    return NextResponse.json({ account: auth.account, gifts: await giftsOf(auth.account) }, { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
