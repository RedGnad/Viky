"use client";
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import type { CharacterState } from "./Character";
import { EASING, MOTION } from "@/src/design-tokens";
import { arrivalSchedule, bezierProgress, springEasing, springSettleMs, type ArrivalSchedule } from "@/src/motion";
import { atRest, currentMood, feel, subscribeToMood, type Mood } from "./mood";
import { forgetOnThisScreen, useSeen, useSeenMany, writeSeen } from "./seen";

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

export const reduced = () => typeof window === "undefined" || window.matchMedia(REDUCE).matches;

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

/**
 * A day earned: it gathers, jumps once, lands with a squash that springs back, and its face opens on the landing.
 *
 * `wakes` is the day itself, in an arrival (the founder, 4 Oct 2026): a day sleeps until it is done, so it stands with
 * its eyes shut until its turn, makes one small turn in the air, and opens its eyes and its smile as it lands. Without
 * it, the same jump as the head of a screen makes it, eyes open: its face squeezes shut in the air and nothing turns.
 */
function playEarned(root: Element, delay: number, wakes = false): Animation[] {
  const figure = part(root, "figure");
  if (!figure) return [];
  const face = part(root, "face");
  const shadow = part(root, "shadow");
  const { gatherMs, riseMs, fallMs, riseBy, landing, turns, eyesShut, mouthShut } = MOTION.earned;
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
  if (wakes) {
    // Asleep until its turn (the keyframes hold through the delay), asleep in the air, awake on the landing spring.
    const opens = (shut: string): Keyframe[] => [
      { offset: 0, transform: shut },
      { offset: jumpMs / total, transform: shut, easing: land.easing },
      { offset: 1, transform: "none" },
    ];
    for (const eye of root.querySelectorAll<SVGElement>('[data-part="eye"]')) animations.push(eye.animate(opens(`scaleY(${eyesShut})`), { duration: total, delay, fill: "backwards" }));
    const mouth = part(root, "mouth");
    if (mouth) animations.push(mouth.animate(opens(`scale(${mouthShut})`), { duration: total, delay, fill: "backwards" }));
    // The small turn: in the air only, slowing down so the day is upright as it touches the floor.
    const whirl = part(root, "whirl");
    if (whirl) {
      animations.push(
        whirl.animate(
          [
            { offset: 0, transform: `rotate(${-360 * turns}deg)` },
            { offset: gatherMs / total, transform: `rotate(${-360 * turns}deg)`, easing: EASING.emphasizedDecelerate },
            { offset: jumpMs / total, transform: "rotate(0deg)" },
            { offset: 1, transform: "rotate(0deg)" },
          ],
          { duration: total, delay },
        ),
      );
    }
  } else if (face) {
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

/**
 * A day that opens wakes (the founder, 4 Oct 2026): the sleeping capsule it was fades as the triangle rises from the
 * capsule's own height, then its eyes open. A small movement, well under the jump of a day earned, which stays the
 * only jump: nothing leaves the floor, nothing overshoots. Everything holds its first frame until the day's turn.
 */
function playWoken(root: Element, delay: number): Animation[] {
  const figure = part(root, "figure");
  if (!figure) return [];
  const was = part(root, "was");
  const { becomeMs, easing, fade, fromHeight, eyes } = MOTION.wake;
  const open = springEasing(eyes);
  const total = becomeMs + open.durationMs;
  const animations = [
    figure.animate([{ transform: `scaleY(${fromHeight})` }, { transform: "scaleY(1)" }], { duration: becomeMs, delay, easing, fill: "backwards" }),
    figure.animate([{ opacity: 0 }, { opacity: 1 }], { duration: becomeMs, delay, easing: fade, fill: "backwards" }),
  ];
  if (was) animations.push(was.animate([{ opacity: 1 }, { opacity: 0 }], { duration: becomeMs, delay, easing: fade, fill: "backwards" }));
  // The eyes of the triangle alone: shut while it rises, then open, on the spring that never overshoots.
  const shut = `scaleY(${MOTION.earned.eyesShut})`;
  for (const eye of figure.querySelectorAll<SVGElement>('[data-part="eye"]')) {
    animations.push(
      eye.animate(
        [
          { offset: 0, transform: shut },
          { offset: becomeMs / total, transform: shut, easing: open.easing },
          { offset: 1, transform: "none" },
        ],
        { duration: total, delay, fill: "backwards" },
      ),
    );
  }
  return animations;
}

/**
 * The gift arrives on the expressive spring, grown from a little way below, and its bow springs open a beat later.
 * `appears` false is the same movement of a character that is already there: the spring alone, with nothing fading
 * in, since a character on the screen that went out and came back would be a blink.
 */
function playGift(root: Element, appears = true): Animation[] {
  const { spatial, effects, fromScale, bowDelayMs } = MOTION.gift;
  const spring = springEasing(spatial);
  const fade = springEasing(effects);
  const animations: Animation[] = [];
  const figure = part(root, "figure");
  const bow = part(root, "bow");
  const shadow = part(root, "shadow");
  if (figure) {
    animations.push(figure.animate([{ transform: `translateY(12%) scale(${fromScale})` }, { transform: "translateY(0) scale(1)" }], { duration: spring.durationMs, easing: spring.easing }));
    if (appears) animations.push(figure.animate([{ opacity: 0 }, { opacity: 1 }], { duration: fade.durationMs, easing: fade.easing }));
  }
  if (bow) {
    animations.push(bow.animate([{ transform: "rotate(-16deg) scale(0.6)" }, { transform: "rotate(0deg) scale(1)" }], { duration: spring.durationMs, easing: spring.easing, delay: bowDelayMs, fill: "backwards" }));
  }
  if (shadow) {
    animations.push(shadow.animate([{ transform: `scaleX(${fromScale})` }, { transform: "scaleX(1)" }], { duration: spring.durationMs, easing: spring.easing }));
    if (appears) animations.push(shadow.animate([{ opacity: 0 }, { opacity: 1 }], { duration: fade.durationMs, easing: fade.easing }));
  }
  return animations;
}

/**
 * One movement of a day, by itself and from its start, for the looks laboratory alone (app/dev/looks): the founder
 * judges each animation and plays it as many times as he wants. The product never calls this: there a day moves
 * because it changed since the last visit, once. Nothing moves under reduced motion, as everywhere.
 */
export function playMoment(moment: "earned" | "returned" | "woken", root: Element): void {
  if (reduced()) return;
  for (const running of root.getAnimations({ subtree: true })) running.cancel();
  if (moment === "earned") playEarned(root, 0, true);
  else if (moment === "woken") playWoken(root, 0);
  else playReturned(root, 0);
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
 * A character already on the screen answering a gesture made on that screen (the founder, 4 Oct 2026: a gift opened,
 * and the gift's own character at the head of its page reacts, once): the gift's movement on its spring, each time
 * `gesture` changes, and never when it is first drawn. It starts before the browser paints the screen the gesture
 * made, so the character is never seen at rest and then small (D243).
 */
export function Reacts({ gesture, children }: Readonly<{ gesture: number; children: ReactNode }>) {
  const root = useRef<HTMLSpanElement>(null);
  const answered = useRef(gesture);
  useLayoutEffect(() => {
    if (answered.current === gesture) return;
    answered.current = gesture;
    const element = root.current;
    if (!element || reduced()) return;
    const running = playGift(element, false);
    return () => running.forEach((animation) => animation.cancel());
  }, [gesture]);
  return (
    <span ref={root} data-reacts className="contents">
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
/** What a day does in an arrival: a day earned jumps awake, a day gone back leaves, a day that opened wakes. */
type Moment = "earned" | "returned" | "woken";

type Plan = Readonly<{
  round: number;
  days: ReadonlyMap<string, Readonly<{ moment: Moment; delay: number }>>;
  amountAt: number | null;
  decided: boolean;
  /**
   * The days that changed since this device's last visit, known from the first image on (the fix to #154): the server
   * draws them not yet there, and the browser starts them from there. Never the final state followed by a restart.
   */
  pending: ReadonlySet<string>;
  /** The gifts this plan was decided for: gifts that change while the screen stands are decided again. */
  about: string;
}>;

/** Outside any arrival there is nothing to wait for, so the question is settled from the first paint. */
const NOTHING: Plan = { round: 0, days: new Map(), amountAt: null, decided: true, pending: new Set(), about: "" };
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
/** Which day of a gift is open, to do now: the one drawn awake, or none (not started, or today already done). */
const openDayOf = (gift: ArrivalGift) => gift.days.indexOf("today");

const ARRIVAL_TIMINGS = {
  earnedAirborneMs: MOTION.earned.gatherMs + MOTION.earned.riseMs + MOTION.earned.fallMs,
  earnedMs: MOTION.earned.gatherMs + MOTION.earned.riseMs + MOTION.earned.fallMs + springSettleMs(MOTION.earned.landing),
  returnedMs: MOTION.returned.durationMs,
  countMs: MOTION.count.durationMs,
  budgetMs: MOTION.arrival.budgetMs,
  staggerMs: MOTION.arrival.staggerMs,
} as const;

/** What a screen has shown of a gift since it arrived: its settled days, and which day was open (-1 for none). */
type Shown = Readonly<Record<string, Readonly<{ settled: number; open: number }>>>;

/**
 * The arrival on a screen (brief, section 6): what changed since the last visit plays once, in order, every day earned,
 * then the day that opened, then every day gone back, then the amount counting, all of it in under two seconds. The
 * last visit is kept on the device, per gift, as the number of settled days it saw and the day that was open; a device
 * that keeps nothing uses the gift's `lastSeen`, and wakes nothing.
 *
 * A gift that changes while the screen stands (it connects, a day is counted) is decided again, and from the very
 * render that brings the change its new days are drawn in their starting state: never the final state for a frame,
 * and then the movement.
 */
export function Arrival({ storageKey, gifts, amount = false, children }: Readonly<{ storageKey: string; gifts: readonly ArrivalGift[]; amount?: boolean; children: ReactNode }>) {
  const giftsKey = JSON.stringify(gifts);
  const seen = useSeenMany(gifts.map((gift) => `${storageKey}.${gift.id}`));
  const seenOpen = useSeenMany(gifts.map((gift) => `${storageKey}.open.${gift.id}`));
  const seenKey = JSON.stringify([seen, seenOpen]);
  /**
   * What this screen has already shown, as state for what is drawn and as a mark for what is played. A day this
   * screen has played is not pending again when the gifts change, though the device's last visit still says so.
   */
  const [shown, setShown] = useState<Shown>({});
  /**
   * What changed since the last visit, decided while the screen is drawn rather than after it, from the cookie the
   * server read (the fix to #154): the first image is then the arrival's starting state, the days to come not yet
   * there. A first visit, or nothing changed: nothing is pending, and the first image is the final state.
   */
  const changed = useMemo(() => {
    const [settled, open] = JSON.parse(seenKey) as [(number | undefined)[], (number | undefined)[]];
    const list = JSON.parse(giftsKey) as ArrivalGift[];
    return changesOf(
      list,
      list.map((gift, index) => shown[gift.id]?.settled ?? settled[index]),
      list.map((gift, index) => shown[gift.id]?.open ?? open[index]),
    );
  }, [giftsKey, seenKey, shown]);
  const [plan, setPlan] = useState<Plan>({ ...UNDECIDED, pending: changed.pending });

  useEffect(() => {
    const list = JSON.parse(giftsKey) as ArrivalGift[];
    const [lastSeen, lastOpen] = JSON.parse(seenKey) as [(number | undefined)[], (number | undefined)[]];
    let round = 0;
    const play = (fromExample: boolean) => {
      round += 1;
      const { earned, returned, woken, pending, settledNow, openNow } = changesOf(list, fromExample ? list.map((gift) => gift.lastSeen) : lastSeen, fromExample ? list.map(() => undefined) : lastOpen);
      if (!fromExample) {
        list.forEach((gift, index) => {
          writeSeen(`${storageKey}.${gift.id}`, settledNow[index]);
          // A gift whose days are not drawn yet says nothing of which is open: nothing is written of it.
          if (gift.days.length > 0) writeSeen(`${storageKey}.open.${gift.id}`, openNow[index]);
        });
        setShown(Object.fromEntries(list.filter((gift) => gift.days.length > 0).map((gift) => [gift.id, { settled: settledNow[list.indexOf(gift)], open: openNow[list.indexOf(gift)] }])));
      }
      // Nothing changed at all: nothing to replay. An amount that changed on its own still counts, last and alone.
      // Said out loud rather than by staying silent, because whoever waits for the count waits on this answer.
      if (reduced() || (earned.length + returned.length + woken.length === 0 && !amount)) {
        setPlan({ round, days: new Map(), amountAt: null, decided: true, pending: new Set(), about: giftsKey });
        return;
      }
      const schedule: ArrivalSchedule = arrivalSchedule(earned.length, returned.length, amount, ARRIVAL_TIMINGS);
      const days = new Map<string, { moment: Moment; delay: number }>();
      earned.forEach((id, index) => days.set(id, { moment: "earned", delay: schedule.earnedAt[index] }));
      returned.forEach((id, index) => days.set(id, { moment: "returned", delay: schedule.returnedAt[index] }));
      // The day that opened wakes after the jumps of the days earned: when the last of them has landed.
      const wokenAt = earned.length > 0 ? schedule.earnedAt[earned.length - 1] + ARRIVAL_TIMINGS.earnedAirborneMs : 0;
      woken.forEach((id) => days.set(id, { moment: "woken", delay: wokenAt }));
      setPlan({ round, days, amountAt: schedule.amountAt, decided: true, pending, about: giftsKey });
    };
    const frame = requestAnimationFrame(() => play(false));
    const replay = () => play(true);
    window.addEventListener(REPLAY_ARRIVAL, replay);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener(REPLAY_ARRIVAL, replay);
      list.forEach((gift) => {
        forgetOnThisScreen(`${storageKey}.${gift.id}`);
        forgetOnThisScreen(`${storageKey}.open.${gift.id}`);
      });
    };
  }, [storageKey, giftsKey, seenKey, amount]);

  // Until the arrival has decided for these gifts, what is pending is what changed, known from the gifts as soon as
  // they are: a row the page draws a moment later, or a gift that changes while the screen stands, starts with its new
  // days in their starting state, and never shows them first.
  const value = useMemo(() => (plan.decided && plan.about === giftsKey ? plan : { ...plan, decided: false, pending: changed.pending }), [plan, changed, giftsKey]);
  return <ArrivalContext.Provider value={value}>{children}</ArrivalContext.Provider>;
}

/**
 * The days that changed since a visit that saw `seen` settled days of each gift (the gift's own count when unknown) and
 * `seenOpen` as its open day. A day wakes when it is open now and a later day than the one the last visit saw open;
 * a visit that kept nothing of it wakes nothing, and neither does a gift seen for the first time.
 */
function changesOf(list: readonly ArrivalGift[], seen: readonly (number | null | undefined)[], seenOpen: readonly (number | null | undefined)[]) {
  const earned: string[] = [];
  const returned: string[] = [];
  const woken: string[] = [];
  const settledNow: number[] = [];
  const openNow: number[] = [];
  list.forEach((gift, giftIndex) => {
    const saw = seen[giftIndex] ?? gift.lastSeen;
    let settled = 0;
    gift.days.forEach((day, index) => {
      if (!isSettled(day)) return;
      if (settled >= saw) (day === "earned" ? earned : returned).push(`${gift.id}:${index}`);
      settled += 1;
    });
    settledNow.push(settled);
    const open = openDayOf(gift);
    const sawOpen = seenOpen[giftIndex];
    // What the last visit saw comes through a text and back: a visit that kept nothing reads as null there, not as undefined.
    if (open >= 0 && typeof sawOpen === "number" && open > sawOpen) woken.push(`${gift.id}:${open}`);
    openNow.push(open);
  });
  return { earned, returned, woken, settledNow, openNow, pending: new Set([...earned, ...returned, ...woken]) as ReadonlySet<string> };
}

/** One day of a gift inside an arrival: it plays its moment if it changed since the last visit, and stands still otherwise. */
export function ArrivalDay({ gift, index, children }: Readonly<{ gift: string; index: number; children: ReactNode }>) {
  const plan = useContext(ArrivalContext);
  const root = useRef<HTMLSpanElement>(null);
  const id = `${gift}:${index}`;
  const step = plan.days.get(id);
  // A day that changed since the last visit is drawn not yet there, from the server's first image on (the fix to #154):
  // `arrival-pending` hides it, and reduced motion shows it where it is (app/globals.css).
  const pending = plan.pending.has(id);
  useEffect(() => {
    const element = root.current;
    if (!element || !step) return;
    // A day gone back is invisible until its own turn, then there: a one-step animation that holds the first frame
    // until the delay, so the class can go in the same task without the day ever being seen before it moves. A day
    // earned is there from the first image, asleep (app/globals.css), and its own animation holds it asleep until then.
    const drawing = element.querySelector("svg");
    const held = drawing && step.moment === "returned" ? [drawing.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 1, delay: step.delay, fill: "backwards" })] : [];
    element.classList.remove("arrival-pending");
    const running = [...held, ...(step.moment === "earned" ? playEarned(element, step.delay, true) : step.moment === "woken" ? playWoken(element, step.delay) : playReturned(element, step.delay))];
    // A day that wakes is the row's own affair: the head of the screen answers a day earned and a day gone back.
    if (step.moment === "woken") return () => running.forEach((animation) => animation.cancel());
    // The character at the head of the screen answers each day as it happens on screen: the moment is the day's own
    // animation reaching its landing, or, for a day going back, the end of its slide (its start is the very frame the
    // last day earned lands, and the second answer would erase the first), measured by an animation that moves
    // nothing, never by a clock. Cancelled with the day, it answers nothing.
    const { gatherMs, riseMs, fallMs } = MOTION.earned;
    const cue = element.animate([], { duration: step.moment === "earned" ? gatherMs + riseMs + fallMs : MOTION.returned.durationMs, delay: step.delay });
    void cue.finished.then(() => feel(step.moment === "earned" ? "open" : "down", element, true)).catch(() => undefined);
    running.push(cue);
    return () => running.forEach((animation) => animation.cancel());
  }, [plan.round, step]);
  // Decided with nothing to play (reduced motion, or a replay): whatever was pending is simply there.
  useEffect(() => {
    if (plan.decided && !step) root.current?.classList.remove("arrival-pending");
  }, [plan.decided, step]);
  return (
    <span ref={root} className={pending ? "contents arrival-pending" : "contents"}>
      {children}
    </span>
  );
}

/**
 * The amount inside an arrival: it counts from the value of the last visit to its value, last and once, when something
 * changed. A screen reader reads the value itself, never a number on the way, and a device that asks for reduced motion
 * is only ever shown the value itself.
 */
export function ArrivalAmount({ from, to, symbol, decimals = 2, after = "", thousands = "," }: Readonly<{ from: number; to: number; symbol: string; decimals?: number; after?: string; /** What parts the thousands: a comma, or the space a franc figure is written with. */ thousands?: string }>) {
  const plan = useContext(ArrivalContext);
  const format = (value: number) => `${symbol}${value.toLocaleString("en-GB", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).replace(/,/g, thousands)}${after}`;
  // The first image shows where the count starts, not where it ends (the fix to #154); reduced motion reads `to`.
  const [shown, setShown] = useState(from);
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
  // Decided with nothing to count (reduced motion, or an arrival that does not count its amount): the value itself.
  const value = plan.decided && (plan.amountAt === null || from === to) ? to : shown;
  return (
    <>
      <span aria-hidden data-count-settled={settled ? "true" : "false"} className="motion-reduce:hidden">
        {format(decimals === 0 ? Math.round(value) : Math.round(value * 100) / 100)}
      </span>
      <span aria-hidden className="hidden motion-reduce:inline">
        {format(to)}
      </span>
      <span className="sr-only">{format(to)}</span>
    </>
  );
}

/**
 * What a block under the screen wears until it enters: the stylesheet draws it at its starting state, invisible and
 * lower by the rise (`[data-waits]`, app/globals.css).
 */
export const WAITS = "data-waits";

/**
 * A block that is under the screen when its screen is drawn waits there at its starting state, and enters once, when a
 * quarter of it is in view: it appears, rising the token's few pixels (the founder, 5 Oct 2026, by the rule of 23 Sep
 * that the first image is the starting state).
 *
 * What it replaced: the block was drawn finished, and the animation put it back to nothing when its first pixel came
 * in, so it was seen, gone, and seen again, at the very bottom edge of the screen. Now the state an entrance starts
 * from is the one drawn just before it, and the entrance is seen whole.
 *
 * Nothing is ever left invisible. A block is made to wait by this script alone, and only one that is wholly under the
 * screen, where movement is welcome and the browser can say when it enters: a block in view when the screen opens, a
 * script that never ran, a device that asks for less movement and a browser without the observer all give the block
 * finished, and still. Called before the browser paints, so a block never shows finished and then waits.
 */
function waitUnderTheScreen(blocks: readonly HTMLElement[]): () => void {
  if (reduced() || typeof IntersectionObserver === "undefined") return () => {};
  const screen = window.innerHeight;
  const waiting = blocks.filter((block) => !block.hasAttribute(WAITS) && block.getBoundingClientRect().top >= screen);
  const watching = waiting.map((block) => {
    // A quarter of the block, or of the screen when the block is taller than it, has to be in.
    const quarter = Math.floor(Math.min(block.getBoundingClientRect().height, screen) / 4);
    block.setAttribute(WAITS, "");
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        const { durationMs, easing, rise } = MOTION.reveal;
        // The first image of the entrance is the waiting state itself, and the block is finished under it.
        block.animate([{ opacity: 0, transform: `translateY(${rise}px)` }, { opacity: 1, transform: "translateY(0)" }], { duration: durationMs, easing });
        block.removeAttribute(WAITS);
      },
      { rootMargin: `0px 0px -${quarter}px 0px` },
    );
    observer.observe(block);
    return observer;
  });
  return () => {
    watching.forEach((observer) => observer.disconnect());
    waiting.forEach((block) => block.removeAttribute(WAITS));
  };
}

/**
 * Every block of a screen that is under the screen when the screen opens: the blocks of `main` and the turns of a box
 * that arrives in turn (the life of the product, step 4, 23 Sep 2026). What is in view when the screen opens does not
 * move, since the entrance already brought it; a block holding its own `Reveal` (a list of cards) is left to it, so
 * nothing moves twice. Nothing behind it moves, no parallax.
 */
export function useRevealOnScroll(main: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const root = main.current;
    if (!root) return;
    const blocks = [...root.querySelectorAll<HTMLElement>(":scope > *:not(header, dialog), :scope .arrives-in-turn > *")].filter(
      (block) => !block.classList.contains("arrives-in-turn") && !block.querySelector("[data-reveal]") && !block.closest("[data-reveal]"),
    );
    return waitUnderTheScreen(blocks);
  }, [main]);
}

/**
 * Something under the screen when it is drawn, a card in a list: it waits and enters as every block does (brief,
 * section 6). What is already in view when the screen opens does not move: that is the arrival's business.
 */
export function Reveal({ className, children }: Readonly<{ className?: string; children: ReactNode }>) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => (root.current ? waitUnderTheScreen([root.current]) : undefined), []);
  return (
    <div ref={root} data-reveal className={className}>
      {children}
    </div>
  );
}

/**
 * What the character's face does when it feels something (the life of the product, step 2), built from the parts it
 * already has, the gaze, the eyes and the mouth: `open` when a day earned lands, `down` when a day goes back, `jump`
 * once at "atteint". Each plays once and comes back by itself: one animation with the face held in the middle of it,
 * never a clock and never a loop. Reduced motion is given the rest face and nothing else, which is what `reduced()`
 * decides here as everywhere. The two expressions that answered a pointer over a control or a choice made on the card
 * (`curious`, `happy`) and the gaze that followed a pointer were removed on 24 Sep 2026 (D216).
 */
type Faces = Readonly<{ gaze?: string; eye?: string; mouth?: string }>;

const AT_REST: Faces = { gaze: "translate(0px, 0px)", eye: "scaleY(1)", mouth: "scale(1, 1)" };

function facesOf(mood: Mood): Faces {
  // A day earned has landed: the face opens, the eyes a little wider and the mouth open, as the day's own face does.
  if (mood.feeling === "open") return { ...AT_REST, eye: "scale(1.18)", mouth: "scale(1.2, 1.7)" };
  // A day went back: the eyes look down, and nothing else changes. Never a frown: nobody is being scolded.
  if (mood.feeling === "down") return { ...AT_REST, gaze: `translate(0px, ${MOTION.hover.gaze}px)` };
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
    // Reached: one jump, the same one a day earned makes, and nothing to hold afterwards.
    if (mood.feeling === "jump") {
      const jumping = playEarned(element, 0);
      return () => jumping.forEach((animation) => animation.cancel());
    }
    const faces = facesOf(mood);
    // A look down lasts what a day going back lasts, 300 ms in all (MOTION.returned); the rest are the hover's own.
    const down = mood.feeling === "down";
    const durationMs = down ? MOTION.returned.durationMs / 3 : MOTION.hover.durationMs;
    const heldMs = down ? MOTION.returned.durationMs / 3 : MOTION.hover.heldMs;
    const easing = MOTION.hover.easing;
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
        // there rather than from the face it was drawn with.
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
 * What this device last saw of a number, so an arrival can count from it to what it is now: from the cookie the server
 * read, the same in the browser's first render, frozen while the screen stands and written for the next one (D189).
 * A first visit has nothing seen and counts nothing.
 */
export function useLastSeen(key: string, value: number | undefined): number | undefined {
  const seen = useSeen(key);
  useEffect(() => {
    if (value === undefined) return;
    writeSeen(key, value);
    return () => forgetOnThisScreen(key);
  }, [key, value]);
  return seen;
}
