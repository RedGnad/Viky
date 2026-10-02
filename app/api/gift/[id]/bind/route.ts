import { NextResponse } from "next/server";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { readJsonBody } from "@/src/api-guard";
import { readDailyGift } from "@/src/daily-count";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { loadGift } from "@/src/gift-store";
import { resumeHeldStart } from "@/src/held-start";
import { milestoneErrorResponse } from "@/src/milestone-api";
import { isMilestoneGiftId } from "@/src/milestone-protocol";
import { milestoneBind } from "@/src/milestone-routes";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * The first attested read: proves control (recipient-named account), binds the identity, opens the window.
 *
 * On the second version of the contracts it is asked twice (src/held-start.ts; the review of 2 Oct 2026, R-15). The
 * first request reads, and is answered what the recipient's account is to sign: the reading is held, not sent. The
 * second carries that signature, and the held reading is sent with it. A request with a signature reads nothing.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const rate = checkRateLimit("verify", request);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const { id } = await context.params;
    if (!/^\d{1,78}$/.test(id)) throw new GiftApiError("UNKNOWN_GIFT", "Unknown gift", 404);
    // The second request of a first reading: the signature of the account the gift is for, over what is held.
    if ((await request.clone().text().catch(() => "")).includes("startSignature")) {
      const body = await readJsonBody<{ startSignature?: unknown }>(request, 1_024);
      const signed = readAccountAuthSession(request);
      const held = await loadGift(id);
      if (!held || !held.recipient || held.recipient.toLowerCase() !== signed.account.toLowerCase()) throw new GiftApiError("NOT_RECIPIENT", "Open the gift first.", 403);
      const signature = String(body.startSignature ?? "");
      if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) throw new GiftApiError("INVALID_SIGNATURE", "Please try again");
      return NextResponse.json(await resumeHeldStart({ giftId: id, account: signed.account, signature: signature as `0x${string}` }), { headers: NO_STORE });
    }
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
