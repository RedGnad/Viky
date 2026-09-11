import { NextResponse } from "next/server";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { runPublicCheckIn } from "@/src/duolingo-public-checkin";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { loadGift } from "@/src/gift-store";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** A count on demand, for a person who does not want to wait for the daily pass. Same read, same proof. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const rate = checkRateLimit("verify", request);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const { id } = await context.params;
    const auth = readAccountAuthSession(request);
    const gift = await loadGift(id);
    if (!gift || !gift.recipient || gift.recipient.toLowerCase() !== auth.account.toLowerCase()) throw new GiftApiError("NOT_RECIPIENT", "Open the gift first.", 403);
    const outcome = await runPublicCheckIn({ giftId: id, purpose: "count", force: true });
    return NextResponse.json(outcome, { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
