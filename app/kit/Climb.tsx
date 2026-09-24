"use client";
import { useEffect, useRef } from "react";
import { MOTION } from "@/src/design-tokens";
import { forgetOnThisScreen, useSeen, writeSeen } from "./seen";
import { milestoneProgress } from "@/src/milestone-view";
import { Character } from "./Character";
import { milestoneCharacter, type MeterStatus } from "./MilestoneMeter";

/**
 * A climb, drawn as a trail (V4, document J; flat since D232): the way from nothing to the target, the part already
 * walked in ink and the part still ahead dashed, a flag at the end with the target on it, and the gift's one character
 * standing on the trail at today's reading, measured from nothing (`milestoneProgress`). It replaced the bar of the
 * meter on a gift's page, and since D232 it is on the card in a list as well, where the bar had stayed: the founder
 * wanted the trail everywhere, and flat, because the slope took room for nothing.
 *
 * What it says is said in words beside it (the state, and today's figure), so the drawing is hidden from a screen
 * reader. Nothing is drawn higher than the keeper has read.
 *
 * Its one movement answers the arrival on the screen (the brief, section 6): the character walks up from where this
 * device last saw it to where it stands today, once, in 700 ms on the standard curve (MOTION.count, Material's
 * extra-long1). A first visit, a reading that did not move, or a device that asks for reduced motion: it simply
 * stands where it is. Nothing plays on a clock and nothing repeats.
 */

/** The trail, in fractions of the drawing's height: where it lies, and how much it rises, which is nothing since D232. */
const FOOT = 0.2;
const RISE = 0;
/** The character's box, in pixels, and so the inset of the slope at both ends, which starts and ends under its middle. */
const BODY = 56;

export function Climb({ giftId, status }: Readonly<{ giftId: string; status: MeterStatus }>) {
  // A start too high climbed nothing: the character stands at the foot of the slope, leaving, rather than on the flag
  // where a first reading above the target would put it and where it would read as reached.
  const tooHigh = status.phase === "startTooHigh";
  const progress = tooHigh ? 0 : milestoneProgress(status);
  const walker = useRef<HTMLSpanElement>(null);
  const drawing = useRef<HTMLSpanElement>(null);
  const reading = tooHigh ? null : status.reached ? status.target : status.todayReading;

  const inked = useRef<SVGLineElement>(null);
  // Where this device last saw it, from the cookie the server read, so the first image already knows whether the walk
  // will play (the fix to #154): when it will, the walker and its ink are drawn not yet there and come in at the start.
  const saw = useSeen(`viky.seen.climb.${giftId}`);
  const walks = reading !== null && saw !== undefined && saw !== reading;
  useEffect(() => {
    if (reading === null) return;
    const key = `viky.seen.climb.${giftId}`;
    writeSeen(key, reading);
    const element = walker.current;
    const box = drawing.current;
    const ink = inked.current;
    const show = () => {
      element?.classList.remove("arrival-pending");
      ink?.classList.remove("arrival-pending");
    };
    if (!walks || !element || !box || saw === undefined || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      show();
      return () => forgetOnThisScreen(key);
    }
    const from = milestoneProgress({ ...status, todayReading: saw, reached: false });
    const width = box.clientWidth - BODY;
    const height = box.clientHeight;
    const dx = (from - progress) * width;
    const dy = (progress - from) * RISE * height;
    const timing = { duration: MOTION.count.durationMs, easing: MOTION.count.easing, fill: "backwards" as const };
    // Started from where it was seen in the same task the class goes, so the final position is never on screen first.
    const running = [element.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }], timing)];
    if (ink) running.push(ink.animate([{ strokeDasharray: `${from} 1` }, { strokeDasharray: `${progress} 1` }], timing));
    show();
    return () => {
      running.forEach((animation) => animation.cancel());
      forgetOnThisScreen(key);
    };
  }, [giftId, reading, progress, status, saw, walks]);

  return (
    <span ref={drawing} aria-hidden className="climb">
      <svg className="climb-slope" focusable="false">
        {/* Ahead: dashed, the whole slope, drawn first so the part climbed covers its own length. */}
        <line x1="0%" y1={`${pct(1 - FOOT)}`} x2="100%" y2={`${pct(1 - FOOT - RISE)}`} className="climb-ahead" />
        {/* The part climbed is the whole slope drawn up to today's reading (a dash as long as the progress), so the
            arrival can grow it rather than jump it. */}
        <line
          ref={inked}
          className={walks ? "climb-done arrival-pending" : "climb-done"}
          x1="0%"
          y1={`${pct(1 - FOOT)}`}
          x2="100%"
          y2={`${pct(1 - FOOT - RISE)}`}
          pathLength={1}
          strokeDasharray={`${progress} 1`}
        />
      </svg>
      {/* The flag at the top, its pole standing where the slope ends, and the target on it: the one number the drawing
          carries, because a slope needs an end. Where they started is in what was agreed, and is not said twice. */}
      <span className="climb-flag" style={{ bottom: pct(FOOT + RISE) }}>
        <span className="climb-flag-number">{status.target}</span>
        <svg width="22" height="34" viewBox="0 0 22 34" focusable="false">
          <rect x="1" y="0" width="3" height="34" rx="1.5" className="climb-flag-pole" />
          <path d="M4 2 H18 Q21 2 19.2 4.6 L16.6 8.4 Q15.6 10 16.6 11.6 L19.2 15.4 Q21 18 18 18 H4 Z" className="climb-flag-cloth" />
        </svg>
      </span>
      <span
        ref={walker}
        className={walks ? "climb-walker arrival-pending" : "climb-walker"}
        style={{ left: `calc(${progress} * (100% - ${BODY}px))`, bottom: pct(FOOT + RISE * progress) }}
      >
        <Character state={tooHigh ? "returned" : milestoneCharacter(status)} standing={false} className="h-auto w-full" />
      </span>
    </span>
  );
}

const pct = (fraction: number) => `${Math.round(fraction * 10_000) / 100}%`;
