import { conditionOfGoal } from "./conditions";
import { runConnectedCheckIn } from "./connected-checkin";
import { runPublicCheckIn, type PublicCheckInOutcome, type PublicCheckInPurpose } from "./duolingo-public-checkin";
import { loadGift } from "./gift-store";

/**
 * One reading of a daily gift, by the nature of its condition (D188): a public page read for the person (D27), or a
 * connected source read with their key. The keeper and the bind route ask here and never choose themselves.
 */
export async function readDailyGift(input: { giftId: string; purpose: PublicCheckInPurpose; force?: boolean }): Promise<PublicCheckInOutcome> {
  const record = await loadGift(input.giftId);
  const condition = record ? conditionOfGoal(record.goalType) : undefined;
  if (condition?.nature === "connected") return runConnectedCheckIn(input);
  return runPublicCheckIn(input);
}
