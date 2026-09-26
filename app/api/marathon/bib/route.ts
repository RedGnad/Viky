import { NextResponse } from "next/server";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { readJsonBody } from "@/src/api-guard";
import { isOperator } from "@/src/dev-access";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { loadGift, markBound, markConnectedAccount } from "@/src/gift-store";
import { bibStillOpen, isValidBib, marathonEventById } from "@/src/marathon";
import { loadMilestoneGift } from "@/src/milestone-store";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The person's bib, entered on their gift's page before the race starts (D273): the second of the three ties. The
 * field closes at the start, so a bib entered after is not taken; an operator's account may enter one after, which is
 * how the founder's three proofs run on a race already run, and is written on the judges' page.
 */
export async function POST(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("verify", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const body = await readJsonBody<{ giftId?: unknown; bib?: unknown }>(request, 1_024);
    const giftId = String(body.giftId ?? "");
    const bib = String(body.bib ?? "").trim();
    if (!/^\d{1,78}$/.test(giftId)) throw new GiftApiError("UNKNOWN_GIFT", "Unknown gift", 404);
    if (!isValidBib(bib)) throw new GiftApiError("INVALID_BIB", "A bib number is one to six figures.");
    const [gift, milestone] = await Promise.all([loadGift(giftId), loadMilestoneGift(giftId)]);
    if (!gift || !milestone || milestone.conditionId !== "marathon-finish") throw new GiftApiError("UNKNOWN_GIFT", "Unknown gift", 404);
    if (!gift.recipient || gift.recipient.toLowerCase() !== auth.account.toLowerCase()) throw new GiftApiError("NOT_RECIPIENT", "Open the gift first.", 403);
    const race = marathonEventById(String(milestone.course ?? ""))?.race;
    if (!race) throw new GiftApiError("UNKNOWN_RACE", "This gift names no race Viky reads.", 409);
    if (gift.boundAt) throw new GiftApiError("BIB_ALREADY_SET", "Your bib is already entered for this gift.", 409);
    if (!bibStillOpen(race, Date.now()) && !isOperator(auth.account)) throw new GiftApiError("RACE_STARTED", "The race has started, so a bib can no longer be entered for this gift.", 409);
    await markConnectedAccount(giftId, bib);
    await markBound(giftId, bib);
    return NextResponse.json({ bib }, { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
