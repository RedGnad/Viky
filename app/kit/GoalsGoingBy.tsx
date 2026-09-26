"use client";
import { useEffect, useRef, useState } from "react";
import { MOTION } from "@/src/design-tokens";
import { nextGoal } from "@/src/landing-goals";
import { HOME } from "@/src/sentences";
import { GOAL_SAID, HELP, SAY } from "../components/ui";
import { reduced } from "./Motion";

/**
 * Under the landing's card, what a gift can wait for, one thing at a time (D285, widened by D286). The phrases come
 * from the server (`landingGoals`) with the first one drawn there, so the first image is the first phrase. Then, while
 * the sentence is on the screen and the tab is in front, each phrase is held long enough to read, leaves upward, and
 * the next, drawn at random (`nextGoal`: another kind than the last, nothing said in the last few), rises in its place.
 * Under reduced motion it stays on the first. A reader of the screen hears one sentence, once, and not the changes.
 *
 * Every phrase is laid in the same cell, the unseen ones hidden, so the room kept is the longest phrase's own and
 * nothing under the sentence ever moves, whatever is drawn next.
 *
 * The one movement on a clock outside the working ring, asked for by the founder over D225's still names; it stops
 * whenever nobody can see it.
 */
const REMEMBERED = 8;

export function GoalsGoingBy({ first, kinds }: Readonly<{ first: string; kinds: readonly (readonly string[])[] }>) {
  const root = useRef<HTMLDivElement>(null);
  const said = useRef<HTMLSpanElement>(null);
  const [now, setNow] = useState(first);
  const recent = useRef<string[]>([first]);
  const all = kinds.flat();

  useEffect(() => {
    const element = root.current;
    if (!element || all.length < 2 || reduced()) return;
    let seen = false;
    let timer: number | undefined;
    const next = () => {
      timer = undefined;
      if (!seen || document.hidden) return;
      const { outMs, outEasing, rise } = MOTION.rotate;
      const leaving = said.current?.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: `translateY(-${rise})` }], { duration: outMs, easing: outEasing, fill: "forwards" });
      if (!leaving) return;
      leaving.onfinish = () => {
        const drawn = nextGoal(kinds, recent.current);
        recent.current = [...recent.current, drawn].slice(-REMEMBERED);
        setNow(drawn);
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
  }, [kinds, all.length]);

  // Each new phrase rises into place from where the last one left, once it is drawn.
  const firstImage = useRef(true);
  useEffect(() => {
    if (firstImage.current) {
      firstImage.current = false;
      return;
    }
    const { inMs, inEasing, rise } = MOTION.rotate;
    said.current?.getAnimations().forEach((animation) => animation.cancel());
    said.current?.animate([{ opacity: 0, transform: `translateY(${rise})` }, { opacity: 1, transform: "none" }], { duration: inMs, easing: inEasing });
  }, [now]);

  if (!first) return null;
  return (
    <div ref={root} className="flex w-full flex-col items-center gap-[var(--space-sm)] text-center">
      <p className="sr-only">{HOME.waitsFor.all}</p>
      <p aria-hidden className={`${SAY} text-[var(--muted)]`}>
        {HOME.waitsFor.lead}
      </p>
      {/* A race's own name can be one long word ("Siebengebirgsmarathon"): it may break rather than push the page wider at 320. */}
      <p aria-hidden className={`${GOAL_SAID} grid w-full max-w-[880px] justify-items-center [overflow-wrap:anywhere]`}>
        {all.map((phrase) => (
          <span key={phrase} className="invisible col-start-1 row-start-1">
            {phrase}.
          </span>
        ))}
        <span ref={said} data-goal-said className="col-start-1 row-start-1 inline-block">
          {now}.
        </span>
      </p>
      <p className={`${HELP} mx-auto max-w-[460px] [@media(min-width:1024px)]:max-w-[34em]`}>{HOME.waitsFor.read}</p>
    </div>
  );
}
