import { NextResponse } from "next/server";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { readJsonBody } from "@/src/api-guard";
import { STRAVA_DAILY } from "@/src/conditions";
import { stravaGiftOf, startStravaConnection } from "@/src/connect-strava";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { beingOpenedInWords, waitsToBeOpened } from "@/src/on-request";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The one gesture of a connected condition (D191, on the model of Fitbit, D188): the recipient asks to connect, and is sent to Strava's own page
 * with a state only this server can read back. The cookie carries the nonce and the gift (Strava takes no PKCE); the answer carries
 * the URL and nothing else.
 */
export async function POST(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("session", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const body = await readJsonBody<{ giftId?: unknown }>(request, 1_024);
    const giftId = String(body.giftId ?? "");
    await stravaGiftOf(giftId, auth.account);
    // Nobody is sent to Strava's page while the line is opened on request and is not open (12 Oct 2026): until the
    // operator opens it, the key Strava would give opens nothing.
    if (await waitsToBeOpened(STRAVA_DAILY.id)) throw new GiftApiError("CONDITION_ON_REQUEST", beingOpenedInWords(STRAVA_DAILY), 409);
    const { url, cookie } = startStravaConnection({ giftId, account: auth.account, requestUrl: request.url, nowSeconds: Math.floor(Date.now() / 1_000) });
    return NextResponse.json({ url }, { headers: { ...NO_STORE, "set-cookie": cookie } });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
