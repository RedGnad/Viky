import { GiftApiError } from "./gift-api";
import { loadGift } from "./gift-store";
import { loadMilestoneGift } from "./milestone-store";
import { wcaCourseOf } from "./wca";

/**
 * What a WCA gift reads with (the founder, 27 Sep 2026): its competition and event, from the record the funder made
 * it on, and the person as they gave themselves when they checked the competitors list (their WCA id or their name).
 * Server only: the browser names none of it at the moment of the proof.
 */
export async function wcaCourseOfGift(giftId: string, viewer: string): Promise<{ giftId: string; courseId: string; competitionId: string; eventId: string; who: string }> {
  if (!/^\d{1,78}$/.test(giftId)) throw new GiftApiError("UNKNOWN_GIFT", "Unknown gift", 404);
  const [gift, milestone] = await Promise.all([loadGift(giftId), loadMilestoneGift(giftId)]);
  if (!gift || !milestone || milestone.conditionId !== "wca-time") throw new GiftApiError("UNKNOWN_GIFT", "Unknown gift", 404);
  if (!gift.recipient || gift.recipient.toLowerCase() !== viewer.toLowerCase()) throw new GiftApiError("NOT_RECIPIENT", "Open the gift first.", 403);
  const courseId = String(milestone.course ?? "");
  const course = wcaCourseOf(courseId);
  if (!course) throw new GiftApiError("UNKNOWN_COMPETITION", "This gift names no competition Viky reads.", 409);
  const who = gift.boundAt && gift.goalUsername ? String(gift.goalUsername) : "";
  if (!who) throw new GiftApiError("NOT_REGISTERED", "Check that you are on the competitors list first.", 409);
  return { giftId, courseId, competitionId: course.competitionId, eventId: course.eventId, who };
}
