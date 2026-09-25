import { NextResponse } from "next/server";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { giftCardsFor, orderGiftCards, worksIn } from "@/src/bitrefill";
import { NO_STORE } from "@/src/gift-api";
import { phoneErrorResponse } from "@/src/phone-api";
import { localCurrencyOf, PhoneOrderError, PHONE_REFUSALS } from "@/src/phone-order";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The gift cards Bitrefill lists for a country (D271), in the founder's order, each with Bitrefill's own line on where
 * it works. Signed in and rate limited; the list is Bitrefill's, read when asked.
 */
export async function GET(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("verify", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const country = (new URL(request.url).searchParams.get("country") ?? "").toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) throw new PhoneOrderError("COUNTRY_NOT_SERVED", PHONE_REFUSALS.countryNotServed, 400);
    let cards;
    try {
      cards = orderGiftCards(await giftCardsFor(country), country, localCurrencyOf(country));
    } catch (error) {
      const { BitrefillError } = await import("@/src/bitrefill");
      if (error instanceof BitrefillError && error.code === "NOT_CONFIGURED") throw new PhoneOrderError("NOT_CONFIGURED", PHONE_REFUSALS.notConfigured, 503);
      if (error instanceof BitrefillError && error.code === "COUNTRY_NOT_SERVED") throw new PhoneOrderError("COUNTRY_NOT_SERVED", PHONE_REFUSALS.countryNotServed, 409);
      throw new PhoneOrderError("UNAVAILABLE", PHONE_REFUSALS.unavailable, 503);
    }
    return NextResponse.json({ cards: cards.map((card) => ({ id: card.id, name: card.name, worksIn: worksIn(card), currency: card.currency, packages: card.packages, range: card.range })) }, { headers: NO_STORE });
  } catch (error) {
    return phoneErrorResponse(error);
  }
}
