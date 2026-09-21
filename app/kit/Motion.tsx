"use client";
import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { CharacterState } from "./Character";
import { EASING, MOTION } from "@/src/design-tokens";
import { arrivalSchedule, bezierProgress, springEasing, springSettleMs, type ArrivalSchedule } from "@/src/motion";
import { atRest, currentMood, subscribeToMood, type Mood } from "./mood";

/**
 * Every movement answers a gesture of the person (art direction brief, section 6, the founder's rule of 17 Sep).
 * Nothing here plays on a clock and nothing loops. Four triggers:
 * - the press, which the stylesheet answers, and `Success`, the gift character once a gesture has succeeded;
 * - the arrival on a screen, `Arrival`: what changed since the last visit plays once, in under two seconds;
 * - the entry into view while scrolling, `Reveal`: a short appearance, once;
 * - the hover of a pointer, `Gaze`: a character's face turns towards it. A phone has no hover, so it says nothing.
 *
 * Movement is played with the Web Animations API on the parts a character names (`data-part`), so the drawing and the
 * motion never know about each other. Position and size may overshoot, on Material's expressive spring; opacity never
 * does. When the device asks for reduced motion nothing moves at all, and the final state is simply there.
 */

const REDUCE = "(prefers-reduced-motion: reduce)";
const POINTER = "(hover: hover) and (pointer: fine)";

const reduced = () => typeof window === "undefined" || window.matchMedia(REDUCE).matches;

function subscribeToPointer(changed: () => void): () => void {
  const query = window.matchMedia(POINTER);
  query.addEventListener("change", changed);
  return () => query.removeEventListener("change", changed);
}

/**
 * Whether this device has a pointer that can hover over a thing without pressing it. A phone has not, which is why
 * nothing a person needs is ever carried by a hover (WCAG 1.4.13) and why an expression plays once on a choice there.
 */
export function useHasPointer(): boolean {
  return useSyncExternalStore(
    subscribeToPointer,
    () => window.matchMedia(POINTER).matches,
    () => false,
  );
}

function subscribeToReduce(changed: () => void): () => void {
  const query = window.matchMedia(REDUCE);
  query.addEventListener("change", changed);
  return () => query.removeEventListener("change", changed);
}

/**
 * True when the device asks for reduced motion. A server cannot ask, so it answers as a device that allows motion, and
 * the browser corrects it as soon as the page runs.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeToReduce,
    () => window.matchMedia(REDUCE).matches,
    () => false,
  );
}

const part = (root: Element, name: string) => root.querySelector<SVGElement>(`[data-part="${name}"]`);

/** A day earned: it gathers, jumps once, lands with a squash that springs back, and its face opens on the landing. */
function playEarned(root: Element, delay: number): Animation[] {
  const figure = part(root, "figure");
  if (!figure) return [];
  const face = part(root, "face");
  const shadow = part(root, "shadow");
  const { gatherMs, riseMs, fallMs, riseBy, landing } = MOTION.earned;
  const jumpMs = gatherMs + riseMs + fallMs;
  const land = springEasing(landing);
  const total = jumpMs + land.durationMs;
  const animations = [
    figure.animate(
      [
        { offset: 0, transform: "translateY(0) scale(1, 1)", easing: EASING.standardAccelerate },
        { offset: gatherMs / total, transform: "translateY(0) scale(1.1, 0.88)", easing: EASING.emphasizedDecelerate },
        { offset: (gatherMs + riseMs) / total, transform: `translateY(-${riseBy * 100}%) scale(0.94, 1.08)`, easing: EASING.emphasizedAccelerate },
        { offset: jumpMs / total, transform: "translateY(0) scale(1.12, 0.86)", easing: land.easing },
        { offset: 1, transform: "translateY(0) scale(1, 1)" },
      ],
      { duration: total, delay },
    ),
  ];
  if (face) {
    // The face squeezes shut as it gathers, stays shut in the air, and springs open on the landing.
    animations.push(
      face.animate(
        [
          { offset: 0, transform: "scale(1)", easing: EASING.standard },
          { offset: gatherMs / total, transform: "scale(0.35)" },
          { offset: jumpMs / total, transform: "scale(0.35)", easing: land.easing },
          { offset: 1, transform: "scale(1)" },
        ],
        { duration: total, delay },
      ),
    );
  }
  if (shadow) {
    animations.push(
      shadow.animate(
        [
          { offset: 0, transform: "scaleX(1)", easing: EASING.standard },
          { offset: (gatherMs + riseMs) / total, transform: "scaleX(0.62)", easing: EASING.standard },
          { offset: jumpMs / total, transform: "scaleX(1.1)", easing: land.easing },
          { offset: 1, transform: "scaleX(1)" },
        ],
        { duration: total, delay },
      ),
    );
  }
  return animations;
}

/** A day gone back: it slides to the left from where it stood and fades to its resting opacity, on the standard curve. */
function playReturned(root: Element, delay: number): Animation[] {
  const { durationMs, easing, fromOffset } = MOTION.returned;
  const from = `translateX(${fromOffset * 100}%)`;
  return (["figure", "shadow"] as const).flatMap((name) => {
    const element = part(root, name);
    if (!element) return [];
    const keyframe = name === "figure" ? { offset: 0, transform: from, opacity: 1 } : { offset: 0, transform: from };
    return [element.animate([keyframe], { duration: durationMs, delay, easing, fill: "backwards" })];
  });
}

/** The gift arrives on the expressive spring, grown from a little way below, and its bow springs open a beat later. */
function playGift(root: Element): Animation[] {
  const { spatial, effects, fromScale, bowDelayMs } = MOTION.gift;
  const spring = springEasing(spatial);
  const fade = springEasing(effects);
  const animations: Animation[] = [];
  const figure = part(root, "figure");
  const bow = part(root, "bow");
  const shadow = part(root, "shadow");
  if (figure) {
    animations.push(figure.animate([{ transform: `translateY(12%) scale(${fromScale})` }, { transform: "translateY(0) scale(1)" }], { duration: spring.durationMs, easing: spring.easing }));
    animations.push(figure.animate([{ opacity: 0 }, { opacity: 1 }], { duration: fade.durationMs, easing: fade.easing }));
  }
  if (bow) {
    animations.push(bow.animate([{ transform: "rotate(-16deg) scale(0.6)" }, { transform: "rotate(0deg) scale(1)" }], { duration: spring.durationMs, easing: spring.easing, delay: bowDelayMs, fill: "backwards" }));
  }
  if (shadow) {
    animations.push(shadow.animate([{ transform: `scaleX(${fromScale})` }, { transform: "scaleX(1)" }], { duration: spring.durationMs, easing: spring.easing }));
    animations.push(shadow.animate([{ opacity: 0 }, { opacity: 1 }], { duration: fade.durationMs, easing: fade.easing }));
  }
  return animations;
}

/**
 * The gift character answering a gesture that succeeded: it arrives once when it is mounted, which is when the gesture
 * brought the person here, and again each time `gesture` changes, which is each time the gesture is made again.
 */
export function Success({ gesture = 0, children }: Readonly<{ gesture?: number; children: ReactNode }>) {
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const element = root.current;
    if (!element || reduced()) return;
    const running = playGift(element);
    return () => running.forEach((animation) => animation.cancel());
  }, [gesture]);
  return (
    <span ref={root} data-success className="contents">
      {children}
    </span>
  );
}

/**
 * What an arrival plays: the days that changed and when each starts, and when the amount counts.
 *
 * `decided` is whether the arrival has read what this device last saw, which it can only do once the page runs. Until
 * then nothing knows yet whether the amount is about to count, and an amount that answers "settled" during that
 * window is answering before the question was asked.
 */
type Plan = Readonly<{
  round: number;
  days: ReadonlyMap<string, Readonly<{ moment: "earned" | "returned"; delay: number }>>;
  amountAt: number | null;
  decided: boolean;
}>;

/** Outside any arrival there is nothing to wait for, so the question is settled from the first paint. */
const NOTHING: Plan = { round: 0, days: new Map(), amountAt: null, decided: true };
/** Inside one, before the first frame: what plays is not known yet. */
const UNDECIDED: Plan = { ...NOTHING, decided: false };
const ArrivalContext = createContext<Plan>(NOTHING);

/** The laboratory's "Replay arrival" sends this, and every arrival on the screen plays again from its example's last visit. */
export const REPLAY_ARRIVAL = "viky:replay-arrival";

export type ArrivalGift = Readonly<{
  id: string;
  days: readonly CharacterState[];
  /** How many settled days the last visit saw, when this device keeps no record of one. */
  lastSeen: number;
}>;

const isSettled = (day: CharacterState) => day === "earned" || day === "returned";

function readLastSeen(key: string): number | undefined {
  try {
    const value = window.localStorage.getItem(key);
    return value === null || !Number.isFinite(Number(value)) ? undefined : Number(value);
  } catch {
    return undefined;
  }
}

function writeLastSeen(key: string, value: number): void {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // A device that keeps nothing sees every arrival as a first one, which is harmless.
  }
}

const ARRIVAL_TIMINGS = {
  earnedAirborneMs: MOTION.earned.gatherMs + MOTION.earned.riseMs + MOTION.earned.fallMs,
  earnedMs: MOTION.earned.gatherMs + MOTION.earned.riseMs + MOTION.earned.fallMs + springSettleMs(MOTION.earned.landing),
  returnedMs: MOTION.returned.durationMs,
  countMs: MOTION.count.durationMs,
  budgetMs: MOTION.arrival.budgetMs,
  staggerMs: MOTION.arrival.staggerMs,
} as const;

/**
 * The arrival on a screen (brief, section 6): what changed since the last visit plays once, in order, every day earned,
 * then every day gone back, then the amount counting, all of it in under two seconds. The last visit is kept on the
 * device, per gift, as the number of settled days it saw; a device that keeps nothing uses the gift's `lastSeen`.
 */
export function Arrival({ storageKey, gifts, amount = false, children }: Readonly<{ storageKey: string; gifts: readonly ArrivalGift[]; amount?: boolean; children: ReactNode }>) {
  const [plan, setPlan] = useState<Plan>(UNDECIDED);
  const giftsKey = JSON.stringify(gifts);

  useEffect(() => {
    const list = JSON.parse(giftsKey) as ArrivalGift[];
    let round = 0;
    const play = (fromExample: boolean) => {
      round += 1;
      const earned: string[] = [];
      const returned: string[] = [];
      for (const gift of list) {
        const key = `${storageKey}.${gift.id}`;
        const seen = fromExample ? gift.lastSeen : (readLastSeen(key) ?? gift.lastSeen);
        let settled = 0;
        gift.days.forEach((day, index) => {
          if (!isSettled(day)) return;
          if (settled >= seen) (day === "earned" ? earned : returned).push(`${gift.id}:${index}`);
          settled += 1;
        });
        writeLastSeen(key, settled);
      }
      // Nothing changed at all: nothing to replay. An amount that changed on its own still counts, last and alone.
      // Said out loud rather than by staying silent, because whoever waits for the count waits on this answer.
      if (reduced() || (earned.length + returned.length === 0 && !amount)) {
        setPlan({ round, days: new Map(), amountAt: null, decided: true });
        return;
      }
      const schedule: ArrivalSchedule = arrivalSchedule(earned.length, returned.length, amount, ARRIVAL_TIMINGS);
      const days = new Map<string, { moment: "earned" | "returned"; delay: number }>();
      earned.forEach((id, index) => days.set(id, { moment: "earned", delay: schedule.earnedAt[index] }));
      returned.forEach((id, index) => days.set(id, { moment: "returned", delay: schedule.returnedAt[index] }));
      setPlan({ round, days, amountAt: schedule.amountAt, decided: true });
    };
    // The last visit lives on the device, which the server cannot read, so the arrival is decided once the page runs.
    const frame = requestAnimationFrame(() => play(false));
    const replay = () => play(true);
    window.addEventListener(REPLAY_ARRIVAL, replay);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener(REPLAY_ARRIVAL, replay);
    };
  }, [storageKey, giftsKey, amount]);

  return <ArrivalContext.Provider value={plan}>{children}</ArrivalContext.Provider>;
}

/** One day of a gift inside an arrival: it plays its moment if it changed since the last visit, and stands still otherwise. */
export function ArrivalDay({ gift, index, children }: Readonly<{ gift: string; index: number; children: ReactNode }>) {
  const plan = useContext(ArrivalContext);
  const root = useRef<HTMLSpanElement>(null);
  const step = plan.days.get(`${gift}:${index}`);
  useEffect(() => {
    const element = root.current;
    if (!element || !step) return;
    const running = step.moment === "earned" ? playEarned(element, step.delay) : playReturned(element, step.delay);
    return () => running.forEach((animation) => animation.cancel());
  }, [plan.round, step]);
  return (
    <span ref={root} className="contents">
      {children}
    </span>
  );
}

/**
 * The amount inside an arrival: it counts from the value of the last visit to its value, last and once, when something
 * changed. A screen reader reads the value itself, never a number on the way, and a device that asks for reduced motion
 * is only ever shown the value itself.
 */
export function ArrivalAmount({ from, to, symbol, decimals = 2, after = "" }: Readonly<{ from: number; to: number; symbol: string; decimals?: number; after?: string }>) {
  const plan = useContext(ArrivalContext);
  const format = (value: number) => `${symbol}${value.toLocaleString("en-GB", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${after}`;
  const [shown, setShown] = useState(to);
  /**
   * Whether the figure on the screen is the account's own, which is what a capture run waits for.
   *
   * It cannot be read from the figure itself. Before the first frame the count has not started, so the figure IS the
   * value and comparing them answers "arrived" about a count that is about to begin: the captures of 18 and 19 Sep
   * were taken in exactly that window and kept $0.38, $1.15 and $1.83 of an account holding $2.00. So it is the count
   * that says when it is over, and until the arrival has decided, nothing says it is.
   */
  const [counted, setCounted] = useState<string | null>(null);
  // Which count finished, rather than whether one did: when a new one starts, this no longer names it, and nothing
  // has to remember to say so.
  const count = `${plan.round}:${from}:${to}`;
  useEffect(() => {
    if (plan.amountAt === null || from === to) return;
    let frame = 0;
    const started = performance.now() + plan.amountAt;
    const step = (now: number) => {
      const t = Math.min(1, Math.max(0, now - started) / MOTION.count.durationMs);
      if (t < 1) {
        setShown(from + (to - from) * bezierProgress(MOTION.count.easing, t));
        frame = requestAnimationFrame(step);
        return;
      }
      // The last frame lands on the value itself rather than on what the easing computes of it, so nothing is left a
      // hundredth short of the money it names.
      setShown(to);
      setCounted(count);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [plan.round, plan.amountAt, from, to, count]);
  const settled = plan.decided && (plan.amountAt === null || from === to || counted === count);
  return (
    <>
      <span aria-hidden data-count-settled={settled ? "true" : "false"} className="motion-reduce:hidden">
        {format(decimals === 0 ? Math.round(shown) : Math.round(shown * 100) / 100)}
      </span>
      <span aria-hidden className="hidden motion-reduce:inline">
        {format(to)}
      </span>
      <span className="sr-only">{format(to)}</span>
    </>
  );
}

/**
 * Something scrolled into view for the first time appears, rising a few pixels, once (brief, section 6). What is already
 * in view when the screen opens does not move: that is the arrival's business. Nothing behind it moves, no parallax.
 */
export function Reveal({ className, children }: Readonly<{ className?: string; children: ReactNode }>) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current;
    if (!element || reduced() || typeof IntersectionObserver === "undefined") return;
    let first = true;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (first) {
        first = false;
        if (entry.isIntersecting) {
          observer.disconnect();
          return;
        }
      }
      if (!entry.isIntersecting) return;
      observer.disconnect();
      const { durationMs, easing, rise } = MOTION.reveal;
      element.animate([{ opacity: 0, transform: `translateY(${rise}px)` }, { opacity: 1, transform: "translateY(0)" }], { duration: durationMs, easing });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={root} data-reveal className={className}>
      {children}
    </div>
  );
}

/**
 * The two expressions the founder asked for on 21 Sep 2026 (the motion roadmap, step 2), built from the parts a
 * character already has, the gaze, the eyes and the mouth, with nothing new drawn:
 *
 * - **curious**, on the line that says what they will do: the gaze turns towards that line and the mouth opens a
 *   little. Where the line is, is where it looks: the direction is measured from the character's own box to the
 *   control's, which is the same arithmetic `Gaze` does with a pointer.
 * - **happy**, on a length being considered: the eyes narrow into a smile and the mouth widens a touch.
 *
 * With a pointer it is the hover, 200 ms in and 200 ms back, `MOTION.hover`. With a finger there is no hover at all,
 * so the expression plays once when the choice is made and comes back by itself: one animation of 700 ms with the
 * face held in the middle of it, never a clock and never a loop. Reduced motion is given the rest face and nothing
 * else, which is what `reduced()` decides here as everywhere.
 */
type Faces = Readonly<{ gaze?: string; eye?: string; mouth?: string }>;

const AT_REST: Faces = { gaze: "translate(0px, 0px)", eye: "scaleY(1)", mouth: "scale(1, 1)" };

function facesOf(mood: Mood, towards: Readonly<{ dx: number; dy: number }>): Faces {
  if (mood.feeling === "curious") {
    const { gaze } = MOTION.hover;
    return { ...AT_REST, gaze: `translate(${(towards.dx * gaze).toFixed(2)}px, ${(towards.dy * gaze).toFixed(2)}px)`, mouth: "scale(1, 1.6)" };
  }
  if (mood.feeling === "happy") return { ...AT_REST, eye: "scaleY(0.34)", mouth: "scale(1.18, 1.08)" };
  return AT_REST;
}

const partsNamed = (root: Element, name: string) => [...root.querySelectorAll<SVGElement>(`[data-part="${name}"]`)];

/** Writes what an animation has reached into the drawing and lets it go, so nothing is held by the animation itself. */
function keep(animation: Animation): void {
  try {
    animation.commitStyles();
  } catch {
    // An element that is no longer drawn cannot be written to, and has nothing left to keep.
  }
  animation.cancel();
}

/** The character at the head of a screen, wearing what the card below it is being asked about (app/kit/mood.ts). */
export function Expression({ children }: Readonly<{ children: ReactNode }>) {
  const root = useRef<HTMLSpanElement>(null);
  const mood = useSyncExternalStore(subscribeToMood, currentMood, atRest);
  useEffect(() => {
    const element = root.current;
    if (!element || reduced()) return;
    const drawing = element.querySelector("svg");
    if (!drawing) return;
    const box = drawing.getBoundingClientRect();
    const dx = (mood.at?.x ?? box.left + box.width / 2) - (box.left + box.width / 2);
    const dy = (mood.at?.y ?? box.top + box.height / 2) - (box.top + box.height / 2);
    const distance = Math.hypot(dx, dy) || 1;
    const faces = facesOf(mood, { dx: dx / distance, dy: dy / distance });
    const { durationMs, easing, heldMs } = MOTION.hover;
    const running: Animation[] = [];
    const roundMs = durationMs * 2 + heldMs;
    for (const [name, to] of Object.entries(faces) as Array<[keyof Faces, string]>) {
      const rest = AT_REST[name] ?? "none";
      for (const part of partsNamed(element, name)) {
        // One movement out and back when nothing will ever leave it: a finger has no pointer to withdraw.
        const keyframes = mood.once
          ? [{ transform: rest }, { transform: to, offset: durationMs / roundMs }, { transform: to, offset: (durationMs + heldMs) / roundMs }, { transform: rest }]
          : [{ transform: to }];
        const played = part.animate(keyframes, { duration: mood.once ? roundMs : durationMs, easing, fill: "forwards" });
        // What it ends on is written into the drawing itself, so the next expression starts from the face that is
        // there rather than from the face it was drawn with, and the pointer's own gaze keeps the same channel.
        void played.finished
          .then(() => {
            keep(played);
          })
          .catch(() => undefined);
        running.push(played);
      }
    }
    // A mood that changes mid-movement keeps the face it had reached, so nothing ever jumps back to start again.
    return () => running.forEach(keep);
  }, [mood]);
  return (
    <span ref={root} data-mood={mood.feeling} className="contents">
      {children}
    </span>
  );
}

/**
 * A character's face turns towards a pointer hovering it, and comes back when the pointer leaves. A pointer only: a
 * finger has no hover, so nothing a person needs is ever carried by this (WCAG 1.4.13).
 */
export function Gaze({ children }: Readonly<{ children: ReactNode }>) {
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const element = root.current;
    if (!element || reduced() || !window.matchMedia(POINTER).matches) return;
    const { durationMs, easing, gaze } = MOTION.hover;
    const eyesOf = () => part(element, "gaze");
    const look = (event: PointerEvent) => {
      const eyes = eyesOf();
      const svg = element.querySelector("svg");
      if ((event.pointerType !== "mouse" && event.pointerType !== "pen") || !eyes || !svg) return;
      const box = svg.getBoundingClientRect();
      const dx = event.clientX - (box.left + box.width / 2);
      const dy = event.clientY - (box.top + box.height / 2);
      const distance = Math.hypot(dx, dy) || 1;
      eyes.style.transition = `transform ${durationMs}ms ${easing}`;
      eyes.style.transform = `translate(${((dx / distance) * gaze).toFixed(2)}px, ${((dy / distance) * gaze).toFixed(2)}px)`;
    };
    const rest = () => {
      const eyes = eyesOf();
      if (eyes) eyes.style.transform = "translate(0px, 0px)";
    };
    element.addEventListener("pointermove", look);
    element.addEventListener("pointerleave", rest);
    return () => {
      element.removeEventListener("pointermove", look);
      element.removeEventListener("pointerleave", rest);
    };
  }, []);
  return (
    <span ref={root} data-gaze className="contents">
      {children}
    </span>
  );
}

/**
 * What this device last saw of a number, so an arrival can count from it to what it is now. It is read once, as an
 * external store, and remembered as soon as it is read, so a second visit finds nothing to replay. A device that keeps
 * nothing simply never counts.
 */
function readSeen(key: string): number | undefined {
  try {
    const stored = window.localStorage.getItem(key);
    return stored === null || !Number.isFinite(Number(stored)) ? undefined : Number(stored);
  } catch {
    return undefined;
  }
}

const neverChanges = () => () => {};
const nothingSeen = () => undefined;

export function useLastSeen(key: string, value: number | undefined): number | undefined {
  const stored = useSyncExternalStore(neverChanges, () => readSeen(key), nothingSeen);
  // Frozen at the first render, because the effect below is about to write over it.
  const [seen] = useState(stored);
  useEffect(() => {
    if (value === undefined) return;
    try {
      window.localStorage.setItem(key, String(value));
    } catch {
      // A device that keeps nothing sees every arrival as a first one, which is harmless.
    }
  }, [key, value]);
  return seen;
}
