"use client";
import { useEffect, useRef, useState } from "react";
import { MOTION } from "@/src/design-tokens";
import { HOME } from "@/src/sentences";
import { GOAL_SAID, HELP, SAY } from "../components/ui";
import { reduced } from "./Motion";

/**
 * Under the landing's card, what a gift can wait for, one thing at a time (D285, the founder, 27 Sep 2026: bigger, the
 * schools going by in the sentence, and sometimes something else). The items come from the server (`landingGoals`),
 * so the first image is the first item. Then, while the sentence is on the screen and the tab is in front, each item
 * is held long enough to read, leaves upward and the next rises in its place. Under reduced motion it stays on the
 * first. A reader of the screen hears the whole sentence once, every item in it, and not the changes.
 *
 * The one movement on a clock outside the working ring, asked for by the founder over D225's still names; it stops
 * whenever nobody can see it.
 */
export function GoalsGoingBy({ items }: Readonly<{ items: readonly string[] }>) {
  const root = useRef<HTMLDivElement>(null);
  const said = useRef<HTMLSpanElement>(null);
  const [at, setAt] = useState(0);

  useEffect(() => {
    const element = root.current;
    if (!element || items.length < 2 || reduced()) return;
    let seen = false;
    let timer: number | undefined;
    const next = () => {
      timer = undefined;
      if (!seen || document.hidden) return;
      const { outMs, outEasing, rise } = MOTION.rotate;
      const leaving = said.current?.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: `translateY(-${rise})` }], { duration: outMs, easing: outEasing, fill: "forwards" });
      if (!leaving) return;
      leaving.onfinish = () => {
        setAt((was) => (was + 1) % items.length);
        schedule();
      };
    };
    const schedule = () => {
      if (timer === undefined && seen && !document.hidden) timer = window.setTimeout(next, MOTION.rotate.holdMs);
    };
    const observer = new IntersectionObserver((entries) => {
      seen = entries[entries.length - 1].isIntersecting;
      if (seen) schedule();
    });
    observer.observe(element);
    const onVisibility = () => schedule();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [items]);

  // Each new item rises into place from where the last one left, once it is drawn.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const { inMs, inEasing, rise } = MOTION.rotate;
    said.current?.getAnimations().forEach((animation) => animation.cancel());
    said.current?.animate([{ opacity: 0, transform: `translateY(${rise})` }, { opacity: 1, transform: "none" }], { duration: inMs, easing: inEasing });
  }, [at]);

  if (items.length === 0) return null;
  return (
    <div ref={root} className="flex w-full flex-col items-center gap-[var(--space-sm)] text-center">
      <p className="sr-only">{HOME.waitsFor.all(items.join(", "))}</p>
      <p aria-hidden className={`${SAY} text-[var(--muted)]`}>
        {HOME.waitsFor.lead}
      </p>
      {/* Room kept for its longest item, so nothing under it moves: two lines on a phone, one on a large screen, where
          the longest ("a finish at the Frankfurt Marathon.") holds in the column's width. */}
      <p aria-hidden className={`${GOAL_SAID} flex min-h-[calc(2*var(--type-goal-leading))] max-w-[640px] items-start justify-center [@media(min-width:1024px)]:min-h-[var(--type-goal-leading)] [@media(min-width:1024px)]:max-w-[880px] [@media(min-width:1024px)]:whitespace-nowrap`}>
        <span ref={said} data-goal-said className="inline-block">
          {items[at]}.
        </span>
      </p>
      <p className={`${HELP} mx-auto max-w-[460px] [@media(min-width:1024px)]:max-w-[34em]`}>{HOME.waitsFor.read}</p>
    </div>
  );
}
