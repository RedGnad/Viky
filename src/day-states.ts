import { catchUpDay } from "./catch-up";

/**
 * The state of every day of a gift, and an honest account of the one thing it cannot say.
 *
 * D58 settles four states for a day: earned, returned to the funder by name, still catchable until a local
 * time, and a day nobody has judged yet. Three of those are derivable from what the contract exposes. The
 * fourth is not, and pretending otherwise would put a false sentence on a screen:
 *
 * The contract publishes `creditedDays` and `drainedDays` as **counts**, and settles days in order. Earn day
 * one, miss day two, earn day three, and the counts read two and one, which is exactly what earning days one
 * and two and missing day three reads. So the totals are known and the order is not. Drawing a calendar that
 * says "Tuesday came back" from those counts would be inventing it. The split per day needs the contract's
 * own events, which is what the event index is for, and until that exists a settled day says it is settled
 * and the totals are shown beside it.
 *
 * What is derivable is here, and every state is named for what a person can do about it.
 */

export type DayState =
  /** Settled: this day is finished, earned or returned. Which of the two needs the events. */
  | "settled"
  /** Not counted, not lost: a reading before the deadline still earns it. */
  | "catchable"
  /** Its window has closed and nothing has drained it yet. It comes back at the next settling pass. */
  | "aboutToReturn"
  /** Today. Nobody can have missed it, and nothing is owed yet. */
  | "today"
  /** Still to come. */
  | "toCome";

export type Day = Readonly<{
  /** 1 for the first day of the gift, so it can be said out loud. */
  number: number;
  /** The UTC day number the contract counts in. */
  dayNumber: number;
  state: DayState;
  /** Set only on the catchable day: when a reading stops earning it. */
  deadlineMs?: number;
}>;

export type GiftDays = Readonly<{
  days: readonly Day[];
  /** How many are earned, in total, which is the part the counts do say. */
  earned: number;
  /** How many have come back, in total. */
  returned: number;
}>;

type GiftShape = {
  startDay: number;
  endDay: number;
  durationDays: number;
  creditedDays: number;
  missedDays: number;
};

/**
 * Every day of the gift, in order. Before the first reading there is no window yet, so there are no days:
 * an empty list is the truth, not a failure.
 */
export function giftDays(gift: GiftShape, catchUpSeconds: number, nowMs: number): GiftDays {
  if (gift.startDay === 0) return { days: [], earned: gift.creditedDays, returned: gift.missedDays };

  const today = Math.floor(nowMs / 86_400_000);
  const settled = gift.creditedDays + gift.missedDays;
  const catchUp = catchUpDay(gift, catchUpSeconds, nowMs);
  const days: Day[] = [];

  for (let index = 0; index < gift.durationDays; index += 1) {
    const dayNumber = gift.startDay + index;
    const state: DayState = (() => {
      if (index < settled) return "settled";
      if (dayNumber > today) return "toCome";
      if (dayNumber === today) return "today";
      // Behind, and not settled. Either a reading can still earn it, or its window has closed and only the
      // keeper's next pass stands between it and the funder.
      return catchUp !== undefined && catchUp.day === dayNumber ? "catchable" : "aboutToReturn";
    })();
    days.push({
      number: index + 1,
      dayNumber,
      state,
      ...(state === "catchable" && catchUp ? { deadlineMs: catchUp.deadlineMs } : {}),
    });
  }

  return { days, earned: gift.creditedDays, returned: gift.missedDays };
}

/** One segment of a gift card's strip of days. */
export type StripDay = "earned" | "returned" | "catchable" | "aboutToReturn" | "today" | "toCome";

/**
 * The strip a gift card draws: the counts, then the days still open. The contract gives how many days were earned and
 * how many came back, not which (see the top of this file), so until the keeper's record per day exists (S3) the strip
 * draws `creditedDays` earned segments, then `missedDays` returned ones, then the days not yet settled as `giftDays`
 * finds them. Two gifts whose counts differ never draw the same strip, which is what the card's picture must say: a
 * day earned and a day that went back are not the same thing (audit D, founder's correction of 17 Sep 2026).
 */
export function stripOf(gift: GiftShape, catchUpSeconds: number, nowMs: number): readonly StripDay[] {
  if (gift.startDay === 0 || nowMs === 0) return Array.from({ length: gift.durationDays }, () => "toCome");
  const credited = Math.max(0, gift.creditedDays);
  const missed = Math.max(0, gift.missedDays);
  return giftDays(gift, catchUpSeconds, nowMs).days.map((day, index) => {
    if (day.state !== "settled") return day.state;
    return index < credited ? "earned" : index < credited + missed ? "returned" : "earned";
  });
}

/**
 * What each state says, in words, because colour may never be the only carrier: Apple asks for "visual
 * indicators, like distinct shapes or icons, in addition to color", and every published guideline says never
 * to rely on hue alone. `funderName` is whose money comes back, because "returned to Ama" is a fact and
 * "lost" is a judgement.
 */
export function dayInWords(day: Day, funderName: string): string {
  switch (day.state) {
    case "settled":
      return `Day ${day.number}, finished`;
    case "catchable":
      return `Day ${day.number}, still yours to earn`;
    case "aboutToReturn":
      return `Day ${day.number}, going back to ${funderName}`;
    case "today":
      return `Day ${day.number}, today`;
    case "toCome":
      return `Day ${day.number}, still to come`;
  }
}

/**
 * A shape per state, so the row reads without colour and without a legend beside every cell. They are drawn in
 * app/components/DayRow.tsx rather than typed: as characters, no face the product loads had them, so the phone's
 * own fonts drew them instead.
 */
export type DayMark = "full" | "half" | "ring" | "diamond" | "dot";
export const DAY_MARK: Record<DayState, DayMark> = {
  settled: "full",
  catchable: "half",
  aboutToReturn: "ring",
  today: "diamond",
  toCome: "dot",
};
