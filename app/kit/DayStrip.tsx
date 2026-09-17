"use client";
import { useSyncExternalStore } from "react";
import { stripOf, type StripDay } from "@/src/day-states";

/**
 * The days of a gift as one strip, small enough for a card: the image of progress the card carries under its title
 * (Material: "Cards can serve as entry points"; the card of the structure, section 6). One segment per day, in ink and
 * surface only: filled when earned, struck through and faded when it went back, a thick outline today, dashed while
 * still catchable, faded and dashed while going back, a hairline still to come (structure, section 7).
 *
 * A settled day is drawn from the keeper's record per day when it has one, at its date (D86); a day settled before the
 * record falls back to the counts, earned first (`stripOf`).
 *
 * It is a picture of a sentence the card already says in words ("Counting: 3 of 7 days done, 0 missed."), so it is
 * hidden from a screen reader rather than read twice. Before the first reading a gift has no dated days yet, so the
 * strip is its length, every day still to come, which is what is true.
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
  gift,
  catchUpSeconds,
  records = [],
}: Readonly<{ gift: Shape; catchUpSeconds: number; records?: readonly { day: number; outcome: "earned" | "returned" }[] }>) {
  const nowMs = useSyncExternalStore(everyMinute, thisMinute, noClock);
  return (
    <span aria-hidden className="flex h-[10px] w-full gap-[3px]">
      {stripOf(gift, catchUpSeconds, nowMs, records).map((day, index) => (
        <span key={index} data-day={day} className={`relative h-full min-w-0 flex-1 rounded-full ${segment(day)}`}>
          {day === "returned" ? <span className="absolute inset-x-[2px] top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-[var(--text)]" /> : null}
        </span>
      ))}
    </span>
  );
}

function segment(day: StripDay): string {
  switch (day) {
    case "earned":
      return "bg-[var(--text)]";
    case "returned":
      return "border border-[var(--text)] opacity-45";
    case "today":
      return "border-2 border-[var(--text)]";
    case "catchable":
      return "border-2 border-dashed border-[var(--text)]";
    case "aboutToReturn":
      return "border border-dashed border-[var(--control-border)] opacity-60";
    case "toCome":
      return "border border-[var(--card-border)]";
  }
}
