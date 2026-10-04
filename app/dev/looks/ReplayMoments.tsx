"use client";
import Link from "next/link";
import { useRef } from "react";
import { Character } from "@/app/kit/Character";
import { playMoment, REPLAY_ARRIVAL } from "@/app/kit/Motion";
import { CARD, HELP, SMALL_BUTTON } from "@/app/components/ui";
import { LAB } from "./words";

/**
 * Each movement of the product, by itself, with a button that plays it again (the founder, 4 Oct 2026: he judges each
 * animation). Three are a day's own, played here on the product's own character by the product's own functions; the
 * arrival is the page's, played from the example's last visit; and the moment of a gift reached is played over Home,
 * on its own page, for either of its two people.
 *
 * Laboratory tools, not the product's: pictures of the screens leave them out (`data-lab-tool`).
 */
const DAYS = [
  { id: "earned", state: "earned", says: LAB.moments.earned },
  { id: "woken", state: "today", says: LAB.moments.woken },
  { id: "returned", state: "returned", says: LAB.moments.returned },
] as const;

export function ReplayMoments() {
  const roots = useRef(new Map<string, HTMLSpanElement>());
  return (
    <section className={CARD} data-lab-moments="">
      <p className="font-medium">{LAB.eachMovement}</p>
      {DAYS.map((day, index) => (
        <div key={day.id} className="flex items-center gap-[var(--space-md)]" data-lab-moment={day.id}>
          <span
            ref={(element) => {
              if (element) roots.current.set(day.id, element);
              else roots.current.delete(day.id);
            }}
            className="block w-[64px] shrink-0"
          >
            {/* Written into the page: a named drawing's parts cannot be reached, and nothing of it would move. */}
            <Character state={day.state} variant={index} drawn="inline" wakes={day.id === "woken"} className="h-auto w-full" />
          </span>
          <p className={`${HELP} flex-1`}>{day.says}</p>
          <button
            type="button"
            data-lab-tool
            className={SMALL_BUTTON}
            onClick={() => {
              const root = roots.current.get(day.id);
              if (root) playMoment(day.id, root);
            }}
          >
            {LAB.playAgain}
          </button>
        </div>
      ))}
      <div className="flex items-center gap-[var(--space-md)]" data-lab-moment="arrival">
        <p className={`${HELP} flex-1`}>{LAB.moments.arrival}</p>
        <button type="button" data-lab-tool className={SMALL_BUTTON} onClick={() => window.dispatchEvent(new Event(REPLAY_ARRIVAL))}>
          {LAB.playAgain}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-[var(--space-md)]" data-lab-moment="reached">
        <p className={`${HELP} flex-1`}>{LAB.moments.reached}</p>
        <Link href="/dev/looks/reached?who=recipient" data-lab-tool className={SMALL_BUTTON}>
          {LAB.reachedFor.recipient}
        </Link>
        <Link href="/dev/looks/reached?who=funder" data-lab-tool className={SMALL_BUTTON}>
          {LAB.reachedFor.funder}
        </Link>
      </div>
    </section>
  );
}
