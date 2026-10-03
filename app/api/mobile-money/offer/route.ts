import { NextResponse } from "next/server";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { mostForAccount, offerIn } from "@/src/mobile-money-server";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Whether mobile money is offered for a country, and with what: its operators, its published time, its limits and the
 * rules of its fields, read from Switch. "Not offered" when the way is switched off, the country is not covered, or
 * Switch did not answer: the screen then shows no card at all.
 */
export async function GET(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("status", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const country = new URL(request.url).searchParams.get("country");
    const offer = await offerIn(country);
    // The most one payout may be now, by the two ceilings: asked only where the way is offered, since it reads the day's payouts.
    return NextResponse.json(offer.offered ? { ...offer, mostUnits: (await mostForAccount(auth.account)).toString() } : offer, { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
