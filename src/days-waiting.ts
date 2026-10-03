import type { DaysWaiting } from "./attested-calls";
import { catchUpSecondsOf } from "./catch-up";
import { readGift, utcDayOf, type GiftState } from "./gift-reader";
import { loadBoundGifts } from "./gift-store";
import { isMilestoneGiftId } from "./milestone-protocol";
import { escrowOf } from "./relayer";

/**
 * The days of daily gifts that a reading could still count, and until when (3 Oct 2026). Two things read it: the
 * sentence a person reads when the month's limit of readings is reached, which says until when their day can still be
 * counted, and the alert the operator gets at that moment, which says how many days wait and which closes first.
 * Server only.
 */

/** The window a day keeps once it is over: the day after it, and six hours (the contracts' `CATCH_UP_WINDOW`). */
export const CATCH_UP_SECONDS = 86_400 + 6 * 3_600;

type Window = Pick<GiftState, "startDay" | "endDay" | "settledThroughDay" | "finalised" | "cancelled">;

/** The moment the window of a day closes: the end of the day, then the catch-up window of the contract that holds it. */
function windowEndsAt(day: number, catchUpSeconds: number): number {
  return (day + 1) * 86_400 + catchUpSeconds;
}

/**
 * When the window of the oldest day a reading could still count closes, in UTC seconds, or nothing when the gift has
 * no such day: never connected, over, or every day settled. A day not yet begun counts, so a person whose today is
 * already paid reads until when tomorrow's can be. A pause of readings can only make it later, never sooner.
 */
export function countableUntil(gift: Window, nowSeconds: number, catchUpSeconds: number = CATCH_UP_SECONDS): number | null {
  if (!gift.startDay || gift.finalised || gift.cancelled) return null;
  for (let day = Math.max(gift.settledThroughDay + 1, gift.startDay); day <= gift.endDay; day += 1) {
    if (nowSeconds < windowEndsAt(day, catchUpSeconds)) return windowEndsAt(day, catchUpSeconds);
  }
  return null;
}

/** The days of one gift that have begun, are not settled, and are still inside their window. */
export function daysWaitingOf(gift: Window, nowSeconds: number, catchUpSeconds: number = CATCH_UP_SECONDS): { days: number; nearestEndsAt: number | null } {
  if (!gift.startDay || gift.finalised || gift.cancelled) return { days: 0, nearestEndsAt: null };
  let days = 0;
  let nearestEndsAt: number | null = null;
  for (let day = Math.max(gift.settledThroughDay + 1, gift.startDay); day <= Math.min(utcDayOf(nowSeconds), gift.endDay); day += 1) {
    if (nowSeconds >= windowEndsAt(day, catchUpSeconds)) continue;
    days += 1;
    nearestEndsAt ??= windowEndsAt(day, catchUpSeconds);
  }
  return { days, nearestEndsAt };
}

export type DaysWaitingDeps = Readonly<{
  gifts: () => Promise<ReadonlyArray<{ giftId: string; escrow: `0x${string}` | null }>>;
  /** The gift's days as its contract holds them, and how long that contract keeps a day open. */
  read: (giftId: string, record: { giftId: string; escrow: `0x${string}` | null }) => Promise<{ gift: Window; catchUpSeconds: number }>;
}>;

const live: DaysWaitingDeps = {
  gifts: async () => (await loadBoundGifts()).filter((record) => !isMilestoneGiftId(record.giftId)),
  read: async (giftId, record) => {
    const escrow = escrowOf(record);
    return { gift: await readGift(escrow, giftId), catchUpSeconds: catchUpSecondsOf(escrow) };
  },
};

/** Over every connected daily gift. One that cannot be read is left out, and the alert is not held for it. */
export async function daysWaiting(nowMs: number = Date.now(), deps: DaysWaitingDeps = live): Promise<DaysWaiting> {
  const nowSeconds = Math.floor(nowMs / 1_000);
  let days = 0;
  let gifts = 0;
  let nearestEndsAt: number | null = null;
  for (const record of await deps.gifts()) {
    try {
      const read = await deps.read(record.giftId, record);
      const waiting = daysWaitingOf(read.gift, nowSeconds, read.catchUpSeconds);
      if (waiting.days === 0) continue;
      days += waiting.days;
      gifts += 1;
      if (waiting.nearestEndsAt !== null && (nearestEndsAt === null || waiting.nearestEndsAt < nearestEndsAt)) nearestEndsAt = waiting.nearestEndsAt;
    } catch {
      continue;
    }
  }
  return { days, gifts, nearestEndsAt };
}
