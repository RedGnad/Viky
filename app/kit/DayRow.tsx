"use client";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { giftDays, stripOf } from "@/src/day-states";
import { contractDayInWords } from "@/src/moments";
import { Character } from "./Character";
import { characterOf, endsHidden, fadeOf, rowCarriesOn, useHiddenEdges } from "./DayStrip";
import { ArrivalDay, Gaze } from "./Motion";
import { GIFT_LIVE as L, GIFT_PAGE as W } from "@/src/sentences";
import { CARD_LABEL } from "../components/ui";

/**
 * Every day of a gift, in one row that never breaks and never shrinks (the founder's mockup of 19 Sep 2026).
 *
 * It was a grid of four or seven columns, each cell carrying a date and its state in words: three lines per day, and
 * a gift of thirty days filled the screen with them. Then it was a row that shared the width, which made thirty days
 * thirty smudges. The decision: the characters keep one size, large enough to stay themselves, and the row scrolls
 * sideways instead. Under it, one line says where in the gift you are looking.
 *
 * What a screen reader gets is unchanged: each day carries its date and its state in words as its accessible name,
 * and the drawing is hidden from it. Colour never carries a state alone either, because the shapes differ too: a
 * circle, a triangle, a resting capsule (WCAG 1.4.1).
 *
 * It opens on today rather than on the first day, because today is what a person came to see.
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
  voice,
}: Readonly<{
  id: string;
  gift: Shape;
  catchUpSeconds: number;
  records: readonly { day: number; outcome: "earned" | "returned" }[];
  /** Who is reading: a day that went back went back to them, to you, or, for a reader of neither side, just back. */
  voice: "funder" | "recipient" | "reader";
}>) {
  const nowMs = useSyncExternalStore(everyMinute, thisMinute, noClock);
  const drawn = nowMs !== 0 && gift.startDay !== 0;
  // Before it starts, the row is the gift's days asleep, as the card on Home draws them (V4): the days have no dates
  // yet, so the row is a picture and says nothing of its own, and the sentence beside it is the state.
  const asleep = nowMs !== 0 && gift.startDay === 0 && gift.durationDays > 0;
  const numbers = drawn ? giftDays(gift, catchUpSeconds, nowMs).days.map((day) => day.dayNumber) : [];
  const states = drawn ? stripOf(gift, catchUpSeconds, nowMs, records) : [];
  const row = useRef<HTMLOListElement>(null);
  const today = useRef<HTMLLIElement>(null);
  // Which side still hides a day, which is both the fade at that edge and the only honest way to say "scroll for the
  // rest": seven days fit on a wide screen and not on a narrow one, and the number of days does not tell.
  const hidden = useHiddenEdges(row, states.length);
  const more = rowCarriesOn(hidden);
  // Moved to today when the row appears and whenever its length changes: a gift connects while the page is open, and
  // the row that was not there a second ago is the one to look at.
  useEffect(() => {
    const scroller = row.current;
    const day = today.current;
    if (!scroller || !day) return;
    // Straight to today, without the smooth travel: the page has just arrived, so there is no gesture to answer.
    scroller.scrollLeft = Math.max(0, day.offsetLeft - scroller.clientWidth / 2 + day.clientWidth / 2);
  }, [states.length]);
  if (asleep) {
    return (
      <div className="day-row" aria-hidden>
        <ol className="day-row-days">
          {Array.from({ length: gift.durationDays }, (_, index) => (
            <li key={index} className="day-row-day">
              <Character state="toCome" variant={index} standing={false} className="h-auto w-full" />
            </li>
          ))}
        </ol>
      </div>
    );
  }
  if (!drawn) return null;
  const returned = voice === "funder" ? W.dayWords.returnedTheirs : voice === "recipient" ? W.dayWords.returnedYours : W.dayWords.returnedReading;
  const words = (state: (typeof states)[number]) => (state === "returned" ? returned : W.dayWords[state]);
  // Which day it opens on: today, if the gift has one. A gift that has not started yet opens on its first day, and
  // one that has finished on its last, because that is the day the person came to see.
  const now = states.findIndex((state) => state === "today" || state === "catchable" || state === "aboutToReturn");
  const at = now >= 0 ? now : states.every((state) => state === "toCome") ? 0 : states.length - 1;
  return (
    <div className="day-row">
      <ol ref={row} data-more={endsHidden(hidden)} style={fadeOf(hidden)} className="day-row-days" aria-label={W.daysLabel}>
        {states.map((state, index) => (
          <li
            key={numbers[index]}
            ref={index === at ? today : null}
            aria-label={`${contractDayInWords(numbers[index])}, ${words(state)}`}
            className="day-row-day"
          >
            <ArrivalDay gift={id} index={index}>
              <Gaze>
                <Character state={characterOf(state)} variant={index} standing={false} className="h-auto w-full" />
              </Gaze>
            </ArrivalDay>
          </li>
        ))}
      </ol>
      <p className={`${CARD_LABEL} day-row-where`}>
        {L.dayOfDays(at + 1, states.length)}
        {more ? ` · ${L.scrollForTheRest}` : ""}
      </p>
    </div>
  );
}
