import { GiftApiError } from "./gift-api";
import { loadGift } from "./gift-store";
import { bibStillOpen, marathonAccount, marathonRaceById, type MarathonRace } from "./marathon";
import { loadMilestoneGift } from "./milestone-store";

/**
 * What a marathon gift reads with (D273): its race, from the record the funder made it on, and the bib the person
 * bound before the start. Server only. The account the service reads is built here and nowhere else, so the browser
 * can name neither the race nor the bib at the moment of the proof.
 */
export async function marathonAccountOfGift(giftId: string, viewer: string): Promise<{ giftId: string; race: MarathonRace; bib: string; account: string }> {
  if (!/^\d{1,78}$/.test(giftId)) throw new GiftApiError("UNKNOWN_GIFT", "Unknown gift", 404);
  const [gift, milestone] = await Promise.all([loadGift(giftId), loadMilestoneGift(giftId)]);
  if (!gift || !milestone || milestone.conditionId !== "marathon-finish") throw new GiftApiError("UNKNOWN_GIFT", "Unknown gift", 404);
  if (!gift.recipient || gift.recipient.toLowerCase() !== viewer.toLowerCase()) throw new GiftApiError("NOT_RECIPIENT", "Open the gift first.", 403);
  const race = marathonRaceById(String(milestone.course ?? ""));
  if (!race) throw new GiftApiError("UNKNOWN_RACE", "This gift names no race Viky reads.", 409);
  const bib = gift.boundAt && gift.goalUsername ? String(gift.goalUsername) : "";
  if (!bib) throw new GiftApiError("NO_BIB", "Enter your bib number first.", 409);
  // Results exist once the race has been run: before the start there is nothing to read.
  if (bibStillOpen(race, Date.now())) throw new GiftApiError("RACE_NOT_RUN", "The race has not started yet. Come back after the finish.", 409);
  return { giftId, race, bib, account: marathonAccount(race, bib) };
}
