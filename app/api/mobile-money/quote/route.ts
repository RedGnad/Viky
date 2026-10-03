import { NextResponse } from "next/server";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { readJsonBody } from "@/src/api-guard";
import { giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { priceInLocal } from "@/src/mobile-money-server";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What it takes to deliver the local amount the person typed, in francs for an account in Senegal (the founder,
 * 3 Oct 2026): Switch's quote for exactly that amount, asked while the person looks, with the dollars it counts and the
 * moment it was made. It moves nothing; the two ceilings are checked against it, and again when the payout is sent.
 */
export async function POST(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("status", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const body = await readJsonBody<{ country?: string; local?: number }>(request, 1_024);
    return NextResponse.json(await priceInLocal({ account: auth.account, country: String(body.country ?? ""), local: Number(body.local) }), { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
