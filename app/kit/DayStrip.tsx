"use client";
import { useSyncExternalStore } from "react";
import { stripOf, type StripDay } from "@/src/day-states";
import { Character, type CharacterState } from "./Character";
import { ArrivalDay } from "./Motion";

/**
 * The days of a gift as one strip of small characters: the image of progress the card carries under its title
 * (Material: "Cards can serve as entry points"; the card of the structure, section 6). Each day is the character of its
 * state (the art direction brief of 17 Sep 2026, section 5), at the small size, which is the shape and the colour with
 * no face: a full circle earned, a faded one leaving to the left when it went back, an upright triangle today, the same
 * leaning while it can still be caught up, a low rounded rectangle still to come.
 *
 * A settled day is drawn from the keeper's record per day when it has one, at its date (D86); a day settled before the
 * record falls back to the counts, earned first (`stripOf`).
 *
 * It is a picture of a sentence the card already says in words ("Counting: 3 of 7 days done, 0 missed."), so it is
 * hidden from a screen reader rather than read twice. Before the first reading a gift has no dated days yet, so the
 * strip is its length, every day still to come, which is what is true. Each day sits inside the screen's arrival, which
 * plays it only if it changed since the last visit (app/kit/Motion.tsx).
 */

type Shape = Readonly<{ startDay: number; endDay: number; durationDays: number; creditedDays: number; missedDays: number }>;

/** The minute, stepped once a minute, and nothing on the server: the days depend on the reader's clock. */
function everyMinute(changed: () => void): () => void {
  const timer = setInterval(changed, 60_000);
  return () => clearInterval(timer);
}
const thisMinute = () => Math.floor(Date.now() / 60_000) * 60_000;
const noClock = () => 0;

export function DayStrip({
  id,
  gift,
  catchUpSeconds,
  records = [],
}: Readonly<{ id: string; gift: Shape; catchUpSeconds: number; records?: readonly { day: number; outcome: "earned" | "returned" }[] }>) {
  const nowMs = useSyncExternalStore(everyMinute, thisMinute, noClock);
  // One size everywhere, and it keeps its face (the founder, 19 Sep 2026, amending the brief). 52 on a card since
  // D132, where 42 left the sleeping days unreadable: a low capsule at 42 is seventeen pixels tall. The strip scrolls
  // rather than shrinking, exactly as the row does, because a row of thirty smudges says nothing at all.
  return (
    <span aria-hidden className="day-row-days flex w-full items-end">
      {stripOf(gift, catchUpSeconds, nowMs, records).map((day, index) => (
        <span key={index} data-day={day} className="flex w-[52px] flex-none items-end">
          <ArrivalDay gift={id} index={index}>
            <Character state={characterOf(day)} standing={false} className="h-auto w-full" />
          </ArrivalDay>
        </span>
      ))}
    </span>
  );
}

/**
 * A day's state as a character. A day whose window has closed and which nothing has drained yet is drawn as one still
 * to be judged, leaning, because it has not come back yet and saying otherwise would be inventing it.
 */
export function characterOf(day: StripDay): CharacterState {
  switch (day) {
    case "earned":
      return "earned";
    case "returned":
      return "returned";
    case "today":
      return "today";
    case "catchable":
    case "aboutToReturn":
      return "catchable";
    case "toCome":
      return "toCome";
  }
}

/** Every day of a gift as its character, which is what an arrival compares against the last visit. */
export function charactersOf(
  gift: Shape,
  catchUpSeconds: number,
  nowMs: number,
  records: readonly { day: number; outcome: "earned" | "returned" }[] = [],
): CharacterState[] {
  return stripOf(gift, catchUpSeconds, nowMs, records).map(characterOf);
}
