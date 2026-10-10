"use client";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { MOTION } from "@/src/design-tokens";
import { nextGoal } from "@/src/landing-goals";
import { HOME } from "@/src/sentences";
import { GOAL_SAID, SAY } from "../components/ui";
import { reduced } from "./Motion";

/**
 * Under the landing's card, what a gift can wait for, one thing at a time (D285, widened by D286). The phrases come
 * from the server (`landingGoals`) with the first one drawn there, so the first image is the first phrase. Then, while
 * the sentence is on the screen and the tab is in front, each phrase is held long enough to read, leaves upward, and
 * the next, drawn at random (`nextGoal`: another kind than the last, nothing said in the last few), rises in its place.
 * Under reduced motion it stays on the first. A reader of the screen hears one sentence, once, and not the changes.
 *
 * Every phrase is laid in the same cell, the unseen ones hidden, so the room kept is the longest phrase's own and
 * nothing under the sentence ever moves, whatever is drawn next. A race is said by its distance and its town, so the
 * longest phrase is two lines on a phone and the cell leaves no hole under the others (the founder, 5 Oct 2026). The
 * small print that stood under it is at the foot of the page.
 *
 * The one movement on a clock outside the working ring, asked for by the founder over D225's still names; it stops
 * whenever nobody can see it.
 *
 * The change is made in one place (10 Oct 2026, after the founder found the phrase gone on viky.cash, "Their gift can
 * wait for" with nothing after it, and it stayed gone). The phrase that leaves is held unseen until the next one is
 * drawn; the next one used to be drawn by React at its own time and brought in by a second effect that followed the
 * text, so if that effect did not come, nothing ever brought the phrase back. Now, as the exit ends, the next phrase
 * is written and its entrance started in the same gesture. What caused it that day was not found: a probe of several
 * hundred manipulations did not make it happen again. So whatever becomes of an exit is answered too. An exit that is
 * cancelled goes on to the next wait. An effect that was cleaned up does nothing more, where an exit it had started
 * used to set a timer nobody could clear, a second loop beside the new one. And a net: a little after every exit, and
 * at every moment the loop looks at itself, a phrase that nothing is moving and that cannot be seen is shown.
 */
const REMEMBERED = 8;
/** Under this opacity a phrase is not seen. */
const UNSEEN = 0.05;
/** How long after an exit should have ended the net looks at what became of it. */
const NET_AFTER_MS = 400;

export function GoalsGoingBy({ first, kinds }: Readonly<{ first: string; kinds: readonly (readonly string[])[] }>) {
  const root = useRef<HTMLDivElement>(null);
  const said = useRef<HTMLSpanElement>(null);
  const [now, setNow] = useState(first);
  const recent = useRef<string[]>([first]);
  const all = kinds.flat();

  useEffect(() => {
    const element = root.current;
    if (!element || all.length < 2 || reduced()) return;
    const { holdMs, outMs, outEasing, inMs, inEasing, rise } = MOTION.rotate;
    /** False once this effect is cleaned up: nothing it started does anything after that. */
    let alive = true;
    let seen = false;
    let timer: number | undefined;
    let net: number | undefined;
    /** The exit under way, until what became of it is known. */
    let leaving: Animation | undefined;

    /** The net: a phrase that nothing is moving and that cannot be seen is shown, as it stands. */
    const mend = () => {
      const phrase = said.current;
      if (!phrase) return;
      const drawn = phrase.getAnimations();
      if (drawn.some((one) => one.playState === "running") || Number(getComputedStyle(phrase).opacity) >= UNSEEN) return;
      leaving = undefined;
      drawn.forEach((one) => one.cancel());
    };
    const schedule = () => {
      if (!alive) return;
      mend();
      if (timer === undefined && leaving === undefined && seen && !document.hidden) timer = window.setTimeout(next, holdMs);
    };
    /** The change, in one place: the next phrase is written and its entrance started, in the gesture that ends the exit. */
    const change = () => {
      const phrase = said.current;
      if (!phrase) return;
      const drawn = nextGoal(kinds, recent.current);
      recent.current = [...recent.current, drawn].slice(-REMEMBERED);
      // Written at once, and not at React's next convenience: the entrance below starts on the new words.
      flushSync(() => setNow(drawn));
      phrase.getAnimations().forEach((one) => one.cancel());
      phrase.animate([{ opacity: 0, transform: `translateY(${rise})` }, { opacity: 1, transform: "none" }], { duration: inMs, easing: inEasing });
    };
    const next = () => {
      timer = undefined;
      if (!alive || !seen || document.hidden) return;
      const phrase = said.current;
      if (!phrase) return;
      const exit = phrase.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: `translateY(-${rise})` }], { duration: outMs, easing: outEasing, fill: "forwards" });
      leaving = exit;
      exit.finished.then(
        () => {
          if (!alive || leaving !== exit) return;
          leaving = undefined;
          try {
            change();
          } finally {
            schedule();
          }
        },
        // Cancelled: the phrase is as it was, and the loop goes on to its next wait.
        () => {
          if (!alive || leaving !== exit) return;
          leaving = undefined;
          schedule();
        },
      );
      window.clearTimeout(net);
      net = window.setTimeout(() => {
        net = undefined;
        schedule();
      }, outMs + NET_AFTER_MS);
    };
    const observer = new IntersectionObserver((entries) => {
      seen = entries[entries.length - 1].isIntersecting;
      if (seen) schedule();
    });
    observer.observe(element);
    const onVisibility = () => schedule();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      alive = false;
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearTimeout(timer);
      window.clearTimeout(net);
      // An exit under way is taken back: the phrase stands as it was, and nothing of this effect follows it.
      leaving?.cancel();
    };
  }, [kinds, all.length]);

  if (!first) return null;
  return (
    <div ref={root} data-goals-going-by="" className="flex w-full flex-col items-center gap-[var(--space-sm)] text-center">
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
        {/* The phrase shown now is what the way to the card centres with it, not the room kept for the longest one. */}
        <span ref={said} data-goal-said data-follows-card="" className="col-start-1 row-start-1 inline-block">
          {now}.
        </span>
      </p>
    </div>
  );
}
