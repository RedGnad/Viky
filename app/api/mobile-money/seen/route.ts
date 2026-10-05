import { NextResponse } from "next/server";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { readJsonBody } from "@/src/api-guard";
import { giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { sawPayout } from "@/src/mobile-money-server";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Notes that the account was shown the end of one of its payouts, so the way out does not show it again. */
export async function POST(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("status", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const body = await readJsonBody<{ reference?: string }>(request, 512);
    const reference = String(body.reference ?? "");
    const noted = /^[0-9a-f-]{36}$/i.test(reference) ? await sawPayout({ reference, account: auth.account }) : false;
    return NextResponse.json({ noted }, { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
