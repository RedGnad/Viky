import { NextResponse } from "next/server";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { readJsonBody } from "@/src/api-guard";
import { isOperator } from "@/src/dev-access";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { loadGift, markBound, markConnectedAccount } from "@/src/gift-store";
import { WCA_MILESTONE } from "@/src/milestone-conditions";
import { loadMilestoneGift } from "@/src/milestone-store";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";
import { competitionStillOpen, wcaCourseOf } from "@/src/wca";
import { readWcaCompetition, readWcaRegistration, WcaReadError } from "@/src/wca-reading";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The person on the competitors list, checked from their gift's page before the competition's first day (the founder,
 * 27 Sep 2026): the second of the three ties, the bib of a marathon. They give their WCA id or their name as on the
 * list; the list is read plainly; what is kept is what they gave and the id the list carries. Closed at the first
 * day, except for an operator's account, which is how a test gift runs on a competition already held.
 */
export async function POST(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("verify", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const body = await readJsonBody<{ giftId?: unknown; who?: unknown }>(request, 1_024);
    const giftId = String(body.giftId ?? "");
    const who = String(body.who ?? "").trim();
    if (!/^\d{1,78}$/.test(giftId)) throw new GiftApiError("UNKNOWN_GIFT", "Unknown gift", 404);
    if (!WCA_MILESTONE.validLink(who)) throw new GiftApiError("INVALID_WHO", WCA_MILESTONE.words.refusals.linkShape);
    const [gift, milestone] = await Promise.all([loadGift(giftId), loadMilestoneGift(giftId)]);
    if (!gift || !milestone || milestone.conditionId !== "wca-time") throw new GiftApiError("UNKNOWN_GIFT", "Unknown gift", 404);
    if (!gift.recipient || gift.recipient.toLowerCase() !== auth.account.toLowerCase()) throw new GiftApiError("NOT_RECIPIENT", "Open the gift first.", 403);
    const courseId = String(milestone.course ?? "");
    const course = wcaCourseOf(courseId);
    if (!course) throw new GiftApiError("UNKNOWN_COMPETITION", "This gift names no competition Viky reads.", 409);
    if (gift.boundAt) throw new GiftApiError("ALREADY_CHECKED", "You are already checked on the competitors list for this gift.", 409);
    try {
      const competition = await readWcaCompetition(course.competitionId);
      if (!competitionStillOpen(competition.startDate, Date.now()) && !isOperator(auth.account)) throw new GiftApiError("COMPETITION_STARTED", "The competition has started, so the competitors list can no longer be checked for this gift.", 409);
      const registration = await readWcaRegistration(courseId, who);
      await markConnectedAccount(giftId, who);
      await markBound(giftId, registration.wcaId ?? String(registration.registrantId));
      return NextResponse.json({ name: registration.name, wcaId: registration.wcaId }, { headers: NO_STORE });
    } catch (error) {
      if (error instanceof WcaReadError) {
        const status = error.code === "FETCH_FAILED" ? 502 : error.code === "NOT_REGISTERED" ? 409 : 404;
        return NextResponse.json({ code: error.code, error: error.message }, { status, headers: NO_STORE });
      }
      throw error;
    }
  } catch (error) {
    return giftErrorResponse(error);
  }
}
