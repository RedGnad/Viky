import { NextResponse } from "next/server";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { readGift } from "@/src/gift-reader";
import { loadGift, rotateClaimToken } from "@/src/gift-store";
import { readMilestoneGift } from "@/src/milestone-reader";
import { isMilestoneGiftId } from "@/src/milestone-protocol";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";
import { escrowOf } from "@/src/relayer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * A link again, for the account that paid for the gift, while nobody has opened it (gift 1000001, 19 Sep 2026: the
 * funder closed the tab before copying the link and there was no way back).
 *
 * The key itself was never kept, only its hash, so nothing here hands the old link back: a new key is written and the
 * old link stops opening the gift from that moment. That is the whole reason this is a rotation and not a lookup, and
 * it is what the screen says before the funder asks for it.
 *
 * Two conditions, both checked, and the chain is asked rather than believed: the caller is the funder, and the gift
 * has no recipient yet. A gift somebody has already opened keeps the key they hold.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("verify", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });

    const { id } = await context.params;
    if (!/^\d{1,78}$/.test(id)) throw new GiftApiError("INVALID_REQUEST", "Please try again");
    const record = await loadGift(id);
    if (!record) throw new GiftApiError("UNKNOWN_GIFT", "That gift cannot be found.", 404);
    // Said the same way to a stranger and to the recipient: whether a gift exists is not something to learn by asking.
    if (record.funder.toLowerCase() !== auth.account.toLowerCase()) throw new GiftApiError("NOT_FUNDER", "Only the account that made this gift can ask for its link.", 403);

    const escrow = escrowOf(record);
    const state = isMilestoneGiftId(id) ? await readMilestoneGift(escrow, id) : await readGift(escrow, id);
    if (state.cancelled) throw new GiftApiError("GIFT_CANCELLED", "This gift has been taken back, so it has no link.", 409);
    if (state.recipient) throw new GiftApiError("ALREADY_OPENED", "This gift is already open, so its link cannot be changed.", 409);

    const token = await rotateClaimToken(id, auth.account);
    if (!token) throw new GiftApiError("ALREADY_OPENED", "This gift is already open, so its link cannot be changed.", 409);
    const origin = process.env.NEXT_PUBLIC_APP_URL?.trim() || new URL(request.url).origin;
    return NextResponse.json({ claimUrl: `${origin}/g/${id}?t=${token}` }, { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
