import { MOTION } from "@/src/design-tokens";

/**
 * When the characters last blinked, shared by every blink (D309, the founder, 28 Sep 2026): the blink as the light
 * changes and the landing figure's blink now and then did not know of each other, and it blinked twice in a moment.
 * A blink now and then waits until the last blink of any kind is at least its shortest gap behind it.
 */
let lastBlinkAt = Number.NEGATIVE_INFINITY;

export function noteBlink(now: number = performance.now()): void {
  lastBlinkAt = now;
}

export function msSinceBlink(now: number = performance.now()): number {
  return now - lastBlinkAt;
}

const lidsOf = (drawing: Element) => drawing.querySelectorAll<SVGElement>('[data-part="lid"]');

/** One blink of a drawing: each lid closes and opens again, from its own middle (D301). `afterMs` holds it back. */
export function blinkOnce(drawing: Element, afterMs = 0): void {
  const { durationMs, easing, closedTo } = MOTION.blink;
  for (const lid of lidsOf(drawing)) lid.animate([{ transform: "scaleY(1)" }, { transform: `scaleY(${closedTo})`, offset: 0.5 }, { transform: "scaleY(1)" }], { duration: durationMs, easing, delay: afterMs });
}

/**
 * The blink now and then, in one place (the founder, 10 Oct 2026). It was the landing figure's own loop; the one who
 * reads its book and the app's icon blink too now, and three loops would have been three clocks. Every drawing that
 * blinks is named here, one clock draws a moment between the two gaps (`MOTION.blink`), and at that moment every
 * drawing in view blinks, together: never sooner than the shortest gap after a blink of any kind, the one as the
 * light changes included (D309), never a drawing that is off the screen or not yet standing, never while the tab is
 * behind another, and nothing at all under reduced motion.
 */
type Blinking = { drawing: Element; seen: boolean; standsAt: number };
const blinking = new Set<Blinking>();
let clock: number | undefined;

function wait(): void {
  const { fromMs, toMs } = MOTION.blink;
  clock = window.setTimeout(() => {
    const now = performance.now();
    const inView = [...blinking].filter((one) => one.seen && now >= one.standsAt);
    if (inView.length > 0 && !document.hidden && msSinceBlink(now) >= fromMs) {
      noteBlink(now);
      for (const one of inView) blinkOnce(one.drawing);
    }
    wait();
  }, fromMs + Math.random() * (toMs - fromMs));
}

/**
 * Names a drawing that blinks now and then, from `afterMs` on (the time its own arrival takes), and gives the way to
 * take its name back. A drawing with no lid blinks nothing: only an open eye has one.
 */
export function blinksNowAndThen(drawing: Element, afterMs = 0): () => void {
  if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {};
  const one: Blinking = { drawing, seen: false, standsAt: performance.now() + afterMs };
  const watch = new IntersectionObserver((entries) => {
    one.seen = entries[entries.length - 1].isIntersecting;
  });
  watch.observe(drawing);
  blinking.add(one);
  if (clock === undefined) wait();
  return () => {
    watch.disconnect();
    blinking.delete(one);
    if (blinking.size === 0 && clock !== undefined) {
      window.clearTimeout(clock);
      clock = undefined;
    }
  };
}
