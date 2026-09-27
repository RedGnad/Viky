"use client";
import { useCallback, useEffect, useRef, useSyncExternalStore, type CSSProperties, type RefObject } from "react";
import { stripOf, type StripDay } from "@/src/day-states";
import { MOTION, SPRING } from "@/src/design-tokens";
import { springEasing } from "@/src/motion";
import { Character, type CharacterState } from "./Character";
import { ArrivalDay, reduced } from "./Motion";

/**
 * The days of a gift as one strip of small characters: the image of progress the card carries under its title
 * (Material: "Cards can serve as entry points"; the card of the structure, section 6). Each day is the character of its
 * state (the art direction brief of 17 Sep 2026, section 5), at the small size, which is the shape and the colour with
 * no face: a full circle earned, a faded one leaving to the left when it went back, an upright triangle today, the same
 * leaning while it can still be caught up, a low rounded rectangle still to come.
 *
 * A settled day is drawn from the keeper's record per day when it has one, at its date (D86); a day settled before the
 * record falls back to the counts, earned first (`stripOf`).
 *
 * It is a picture of a sentence the card already says in words ("Counting: 3 of 7 days done, 0 missed."), so it is
 * hidden from a screen reader rather than read twice. Before the first reading a gift has no dated days yet, so the
 * strip is its length, every day still to come, which is what is true. Each day sits inside the screen's arrival, which
 * plays it only if it changed since the last visit (app/kit/Motion.tsx).
 */

type Shape = Readonly<{ startDay: number; endDay: number; durationDays: number; creditedDays: number; missedDays: number }>;

/** The minute, stepped once a minute, and nothing on the server: the days depend on the reader's clock. */
function everyMinute(changed: () => void): () => void {
  const timer = setInterval(changed, 60_000);
  return () => clearInterval(timer);
}
const thisMinute = () => Math.floor(Date.now() / 60_000) * 60_000;
const noClock = () => 0;

/**
 * How much of a row is hidden at each end, in pixels, as one string: React reads a snapshot on every render, and two
 * numbers in a fresh object would be a new snapshot every time.
 */
export type HiddenEdges = string;

/** The longest a fade may be, which is about the width of one day: past that it says nothing more. */
const FADE_MAX = 56;

const stillHidden = (row: HTMLElement | null): HiddenEdges => {
  if (!row) return "0,0";
  const left = Math.min(FADE_MAX, Math.max(0, Math.round(row.scrollLeft)));
  const right = Math.min(FADE_MAX, Math.max(0, Math.round(row.scrollWidth - row.clientWidth - row.scrollLeft)));
  return `${left},${right}`;
};

/**
 * The fade at each end, as long as what that end actually hides, up to one day's width. A row hiding seven pixels
 * fades by seven: a fade the width of a whole character over seven hidden pixels dims a day that is entirely there.
 */
export function fadeOf(hidden: HiddenEdges): CSSProperties {
  const [left, right] = hidden.split(",");
  return { "--fade-left": `${left}px`, "--fade-right": `${right}px` } as CSSProperties;
}

/** Whether either end still hides a day, which is what says "scroll for the rest" and nothing else. */
export const rowCarriesOn = (hidden: HiddenEdges) => hidden !== "0,0";

/** Which ends hide something, for a capture and a test to read: "none", "left", "right" or "both". */
export function endsHidden(hidden: HiddenEdges): "none" | "left" | "right" | "both" {
  const [left, right] = hidden.split(",").map(Number);
  return left && right ? "both" : left ? "left" : right ? "right" : "none";
}

/**
 * Which edges of a scrolling row still hide something, measured on the row itself.
 *
 * The row of days fades out at an edge that carries on, and only there: the fade is the one sign that says "there is
 * more this way", so an edge that hides nothing is drawn flat. Until 21 Sep 2026 the right edge faded whatever it
 * held, which dimmed the last day of a gift nobody could scroll, and the left edge never faded at all, which cut the
 * days clean off on a gift's own page, where the row opens on today with the first days behind it (the founder).
 *
 * It is read as an external store rather than kept in state: the row is measured when the browser says it changed,
 * never inside a render. `ResizeObserver` reports once as soon as it observes, which is what gives the first reading,
 * and `length` re-subscribes when days arrive, because a row that grows never changes its own box.
 */
export function useHiddenEdges(row: RefObject<HTMLElement | null>, length: number): HiddenEdges {
  const watch = useCallback(
    (changed: () => void) => {
      const element = row.current;
      if (!element || typeof ResizeObserver === "undefined") return () => undefined;
      element.addEventListener("scroll", changed, { passive: true });
      const observer = new ResizeObserver(changed);
      observer.observe(element);
      return () => {
        element.removeEventListener("scroll", changed);
        observer.disconnect();
      };
    },
    // The row is measured again from scratch when its length changes: `length` is read by the subscription itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [row, length],
  );
  // Read where React reads it, from the row itself: the row is the store, and `watch` says when to look again.
  return useSyncExternalStore(watch, () => stillHidden(row.current), () => "0,0");
}

/** The two widths a day is drawn at: 60 in a row that is read, 72 on the card being filled in (D226). */
const WIDTHS = { 60: "w-[60px]", 72: "w-[72px]" } as const;

/** How far a closed eye opens: a pill 2.4 tall scaled to the 6.2 of an open eye. */
const EYES_OPEN = "scaleY(2.8)";
/** How many days arrive in turn when the strip changes length: the ones a card shows, and the turns stop at the fourth (D171). */
const ARRIVING = 8;

export function DayStrip({
  id,
  gift,
  catchUpSeconds,
  records = [],
  width = 60,
  wake,
  changedOn,
  each,
}: Readonly<{
  id: string;
  gift: Shape;
  catchUpSeconds: number;
  records?: readonly { day: number; outcome: "earned" | "returned" }[];
  width?: keyof typeof WIDTHS;
  /**
   * On a card being filled in (D226): given, the first day is drawn into the page and opens its eyes while it is
   * true, which is when the card is ready to send. The state is in the markup, so the first image is right, and the
   * change plays from it, once, on the spring that never overshoots.
   */
  wake?: boolean;
  /** Something else the days answer when it changes, as they answer a change of length (D230): the card's condition. */
  changedOn?: string;
  /** What one day is worth, written small under each of them (D304, the founder, 28 Sep 2026): the card's row only. */
  each?: string;
}>) {
  const nowMs = useSyncExternalStore(everyMinute, thisMinute, noClock);
  const row = useRef<HTMLSpanElement>(null);
  const days = stripOf(gift, catchUpSeconds, nowMs, records);
  const hidden = useHiddenEdges(row, days.length);
  // The first day opens or closes its eyes when `wake` changes after the first image, never on it.
  const wasAwake = useRef(wake);
  useEffect(() => {
    if (wake === undefined || wasAwake.current === wake) return;
    wasAwake.current = wake;
    const eyes = row.current?.querySelectorAll<SVGElement>('[data-day]:first-child [data-part="eye"]') ?? [];
    if (reduced()) return;
    const spring = springEasing(SPRING.effects);
    const running = [...eyes].map((eye) => eye.animate([{ transform: wake ? "scaleY(1)" : EYES_OPEN }, { transform: wake ? EYES_OPEN : "scaleY(1)" }], { duration: spring.durationMs, easing: spring.easing }));
    return () => running.forEach((animation) => animation.cancel());
  }, [wake]);
  // A strip that changes length, or what it is about, after the first image shows its days again, in turn, as a
  // screen arrives (D226, D230).
  const about = `${days.length}:${changedOn ?? ""}`;
  const wasAbout = useRef(about);
  useEffect(() => {
    if (wasAbout.current === about) return;
    wasAbout.current = about;
    if (reduced()) return;
    const drawings = [...(row.current?.querySelectorAll<SVGElement>("[data-day] svg") ?? [])].slice(0, ARRIVING);
    const { durationMs, easing, rise, staggerMs, mostStaggeredMs, fromOpacity } = MOTION.reveal;
    const running = drawings.map((drawing, index) =>
      drawing.animate([{ opacity: fromOpacity, transform: `translateY(${rise}px)` }, { opacity: 1, transform: "none" }], { duration: durationMs, easing, delay: Math.min(index * staggerMs, mostStaggeredMs), fill: "backwards" }),
    );
    return () => running.forEach((animation) => animation.cancel());
  }, [about]);
  // One size everywhere, and it keeps its face (the founder, 19 Sep 2026, amending the brief). 60 on a card since
  // D134, twice asked for: 42 left a sleeping day seventeen pixels tall, 52 was still small; 72 on the card being
  // filled in since D226. The strip scrolls rather than shrinking, exactly as the row does, because a row of thirty
  // smudges says nothing at all.
  return (
    <span ref={row} aria-hidden data-more={endsHidden(hidden)} style={fadeOf(hidden)} className="day-row-days flex w-full items-end">
      {days.map((day, index) => (
        <span key={index} data-day={day} data-awake={wake && index === 0 ? "" : undefined} className={`flex ${WIDTHS[width]} flex-none ${each ? "flex-col items-center" : "items-end"}`}>
          <ArrivalDay gift={id} index={index}>
            {/* A day earned jumps and a day gone back leaves, in the arrival: those two are written into the page (D206),
                and so is the first day of a card that can open its eyes. */}
            <Character
              state={characterOf(day)}
              standing={false}
              drawn={characterOf(day) === "earned" || characterOf(day) === "returned" || (wake !== undefined && index === 0) ? "inline" : "referenced"}
              className="h-auto w-full"
            />
          </ArrivalDay>
          {each ? <span data-day-worth className="text-[length:var(--type-meta)] leading-[var(--type-meta-leading)] font-medium tabular-nums text-[var(--muted)]">{each}</span> : null}
        </span>
      ))}
    </span>
  );
}

/**
 * A day's state as a character. A day whose window has closed and which nothing has drained yet is drawn as one still
 * to be judged, leaning, because it has not come back yet and saying otherwise would be inventing it.
 */
export function characterOf(day: StripDay): CharacterState {
  switch (day) {
    case "earned":
      return "earned";
    case "returned":
      return "returned";
    case "today":
      return "today";
    case "catchable":
    case "aboutToReturn":
      return "catchable";
    case "toCome":
      return "toCome";
  }
}

/** Every day of a gift as its character, which is what an arrival compares against the last visit. */
export function charactersOf(
  gift: Shape,
  catchUpSeconds: number,
  nowMs: number,
  records: readonly { day: number; outcome: "earned" | "returned" }[] = [],
): CharacterState[] {
  return stripOf(gift, catchUpSeconds, nowMs, records).map(characterOf);
}
