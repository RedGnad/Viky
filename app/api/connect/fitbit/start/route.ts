import { NextResponse } from "next/server";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { readJsonBody } from "@/src/api-guard";
import { fitbitGiftOf, startFitbitConnection } from "@/src/connect-fitbit";
import { giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The one gesture of a connected condition (D188): the recipient asks to connect, and is sent to Fitbit's own page
 * with a state only this server can read back. The cookie carries the PKCE verifier and the gift; the answer carries
 * the URL and nothing else.
 */
export async function POST(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("session", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const body = await readJsonBody<{ giftId?: unknown }>(request, 1_024);
    const giftId = String(body.giftId ?? "");
    await fitbitGiftOf(giftId, auth.account);
    const { url, cookie } = startFitbitConnection({ giftId, account: auth.account, requestUrl: request.url, nowSeconds: Math.floor(Date.now() / 1_000) });
    return NextResponse.json({ url }, { headers: { ...NO_STORE, "set-cookie": cookie } });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
