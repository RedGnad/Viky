import { NextResponse } from "next/server";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { readJsonBody } from "@/src/api-guard";
import { isDisplayCurrency } from "@/src/display-currency";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { isAppearance, isCountry, loadPreferences, saveAppearance, saveCountry, saveDisplayCurrency } from "@/src/preferences-store";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** What this account chose for itself. Nothing chosen yet answers null, and the device proposes instead. */
export async function GET(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("status", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly.", code: "RATE_LIMITED" }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    return NextResponse.json(await loadPreferences(auth.account), { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}

/** The one change the account page offers: which currency this account reads its money in. */
export async function PUT(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("status", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly.", code: "RATE_LIMITED" }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    /** One route for what an account has chosen, and a call may carry either of the two (D159). */
    const body = await readJsonBody<{ displayCurrency?: unknown; appearance?: unknown; country?: unknown }>(request, 1_024);
    if (body.appearance !== undefined) {
      if (!isAppearance(body.appearance)) throw new GiftApiError("UNKNOWN_APPEARANCE", "Viky is shown by day or by night, and nothing else.");
      await saveAppearance(auth.account, body.appearance);
    }
    if (body.displayCurrency !== undefined) {
      if (!isDisplayCurrency(body.displayCurrency)) throw new GiftApiError("UNKNOWN_CURRENCY", "Viky cannot show money in that currency.");
      await saveDisplayCurrency(auth.account, body.displayCurrency);
    }
    // Where the person lives (D274): two letters, as every country is kept here.
    if (body.country !== undefined) {
      if (!isCountry(body.country)) throw new GiftApiError("UNKNOWN_COUNTRY", "That is not a country Viky knows.");
      await saveCountry(auth.account, body.country);
    }
    if (body.appearance === undefined && body.displayCurrency === undefined && body.country === undefined) throw new GiftApiError("NOTHING_TO_KEEP", "Nothing was chosen.");
    return NextResponse.json(await loadPreferences(auth.account), { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
