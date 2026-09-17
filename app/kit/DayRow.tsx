"use client";
import { useSyncExternalStore } from "react";
import { giftDays, stripOf } from "@/src/day-states";
import { contractDayInWords } from "@/src/moments";
import { Character } from "./Character";
import { characterOf } from "./DayStrip";
import { ArrivalDay, Gaze } from "./Motion";
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
  id,
  gift,
  catchUpSeconds,
  records,
  readerIsFunder,
}: Readonly<{ id: string; gift: Shape; catchUpSeconds: number; records: readonly { day: number; outcome: "earned" | "returned" }[]; readerIsFunder: boolean }>) {
  const nowMs = useSyncExternalStore(everyMinute, thisMinute, noClock);
  if (nowMs === 0 || gift.startDay === 0) return null;
  const numbers = giftDays(gift, catchUpSeconds, nowMs).days.map((day) => day.dayNumber);
  const states = stripOf(gift, catchUpSeconds, nowMs, records);
  const words = (state: (typeof states)[number]) =>
    state === "returned" ? (readerIsFunder ? W.dayWords.returnedTheirs : W.dayWords.returnedYours) : W.dayWords[state];
  return (
    <div className="@container">
      <ol className="grid grid-cols-4 gap-x-[var(--space-sm)] gap-y-[var(--space-lg)] @[420px]:grid-cols-7" aria-label={W.daysLabel}>
        {states.map((state, index) => {
          const date = contractDayInWords(numbers[index]);
          return (
            <li key={numbers[index]} aria-label={`${date}, ${words(state)}`} className="flex min-w-0 flex-col items-center gap-[var(--space-xs)]">
              <span aria-hidden className="flex w-full justify-center pt-[var(--space-sm)]">
                <ArrivalDay gift={id} index={index}>
                  <Gaze>
                    <Character state={characterOf(state)} variant={index} className="h-auto w-full max-w-[72px]" />
                  </Gaze>
                </ArrivalDay>
              </span>
              <span aria-hidden className="text-[length:var(--type-help)] leading-[var(--type-help-leading)] font-medium tabular-nums">
                {date.split(" ")[0]}
              </span>
              <span aria-hidden className="text-center text-[length:var(--type-help)] leading-[var(--type-help-leading)] text-[var(--muted)]">
                {words(state)}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
