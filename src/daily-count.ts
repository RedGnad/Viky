import { catchUpSecondsOf } from "./catch-up";
import { conditionOfGoal } from "./conditions";
import { runConnectedCheckIn } from "./connected-checkin";
import { countableUntil } from "./days-waiting";
import { runPublicCheckIn, type PublicCheckInOutcome, type PublicCheckInPurpose } from "./duolingo-public-checkin";
import { readGift } from "./gift-reader";
import { loadGift, type GiftRecord } from "./gift-store";
import { escrowOf } from "./relayer";

/**
 * One reading of a daily gift, by the nature of its condition (D188): a public page read for the person (D27), or a
 * connected source read with their key. The keeper and the bind route ask here and never choose themselves.
 */
export async function readDailyGift(input: { giftId: string; purpose: PublicCheckInPurpose; force?: boolean; pass?: "counting" | "recount" }): Promise<PublicCheckInOutcome> {
  const record = await loadGift(input.giftId);
  const condition = record ? conditionOfGoal(record.goalType) : undefined;
  const outcome = condition?.nature === "connected" ? await runConnectedCheckIn(input) : await runPublicCheckIn(input);
  // The month's limit of readings: the refusal says until when the day can still be counted (the founder, 3 Oct 2026).
  if (outcome.kind === "refused" && outcome.code === "LIMIT_REACHED" && record) return { ...outcome, countableUntil: await untilOf(record) };
  return outcome;
}

/** The real end of the window of the day still to count, from the contract's own figures, or nothing when they cannot be read. */
async function untilOf(record: GiftRecord): Promise<number | null> {
  try {
    const escrow = escrowOf(record);
    return countableUntil(await readGift(escrow, record.giftId), Math.floor(Date.now() / 1_000), catchUpSecondsOf(escrow));
  } catch {
    return null;
  }
}
