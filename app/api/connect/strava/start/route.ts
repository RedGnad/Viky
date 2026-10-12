import { NextResponse } from "next/server";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { readJsonBody } from "@/src/api-guard";
import { closedLineOf } from "@/src/closed-line";
import { STRAVA_DAILY } from "@/src/conditions";
import { stravaGiftOf, startStravaConnection } from "@/src/connect-strava";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
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
    // Nobody is sent to Strava's page for a line Strava's own rules closed (12 Oct 2026): the key it would give opens nothing.
    const closed = closedLineOf(STRAVA_DAILY);
    if (closed) throw new GiftApiError("CONDITION_CLOSED", closed, 409);
    const { url, cookie } = startStravaConnection({ giftId, account: auth.account, requestUrl: request.url, nowSeconds: Math.floor(Date.now() / 1_000) });
    return NextResponse.json({ url }, { headers: { ...NO_STORE, "set-cookie": cookie } });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
