/**
 * The arithmetic behind the motion tokens in `src/design-tokens.ts`, kept apart so it can be tested without a browser.
 *
 * Material describes its expressive motion as springs, "stiffness, damping, and initial velocity", and a browser
 * only understands durations and easing curves. So a spring is solved here once, as the physics Jetpack Compose
 * runs (a unit mass, a damping ratio and a stiffness), and sampled into a CSS `linear()` curve with the duration it
 * takes to settle. A cubic Bézier is solved here too, for the one movement drawn frame by frame: an amount counting.
 */

export type Spring = Readonly<{ damping: number; stiffness: number }>;

/** How close to rest a spring must be before it counts as settled: a thousandth of the distance travelled. */
const REST = 0.001;
/** One sample per frame at 60 frames a second is finer than any eye reads a curve. */
const FRAME_MS = 1000 / 60;

/** Where a spring released at 0 towards 1, from rest, is after `seconds`. It overshoots when damping is under 1. */
export function springProgress(spring: Spring, seconds: number): number {
  const omega = Math.sqrt(spring.stiffness);
  const zeta = spring.damping;
  if (zeta < 1) {
    const damped = omega * Math.sqrt(1 - zeta * zeta);
    const envelope = Math.exp(-zeta * omega * seconds);
    return 1 - envelope * (Math.cos(damped * seconds) + ((zeta * omega) / damped) * Math.sin(damped * seconds));
  }
  // Critically damped: Material's effects springs, which never overshoot.
  return 1 - (1 + omega * seconds) * Math.exp(-omega * seconds);
}

/** The time a spring takes to stay within a thousandth of its target, read from the envelope of its oscillation. */
export function springSettleMs(spring: Spring): number {
  const omega = Math.sqrt(spring.stiffness);
  const zeta = spring.damping;
  for (let ms = FRAME_MS; ms < 10_000; ms += FRAME_MS) {
    const seconds = ms / 1000;
    const bound =
      zeta < 1
        ? Math.exp(-zeta * omega * seconds) * (1 + zeta / Math.sqrt(1 - zeta * zeta))
        : (1 + omega * seconds) * Math.exp(-omega * seconds);
    if (bound < REST) return Math.ceil(ms);
  }
  return 10_000;
}

/** A spring as a CSS easing a browser can play: `linear()` points one frame apart, and how long it lasts. */
export function springEasing(spring: Spring): { easing: string; durationMs: number } {
  const durationMs = springSettleMs(spring);
  const steps = Math.max(2, Math.round(durationMs / FRAME_MS));
  const points: string[] = [];
  for (let step = 0; step <= steps; step += 1) {
    const value = step === steps ? 1 : springProgress(spring, (step / steps) * (durationMs / 1000));
    points.push(String(Math.round(value * 10_000) / 10_000));
  }
  return { easing: `linear(${points.join(", ")})`, durationMs };
}

/** How far past its target a spring goes, as a fraction of the distance: 0 when it never overshoots. */
export function springOvershoot(spring: Spring): number {
  if (spring.damping >= 1) return 0;
  return Math.exp((-Math.PI * spring.damping) / Math.sqrt(1 - spring.damping * spring.damping));
}

/** The four numbers of a `cubic-bezier()` easing, read back from its CSS text. */
export function bezierOf(css: string): [number, number, number, number] {
  const match = css.match(/^cubic-bezier\(([^)]+)\)$/);
  if (!match) throw new Error(`Not a cubic-bezier easing: ${css}`);
  const numbers = match[1].split(",").map((part) => Number(part.trim()));
  if (numbers.length !== 4 || numbers.some((n) => !Number.isFinite(n))) throw new Error(`Not a cubic-bezier easing: ${css}`);
  return numbers as [number, number, number, number];
}

/** The progress of a CSS cubic Bézier easing at time `t` from 0 to 1, solved the way a browser solves it. */
export function bezierProgress(css: string, t: number): number {
  const [x1, y1, x2, y2] = bezierOf(css);
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const curve = (a: number, b: number, s: number) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3;
  const slope = (a: number, b: number, s: number) => 3 * a * (1 - s) ** 2 + 6 * (b - a) * s * (1 - s) + 3 * (1 - b) * s * s;
  // Newton's method on x, then bisection if the slope is too flat to trust.
  let s = t;
  for (let i = 0; i < 8; i += 1) {
    const error = curve(x1, x2, s) - t;
    const d = slope(x1, x2, s);
    if (Math.abs(error) < 1e-6) return curve(y1, y2, s);
    if (Math.abs(d) < 1e-6) break;
    s -= error / d;
  }
  let low = 0;
  let high = 1;
  s = t;
  for (let i = 0; i < 40; i += 1) {
    const x = curve(x1, x2, s);
    if (Math.abs(x - t) < 1e-6) break;
    if (x < t) low = s;
    else high = s;
    s = (low + high) / 2;
  }
  return curve(y1, y2, s);
}

/** When each part of an arrival starts, in milliseconds from the arrival, and when the whole of it has ended. */
export type ArrivalSchedule = Readonly<{ earnedAt: readonly number[]; returnedAt: readonly number[]; amountAt: number | null; endMs: number; staggerMs: number }>;

export type ArrivalTimings = Readonly<{
  /** From the start of a day earned to its landing, when the next part may begin. */
  earnedAirborneMs: number;
  /** From the start of a day earned to the end of its landing spring. */
  earnedMs: number;
  returnedMs: number;
  countMs: number;
  budgetMs: number;
  staggerMs: number;
}>;

/**
 * The order of an arrival (brief, section 6): every day earned, a little apart; then every day gone back, once the last
 * earned one has landed; then the amount, once the last day gone back has gone. The gap between two days shrinks as
 * the number of days grows, so the whole arrival always ends inside its budget, however much changed.
 */
export function arrivalSchedule(earned: number, returned: number, amount: boolean, timings: ArrivalTimings): ArrivalSchedule {
  const at = (stagger: number) => {
    const earnedAt = Array.from({ length: earned }, (_, index) => index * stagger);
    const returnedStart = earned > 0 ? (earned - 1) * stagger + timings.earnedAirborneMs : 0;
    const returnedAt = Array.from({ length: returned }, (_, index) => returnedStart + index * stagger);
    const amountAt = amount ? (returned > 0 ? returnedAt[returned - 1] + timings.returnedMs : returnedStart) : null;
    const endMs = Math.max(
      earned > 0 ? earnedAt[earned - 1] + timings.earnedMs : 0,
      returned > 0 ? returnedAt[returned - 1] + timings.returnedMs : 0,
      amountAt === null ? 0 : amountAt + timings.countMs,
    );
    return { earnedAt, returnedAt, amountAt, endMs, staggerMs: stagger };
  };
  let stagger = timings.staggerMs;
  while (stagger > 0 && at(stagger).endMs >= timings.budgetMs) stagger -= 1;
  return at(stagger);
}
