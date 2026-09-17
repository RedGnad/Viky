import { NextResponse } from "next/server";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { loadGift } from "@/src/gift-store";
import { isMilestoneGiftId } from "@/src/milestone-protocol";
import { proofOfDay, proofOfReading } from "@/src/proof-journal";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The proof behind one settled day, or one milestone reading, for the two people the gift is between (U2).
 *
 * A Duolingo proof carries the account's username, its display name and its XP, and a Chess.com one its player name
 * and rating; Privacy promises the public sees only a pseudonym, so this is the one place they are handed over, and
 * only to the funder or the recipient signed in. Everyone else is refused, including somebody signed in with another
 * account, and including a reader holding the gift's link: the link opens the gift, it does not open the person.
 *
 * `?day=` for a daily gift, `?reading=` for a milestone one.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const rate = checkRateLimit("status", request);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const { id } = await context.params;
    if (!/^\d{1,78}$/.test(id)) throw new GiftApiError("UNKNOWN_GIFT", "Unknown gift", 404);
    const account = readAccountAuthSession(request).account.toLowerCase();
    const record = await loadGift(id);
    if (!record) throw new GiftApiError("UNKNOWN_GIFT", "Unknown gift", 404);
    const funder = record.funder?.toLowerCase();
    const recipient = record.recipient?.toLowerCase();
    if (account !== funder && account !== recipient) {
      throw new GiftApiError("NOT_IN_THIS_GIFT", "This proof is only for the two people this gift is between.", 403);
    }

    const asked = new URL(request.url).searchParams;
    const kept = isMilestoneGiftId(id)
      ? await proofOfReading(id, Number(asked.get("reading")))
      : await proofOfDay(id, Number(asked.get("day")));
    if (!kept) throw new GiftApiError("NO_PROOF_KEPT", "No proof is kept for that day.", 404);
    return NextResponse.json(kept, { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
