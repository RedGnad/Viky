import { NextResponse } from "next/server";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { finishStravaConnection } from "@/src/connect-strava";
import { connectCookie } from "@/src/connect-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Where Strava sends the person back (D191, on the model of Fitbit, D188), with what they allowed beside the code. The code is exchanged for the keys, the keys are sealed on the gift
 * the cookie names, and the person lands on their gift's page, which says connected or says why not. Nothing about
 * the key is ever in this URL, in a log, or on the page.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = process.env.NEXT_PUBLIC_APP_URL?.trim() || url.origin;
  let account = "";
  try {
    account = readAccountAuthSession(request).account;
  } catch {
    return NextResponse.redirect(`${origin}/?connect=signed-out`, { status: 303, headers: { "set-cookie": connectCookie("", 0) } });
  }
  const outcome = await finishStravaConnection({
    code: url.searchParams.get("code"),
    state: url.searchParams.get("state"),
    scope: url.searchParams.get("scope"),
    cookieHeader: request.headers.get("cookie"),
    account,
    nowSeconds: Math.floor(Date.now() / 1_000),
  });
  const target = outcome.giftId ? `${origin}/g/${outcome.giftId}?connect=${outcome.ok ? "done" : encodeURIComponent(outcome.code.toLowerCase())}` : `${origin}/gifts?connect=${encodeURIComponent(outcome.ok ? "done" : outcome.code.toLowerCase())}`;
  return NextResponse.redirect(target, { status: 303, headers: { "set-cookie": connectCookie("", 0), "cache-control": "no-store" } });
}
