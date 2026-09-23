"use client";
import { useEffect, useRef } from "react";
import { MOTION } from "@/src/design-tokens";
import { milestoneProgress } from "@/src/milestone-view";
import { Character } from "./Character";
import { milestoneCharacter, type MeterStatus } from "./MilestoneMeter";

/**
 * A climb, drawn as one (V4, document J): a slope from where they started to the target, the part already climbed in
 * ink and the part still ahead dashed, a flag at the top with the target on it, and the gift's one character standing
 * on the slope at today's reading. It replaces the bar of the meter on a gift's page, which D132 had already taken off
 * the card on Home because an empty bar read as a strange horizontal line.
 *
 * What it says is said in words beside it (the state, and today's figure), so the drawing is hidden from a screen
 * reader. Nothing is drawn higher than the keeper has read.
 *
 * Its one movement answers the arrival on the screen (the brief, section 6): the character walks up from where this
 * device last saw it to where it stands today, once, in 700 ms on the standard curve (MOTION.count, Material's
 * extra-long1). A first visit, a reading that did not move, or a device that asks for reduced motion: it simply
 * stands where it is. Nothing plays on a clock and nothing repeats.
 */

/** The slope, in fractions of the drawing's height, from its foot to its top: what the character's feet follow. */
const FOOT = 0.1;
const RISE = 0.58;
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
  useEffect(() => {
    if (reading === null) return;
    const key = `viky.seen.climb.${giftId}`;
    let before: number | null = null;
    try {
      const stored = window.localStorage.getItem(key);
      before = stored === null || !Number.isFinite(Number(stored)) ? null : Number(stored);
      window.localStorage.setItem(key, String(reading));
    } catch {
      // A device that keeps nothing sees every visit as a first one, and a first one does not move.
    }
    const element = walker.current;
    const box = drawing.current;
    if (before === null || before === reading || !element || !box) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const from = milestoneProgress({ ...status, todayReading: before, reached: false });
    const width = box.clientWidth - BODY;
    const height = box.clientHeight;
    const dx = (from - progress) * width;
    const dy = (progress - from) * RISE * height;
    element.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }], {
      duration: MOTION.count.durationMs,
      easing: MOTION.count.easing,
    });
    // The ink climbs with it: the part climbed grows from where this device last saw it to today's reading.
    inked.current?.animate([{ strokeDasharray: `${from} 1` }, { strokeDasharray: `${progress} 1` }], {
      duration: MOTION.count.durationMs,
      easing: MOTION.count.easing,
    });
    // Once per reading seen, never again for the same one: the value is written before anything plays.
  }, [giftId, reading, progress, status]);

  return (
    <span ref={drawing} aria-hidden className="climb">
      <svg className="climb-slope" focusable="false">
        {/* Ahead: dashed, the whole slope, drawn first so the part climbed covers its own length. */}
        <line x1="0%" y1={`${pct(1 - FOOT)}`} x2="100%" y2={`${pct(1 - FOOT - RISE)}`} className="climb-ahead" />
        {/* The part climbed is the whole slope drawn up to today's reading (a dash as long as the progress), so the
            arrival can grow it rather than jump it. */}
        <line
          ref={inked}
          x1="0%"
          y1={`${pct(1 - FOOT)}`}
          x2="100%"
          y2={`${pct(1 - FOOT - RISE)}`}
          pathLength={1}
          strokeDasharray={`${progress} 1`}
          className="climb-done"
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
        className="climb-walker"
        style={{ left: `calc(${progress} * (100% - ${BODY}px))`, bottom: pct(FOOT + RISE * progress) }}
      >
        <Character state={tooHigh ? "returned" : milestoneCharacter(status)} standing={false} className="h-auto w-full" />
      </span>
    </span>
  );
}

const pct = (fraction: number) => `${Math.round(fraction * 10_000) / 100}%`;
