"use client";
import { useEffect, useRef } from "react";
import { useMinute } from "./clock";
import { giftDays, stripOf } from "@/src/day-states";
import { contractDayInWords } from "@/src/moments";
import { Character } from "./Character";
import { characterOf, endsHidden, fadeOf, useHiddenEdges } from "./DayStrip";
import { ArrivalDay } from "./Motion";
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
 *
 * Under each character, small, what one day is worth, as on the card being filled in (D304; on a gift's page since
 * the founder's word of 3 Oct 2026, for the person it is for as for the one who offered it). The figure is the page's
 * own, the day's share of the gift; a reader of the screen hears it once, in "What was agreed", not thirty times.
 *
 * Before a gift starts its days are asleep, eyes closed, and they stay so when it is opened: nothing in the row moves at
 * the opening, which the gift's own character answers at the head of the page (app/components/GiftPage.tsx). Only the
 * day that is open is awake (the founder, 4 Oct 2026): it wakes once, when it opens, the capsule becoming the triangle
 * and the eyes opening, under the person's eyes when the gift connects and is paid the same day, on arrival otherwise;
 * and a day done wakes in its jump (app/kit/Motion.tsx).
 */

type Shape = Readonly<{ startDay: number; endDay: number; durationDays: number; creditedDays: number; missedDays: number; givenBackDays?: number }>;


export function DayRow({
  id,
  gift,
  catchUpSeconds,
  records,
  voice,
  silent = false,
  each,
  leadOnToday = false,
}: Readonly<{
  id: string;
  gift: Shape;
  catchUpSeconds: number;
  records: readonly { day: number; outcome: "earned" | "returned" }[];
  /** Who is reading: a day that went back went back to them, to you, or, for a reader of neither side, just back. */
  voice: "funder" | "recipient" | "reader";
  /** The row alone, without the line under it: the card says something else there (the day a gift was ended). */
  silent?: boolean;
  /** What one day is worth, written small under each character. */
  each?: string;
  /**
   * The line under the row counts to today even when an earlier day is still open (a gift read as the day goes, the
   * mockup of 3 Oct 2026): there a lesson is paid the day it is done, so today is the day the page is about.
   */
  leadOnToday?: boolean;
}>) {
  const nowMs = useMinute();
  const drawn = nowMs !== 0 && gift.startDay !== 0;
  // Before it starts, the row is the gift's days asleep, as the card on Home draws them (V4): the days have no dates
  // yet, so the row is a picture and says nothing of its own, and the sentence beside it is the state.
  const asleep = nowMs !== 0 && gift.startDay === 0 && gift.durationDays > 0;
  const numbers = drawn ? giftDays(gift, catchUpSeconds, nowMs).days.map((day) => day.dayNumber) : [];
  const states = drawn ? stripOf(gift, catchUpSeconds, nowMs, records) : [];
  const row = useRef<HTMLOListElement>(null);
  const today = useRef<HTMLLIElement>(null);
  // Which side still hides a day, which is the fade at that edge, and the fade is what says there is more that way:
  // seven days fit on a wide screen and not on a narrow one, and the number of days does not tell.
  const hidden = useHiddenEdges(row, states.length);
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
        <ol className="day-row-days" data-days="asleep">
          {Array.from({ length: gift.durationDays }, (_, index) => (
            <li key={index} className="day-row-day" data-worth={each ? "" : undefined}>
              <Character state="toCome" variant={index} standing={false} className="h-auto w-full" />
              {each ? <span className="day-row-worth">{each}</span> : null}
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
  const firstOpen = states.findIndex((state) => state === "today" || state === "catchable" || state === "aboutToReturn");
  // By its date and not by its state: there, today can be counted already, and it is still the day in view.
  const todayAt = leadOnToday ? numbers.indexOf(Math.floor(nowMs / 86_400_000)) : -1;
  const now = todayAt >= 0 ? todayAt : firstOpen;
  // A gift its recipient ended opens on the day it stopped at, the first of the days given back: "Day 3 of 7" is then
  // where the gift stands, and the days after it are the ones that went back.
  const stoppedAt = gift.givenBackDays ? Math.min(states.length - 1, gift.creditedDays + gift.missedDays) : -1;
  const at = now >= 0 ? now : stoppedAt >= 0 ? stoppedAt : states.every((state) => state === "toCome") ? 0 : states.length - 1;
  return (
    <div className="day-row">
      <ol ref={row} data-more={endsHidden(hidden)} style={fadeOf(hidden)} className="day-row-days" aria-label={W.daysLabel}>
        {states.map((state, index) => (
          <li
            key={numbers[index]}
            ref={index === at ? today : null}
            aria-label={`${contractDayInWords(numbers[index])}, ${words(state)}`}
            className="day-row-day"
            data-worth={each ? "" : undefined}
          >
            <ArrivalDay gift={id} index={index}>
              {/* A day earned jumps, a day gone back leaves and the day that opens wakes, in the arrival: those three are
                  written into the page (D206); the others name their drawing, since nothing follows the pointer any more
                  (D216). A day earned while this page stood carries the triangle it was (the founder, 10 Oct 2026). */}
              {(from) => (
                <Character
                  state={characterOf(state)}
                  variant={index}
                  standing={false}
                  drawn={characterOf(state) === "earned" || characterOf(state) === "returned" || characterOf(state) === "today" ? "inline" : "referenced"}
                  wakes={characterOf(state) === "today"}
                  from={characterOf(state) === "earned" ? from : undefined}
                  className="h-auto w-full"
                />
              )}
            </ArrivalDay>
            {each ? (
              <span aria-hidden className="day-row-worth">
                {each}
              </span>
            ) : null}
          </li>
        ))}
      </ol>
      {silent ? null : <p className={`${CARD_LABEL} day-row-where`}>{L.dayOfDays(at + 1, states.length)}</p>}
    </div>
  );
}
