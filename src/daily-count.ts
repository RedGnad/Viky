import { catchUpSecondsOf } from "./catch-up";
import { conditionOfGoal } from "./conditions";
import { paysTheSameDay } from "./v2";
import { versionOfGift } from "./v2-opening";
import { runConnectedCheckIn } from "./connected-checkin";
import { countableUntil } from "./days-waiting";
import { runPublicCheckIn, type PublicCheckInOutcome, type PublicCheckInPurpose, type ReadingPass } from "./duolingo-public-checkin";
import { readGift } from "./gift-reader";
import { loadGift, type GiftRecord } from "./gift-store";
import { escrowOf } from "./relayer";

/**
 * One reading of a daily gift, by the nature of its condition (D188): a public page read for the person (D27), or a
 * connected source read with their key. The keeper and the bind route ask here and never choose themselves.
 */
export async function readDailyGift(input: { giftId: string; purpose: PublicCheckInPurpose; force?: boolean; lookOnly?: boolean; pass?: ReadingPass }): Promise<PublicCheckInOutcome> {
  const record = await loadGift(input.giftId);
  const condition = record ? conditionOfGoal(record.goalType) : undefined;
  // A connected source has no plain look: asked for one, nothing is read at all, rather than a proof paid for.
  if (condition?.nature === "connected" && input.lookOnly) return { kind: "already", giftId: input.giftId, reason: "read_recently" };
  const outcome = condition?.nature === "connected" ? await runConnectedCheckIn(input) : await runPublicCheckIn(input);
  // The month's limit of readings: the refusal says until when the day can still be counted (the founder, 3 Oct 2026).
  if (outcome.kind === "refused" && outcome.code === "LIMIT_REACHED" && record) return { ...outcome, countableUntil: await untilOf(record) };
  return outcome;
}

/**
 * Whether a daily gift is read as the day goes, by its open page and by the pass of every quarter of an hour (the
 * founder, 3 Oct 2026): it is on the third daily contract, where a reading pays its own day, and its source can be
 * looked at plainly, which is what keeps those readings free until a lesson is in. A gift on a connected source is
 * read by the nightly pass alone, on every version.
 */
export function readAsTheDayGoes(record: Pick<GiftRecord, "giftId" | "escrow" | "goalType">): boolean {
  try {
    return paysTheSameDay(versionOfGift(record)) && conditionOfGoal(record.goalType)?.nature !== "connected";
  } catch {
    return false;
  }
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
