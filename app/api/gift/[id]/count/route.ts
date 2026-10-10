import { NextResponse } from "next/server";
import { assertSameOrigin } from "@/src/api-guard";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { readAsTheDayGoes, readDailyGift } from "@/src/daily-count";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { loadGift } from "@/src/gift-store";
import { milestoneErrorResponse } from "@/src/milestone-api";
import { isMilestoneGiftId } from "@/src/milestone-protocol";
import { milestoneCount } from "@/src/milestone-routes";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * A count on demand, for a person who does not want to wait for the daily pass. Same read, same proof.
 *
 * A daily gift on the third daily contract is read as its page opens instead (src/daily-count.ts): the page asks for
 * a look, `?look=1`, once a minute, which costs nothing and answers whether a lesson is in; then, for a lesson seen,
 * for the count itself, which takes the proof. Either of the gift's two people may ask: a reading pays only the
 * person the gift is for, whoever opened the page.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const { id } = await context.params;
    const look = new URL(request.url).searchParams.get("look") === "1";
    // A milestone is read live while its page is open, once a minute (src/rate-limit.ts, `reading`), and so is the
    // look of a daily gift.
    const rate = checkRateLimit(isMilestoneGiftId(id) || look ? "reading" : "verify", request);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    // A reading on demand of a milestone gift: the first one at or past the target releases it (C2).
    if (isMilestoneGiftId(id)) return await milestoneCount(request, id).catch((error: unknown) => milestoneErrorResponse(error));
    const auth = readAccountAuthSession(request);
    const gift = await loadGift(id);
    const account = auth.account.toLowerCase();
    const live = gift ? readAsTheDayGoes(gift) : false;
    const theirs = Boolean(gift?.recipient && gift.recipient.toLowerCase() === account);
    const offeredIt = Boolean(gift && live && gift.funder.toLowerCase() === account);
    if (!gift || !gift.recipient || !(theirs || offeredIt)) throw new GiftApiError("NOT_RECIPIENT", "Open the gift first.", 403);
    if (look && !live) throw new GiftApiError("NOT_READ_LIVE", "This gift is read each morning.", 409);
    // By the condition's nature, as the keeper reads it (src/daily-count.ts): a Strava or Fitbit gift was read here as a
    // Duolingo profile until 29 Sep 2026. Either way a proof is taken only for a lesson a look saw: a page and a press
    // name no pass, so after a look that failed they take none (src/daily-look.ts).
    const outcome = await readDailyGift(live ? { giftId: id, purpose: "count", lookOnly: look } : { giftId: id, purpose: "count", force: true });
    return NextResponse.json(outcome, { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
