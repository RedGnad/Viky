import { NextResponse } from "next/server";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { readJsonBody } from "@/src/api-guard";
import { isDisplayCurrency } from "@/src/display-currency";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { loadPreferences, saveDisplayCurrency } from "@/src/preferences-store";
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
    const body = await readJsonBody<{ displayCurrency?: unknown }>(request, 1_024);
    if (!isDisplayCurrency(body.displayCurrency)) throw new GiftApiError("UNKNOWN_CURRENCY", "Viky cannot show money in that currency.");
    await saveDisplayCurrency(auth.account, body.displayCurrency);
    return NextResponse.json({ displayCurrency: body.displayCurrency }, { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
