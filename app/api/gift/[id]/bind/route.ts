import { NextResponse } from "next/server";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { readDailyGift } from "@/src/daily-count";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { loadGift } from "@/src/gift-store";
import { milestoneErrorResponse } from "@/src/milestone-api";
import { isMilestoneGiftId } from "@/src/milestone-protocol";
import { milestoneBind } from "@/src/milestone-routes";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** The first attested read: proves control (recipient-named account), binds the identity, opens the window. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const rate = checkRateLimit("verify", request);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const { id } = await context.params;
    // A milestone gift's first reading is its start, recorded on its own contract (C2).
    if (isMilestoneGiftId(id)) return await milestoneBind(request, id).catch((error: unknown) => milestoneErrorResponse(error));
    const auth = readAccountAuthSession(request);
    const gift = await loadGift(id);
    if (!gift || !gift.recipient || gift.recipient.toLowerCase() !== auth.account.toLowerCase()) throw new GiftApiError("NOT_RECIPIENT", "Open the gift first.", 403);
    // A public source is read by name, a connected one with the person's key: the dispatcher decides (D188).
    const outcome = await readDailyGift({ giftId: id, purpose: "bind" });
    return NextResponse.json(outcome, { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
