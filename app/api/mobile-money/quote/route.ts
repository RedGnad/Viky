import { NextResponse } from "next/server";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { readJsonBody } from "@/src/api-guard";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { assertWithinCorridor, liveSwitch, offerIn, switchRefusal } from "@/src/mobile-money-server";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What a payout of this many dollars gives on a mobile money account now, in the country's own currency: Switch's quote,
 * asked while the person looks, with the moment it was made. It moves nothing (docs.onswitch.xyz, read 2 Oct 2026).
 */
export async function POST(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("status", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const body = await readJsonBody<{ country?: string; units?: string }>(request, 1_024);
    let units: bigint;
    try {
      units = BigInt(String(body.units ?? ""));
    } catch {
      throw new GiftApiError("INVALID_REQUEST", "Please try again");
    }
    const offer = await offerIn(String(body.country ?? ""));
    if (!offer.offered) throw new GiftApiError("NOT_OFFERED", "Mobile money is not offered for this country.", 409);
    assertWithinCorridor(units, offer);
    try {
      const quote = await liveSwitch.quote({ country: offer.country, units });
      return NextResponse.json({ local: quote.local, currency: quote.currency, at: quote.at, settlement: offer.settlement }, { headers: NO_STORE });
    } catch (error) {
      throw switchRefusal(error);
    }
  } catch (error) {
    return giftErrorResponse(error);
  }
}
