"use client";
import { useSyncExternalStore } from "react";
import { giftDays, stripOf, type StripDay } from "@/src/day-states";
import { contractDayInWords } from "@/src/moments";
import { GIFT_PAGE as W } from "@/src/sentences";

/**
 * Every day of a gift, each at its date and each with its state in words under it (item 12 of the product structure):
 * earned, back to them (or back to you, for the funder), catch up, not judged yet, today, to come. The shape of each
 * cell says the same thing again, in ink and surface only, so neither colour nor shape carries a state alone.
 *
 * A settled day is earned or returned as the keeper recorded it (D86); a day settled before the record falls back to
 * the counts (`stripOf`), and the page says so under the row when that happens.
 */

type Shape = Readonly<{ startDay: number; endDay: number; durationDays: number; creditedDays: number; missedDays: number }>;

function everyMinute(changed: () => void): () => void {
  const timer = setInterval(changed, 60_000);
  return () => clearInterval(timer);
}
const thisMinute = () => Math.floor(Date.now() / 60_000) * 60_000;
const noClock = () => 0;

export function DayRow({
  gift,
  catchUpSeconds,
  records,
  readerIsFunder,
}: Readonly<{ gift: Shape; catchUpSeconds: number; records: readonly { day: number; outcome: "earned" | "returned" }[]; readerIsFunder: boolean }>) {
  const nowMs = useSyncExternalStore(everyMinute, thisMinute, noClock);
  if (nowMs === 0 || gift.startDay === 0) return null;
  const numbers = giftDays(gift, catchUpSeconds, nowMs).days.map((day) => day.dayNumber);
  const states = stripOf(gift, catchUpSeconds, nowMs, records);
  const words = (state: StripDay) =>
    state === "returned" ? (readerIsFunder ? W.dayWords.returnedTheirs : W.dayWords.returnedYours) : W.dayWords[state];
  return (
    <ol className="grid grid-cols-7 gap-x-[var(--space-xs)] gap-y-[var(--space-md)]" aria-label={W.daysLabel}>
      {states.map((state, index) => {
        const date = contractDayInWords(numbers[index]);
        return (
          <li key={numbers[index]} aria-label={`${date}, ${words(state)}`} className="flex min-w-0 flex-col items-center gap-[var(--space-xs)]">
            <span aria-hidden className={`relative flex aspect-square w-full flex-col items-center justify-center rounded-[var(--radius-control)] ${cell(state)}`}>
              <Mark state={state} />
              <span className="text-[length:var(--type-help)] leading-[var(--type-help-leading)] tabular-nums">{date.split(" ")[0]}</span>
            </span>
            <span aria-hidden className="text-center text-[11px] leading-[14px] text-[var(--text)]">
              {words(state)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function cell(state: StripDay): string {
  switch (state) {
    case "earned":
      return "bg-[var(--text)] text-[var(--background)] border border-[var(--text)]";
    case "returned":
      return "bg-[var(--surface)] text-[var(--text)] border border-[var(--text)] opacity-60";
    case "catchable":
      return "bg-[var(--surface)] text-[var(--text)] border-2 border-dashed border-[var(--text)]";
    case "aboutToReturn":
      return "bg-[var(--surface)] text-[var(--text)] border border-dashed border-[var(--control-border)] opacity-70";
    case "today":
      return "bg-[var(--surface)] text-[var(--text)] border-[3px] border-[var(--text)]";
    case "toCome":
      return "bg-[var(--surface)] text-[var(--text)] border border-[var(--card-border)]";
  }
}

/** Drawn, never typed: no face the product loads has these characters (D50). */
function Mark({ state }: Readonly<{ state: StripDay }>) {
  return (
    <svg aria-hidden focusable="false" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      {state === "earned" ? <circle cx="8" cy="8" r="5" /> : null}
      {state === "returned" ? <path d="M3 13 13 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /> : null}
      {state === "catchable" ? (
        <>
          <circle cx="8" cy="8" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 3.5a4.5 4.5 0 0 1 0 9Z" />
        </>
      ) : null}
      {state === "aboutToReturn" ? <circle cx="8" cy="8" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" /> : null}
      {state === "today" ? <path d="M8 2.5 13.5 8 8 13.5 2.5 8Z" /> : null}
      {state === "toCome" ? <circle cx="8" cy="8" r="2" /> : null}
    </svg>
  );
}
