"use client";
import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { CharacterState } from "./Character";
import { EASING, MOTION } from "@/src/design-tokens";
import { arrivalSchedule, bezierProgress, springEasing, springSettleMs, type ArrivalSchedule } from "@/src/motion";

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

/** What an arrival plays: the days that changed and when each starts, and when the amount counts. */
type Plan = Readonly<{ round: number; days: ReadonlyMap<string, Readonly<{ moment: "earned" | "returned"; delay: number }>>; amountAt: number | null }>;

const NOTHING: Plan = { round: 0, days: new Map(), amountAt: null };
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
  const [plan, setPlan] = useState<Plan>(NOTHING);
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
      if (reduced() || (earned.length + returned.length === 0 && !amount)) return;
      const schedule: ArrivalSchedule = arrivalSchedule(earned.length, returned.length, amount, ARRIVAL_TIMINGS);
      const days = new Map<string, { moment: "earned" | "returned"; delay: number }>();
      earned.forEach((id, index) => days.set(id, { moment: "earned", delay: schedule.earnedAt[index] }));
      returned.forEach((id, index) => days.set(id, { moment: "returned", delay: schedule.returnedAt[index] }));
      setPlan({ round, days, amountAt: schedule.amountAt });
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
  useEffect(() => {
    if (plan.amountAt === null || from === to) return;
    let frame = 0;
    const started = performance.now() + plan.amountAt;
    const step = (now: number) => {
      const t = Math.min(1, Math.max(0, now - started) / MOTION.count.durationMs);
      setShown(from + (to - from) * bezierProgress(MOTION.count.easing, t));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [plan.round, plan.amountAt, from, to]);
  return (
    <>
      <span aria-hidden data-count-settled={shown === to ? "true" : "false"} className="motion-reduce:hidden">
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
