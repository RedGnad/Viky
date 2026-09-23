import { NextResponse } from "next/server";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { readJsonBody } from "@/src/api-guard";
import { disconnectFitbit, fitbitGiftOf } from "@/src/connect-fitbit";
import { giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Disconnect and erase, from the recipient's own gift page (D188, rule 3): the key given back, the row gone. */
export async function POST(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("session", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const body = await readJsonBody<{ giftId?: unknown }>(request, 1_024);
    const giftId = String(body.giftId ?? "");
    await fitbitGiftOf(giftId, auth.account);
    const outcome = await disconnectFitbit(giftId);
    return NextResponse.json(outcome, { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
