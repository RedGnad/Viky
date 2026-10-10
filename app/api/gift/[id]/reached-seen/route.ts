import { NextResponse } from "next/server";
import { assertSameOrigin } from "@/src/api-guard";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { loadGift } from "@/src/gift-store";
import { isMilestoneGiftId } from "@/src/milestone-protocol";
import { readMilestoneGift } from "@/src/milestone-reader";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";
import { markReachedSeen, reachedSeenOf } from "@/src/reached-seen-store";
import { escrowOf } from "@/src/relayer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Whether the signed-in account has had the moment of a reached gift, and the write that says it has (the founder,
 * 29 Sep 2026): once for the person it is for and once for the funder, whichever device they arrive on. Only those two
 * are answered, the recipient as the chain knows it rather than as a screen says it.
 */
async function yours(request: Request, context: { params: Promise<{ id: string }> }): Promise<{ account: string; giftId: string }> {
  const auth = readAccountAuthSession(request);
  const { id } = await context.params;
  if (!/^\d{1,78}$/.test(id) || !isMilestoneGiftId(id)) throw new GiftApiError("INVALID_REQUEST", "Please try again");
  const record = await loadGift(id);
  if (!record) throw new GiftApiError("UNKNOWN_GIFT", "That gift cannot be found.", 404);
  const account = auth.account.toLowerCase();
  if (record.funder.toLowerCase() !== account) {
    const state = await readMilestoneGift(escrowOf(record), id);
    if (state.recipient?.toLowerCase() !== account) throw new GiftApiError("NOT_YOURS", "This gift is not yours.", 403);
  }
  return { account, giftId: id };
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const rate = checkRateLimit("status", request);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const { account, giftId } = await yours(request, context);
    return NextResponse.json({ seen: (await reachedSeenOf(account, [giftId])).has(giftId) }, { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const rate = checkRateLimit("status", request);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const { account, giftId } = await yours(request, context);
    await markReachedSeen(account, giftId);
    return NextResponse.json({ seen: true }, { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
