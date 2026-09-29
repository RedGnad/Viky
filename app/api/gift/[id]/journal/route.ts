import { NextResponse } from "next/server";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { loadGift, type GiftRecord } from "@/src/gift-store";
import { isMilestoneGiftId } from "@/src/milestone-protocol";
import { dailyJournal, milestoneJournal } from "@/src/proof-journal";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The public journal of a gift (U2): for every settled day, what happened, the transaction that settled it, and the
 * fingerprint of the claim that earned it. Nothing here names anybody: the transaction is already on chain and the
 * fingerprint is the nullifier the contract stores against replay, so anybody can check the chain accepted that exact
 * claim, once, without ever seeing the proof, which carries the account's own words.
 *
 * It needs no sign-in, like the gift's state: the contract is public and the page is reached by a link.
 */
/** Whether the request is signed in as the gift's funder or the person it is for, as the gift's record names them. */
function readerIsOneOfTwo(request: Request, record: GiftRecord): boolean {
  try {
    const account = readAccountAuthSession(request).account.toLowerCase();
    return account === record.funder.toLowerCase() || account === record.recipient?.toLowerCase();
  } catch {
    return false;
  }
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const rate = checkRateLimit("status", request);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const { id } = await context.params;
    if (!/^\d{1,78}$/.test(id)) throw new GiftApiError("UNKNOWN_GIFT", "Unknown gift", 404);
    const record = await loadGift(id);
    if (!record) throw new GiftApiError("UNKNOWN_GIFT", "Unknown gift", 404);
    if (isMilestoneGiftId(id)) {
      // Why a reading was refused ("NOT_ENROLLED"...) says something about the person: only the funder and the person it
      // is for see it (the founder, 29 Sep 2026); anybody else sees that it was refused.
      const readings = await milestoneJournal(id);
      const insider = readerIsOneOfTwo(request, record);
      return NextResponse.json(
        { giftId: id, kind: "milestone", readings: insider ? readings : readings.map((reading) => ({ ...reading, outcome: reading.outcome.startsWith("refused:") ? "refused" : reading.outcome })) },
        { headers: NO_STORE },
      );
    }
    return NextResponse.json({ giftId: id, kind: "daily", days: await dailyJournal(id) }, { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
