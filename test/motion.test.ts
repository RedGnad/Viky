import { strict as assert } from "node:assert";
import test from "node:test";
import { readFileSync } from "node:fs";
import { EASING, MOTION, SPRING } from "../src/design-tokens.js";
import { arrivalSchedule, bezierProgress, springEasing, springOvershoot, springProgress, springSettleMs } from "../src/motion.js";

/**
 * The motion of the brief (section 6) as numbers: the curves and springs are Material's own, a spring settles when the
 * physics says it does, only position and size may overshoot, and nothing lasts anywhere near the five seconds of
 * WCAG 2.2.2.
 */

test("the curves are Material's published tokens, character for character", () => {
  assert.equal(EASING.standard, "cubic-bezier(0.2, 0, 0, 1)");
  assert.equal(EASING.emphasizedDecelerate, "cubic-bezier(0.05, 0.7, 0.1, 1)");
  assert.equal(EASING.emphasizedAccelerate, "cubic-bezier(0.3, 0, 0.8, 0.15)");
  assert.deepEqual(SPRING.expressiveFastSpatial, { damping: 0.6, stiffness: 800 });
  assert.deepEqual(SPRING.expressiveDefaultSpatial, { damping: 0.8, stiffness: 380 });
  assert.deepEqual(SPRING.effects, { damping: 1, stiffness: 1600 });
});

test("a spring starts at rest, ends on its target, and the expressive one overshoots while the effects one never does", () => {
  for (const spring of Object.values(SPRING)) {
    assert.equal(springProgress(spring, 0), 0);
    assert.ok(Math.abs(springProgress(spring, springSettleMs(spring) / 1000) - 1) < 0.001);
  }
  const peak = Math.max(...Array.from({ length: 300 }, (_, i) => springProgress(SPRING.expressiveFastSpatial, i / 600)));
  assert.ok(peak > 1.05 && peak < 1.12, `expressive peak ${peak}`);
  assert.ok(Math.abs(springOvershoot(SPRING.expressiveFastSpatial) - (peak - 1)) < 0.005);
  const effects = Array.from({ length: 300 }, (_, i) => springProgress(SPRING.effects, i / 600));
  assert.ok(Math.max(...effects) <= 1, "colour and opacity never overshoot");
});

test("a spring becomes a curve a browser can play: linear() from 0 to 1, as long as the spring takes to settle", () => {
  const { easing, durationMs } = springEasing(SPRING.expressiveFastSpatial);
  assert.match(easing, /^linear\(0, .*, 1\)$/);
  assert.equal(durationMs, springSettleMs(SPRING.expressiveFastSpatial));
  assert.ok(durationMs > 300 && durationMs < 600, `settles in ${durationMs} ms`);
});

test("the standard curve is solved as a browser solves it: it starts at 0, ends at 1, and is past halfway early", () => {
  assert.equal(bezierProgress(EASING.standard, 0), 0);
  assert.equal(bezierProgress(EASING.standard, 1), 1);
  assert.ok(bezierProgress(EASING.standard, 0.5) > 0.75);
  let last = 0;
  for (let t = 0; t <= 1; t += 0.05) {
    const value = bezierProgress(EASING.standard, t);
    assert.ok(value >= last - 1e-9, "the curve never goes back");
    last = value;
  }
});

const TIMINGS = {
  earnedAirborneMs: MOTION.earned.gatherMs + MOTION.earned.riseMs + MOTION.earned.fallMs,
  earnedMs: MOTION.earned.gatherMs + MOTION.earned.riseMs + MOTION.earned.fallMs + springSettleMs(MOTION.earned.landing),
  returnedMs: MOTION.returned.durationMs,
  countMs: MOTION.count.durationMs,
  budgetMs: MOTION.arrival.budgetMs,
  staggerMs: MOTION.arrival.staggerMs,
};

test("each moment is brief, and every one of them ends long before WCAG 2.2.2's five seconds", () => {
  assert.ok(MOTION.press.durationMs >= 100 && MOTION.press.durationMs <= 150, "a press is 100 to 150 ms");
  assert.ok(MOTION.count.durationMs < 1000, "an amount counts in under a second");
  const gift = Math.max(springSettleMs(MOTION.gift.spatial) + MOTION.gift.bowDelayMs, springSettleMs(MOTION.gift.effects));
  for (const [moment, ms] of Object.entries({ earned: TIMINGS.earnedMs, returned: MOTION.returned.durationMs, count: MOTION.count.durationMs, gift, press: MOTION.press.durationMs, reveal: MOTION.reveal.durationMs, hover: MOTION.hover.durationMs })) {
    assert.ok(ms < 1000, `${moment} lasts ${ms} ms`);
  }
  assert.equal(MOTION.ceilingMs, 5000);
  assert.equal(MOTION.arrival.budgetMs, 2000);
});

test("an arrival plays the days earned, then the days gone back, then the amount, in under two seconds however much changed", () => {
  for (let earned = 0; earned <= 90; earned += earned < 10 ? 1 : 20) {
    for (let returned = 0; returned <= 90; returned += returned < 10 ? 1 : 20) {
      for (const amount of [true, false]) {
        const plan = arrivalSchedule(earned, returned, amount, TIMINGS);
        assert.ok(plan.endMs < MOTION.arrival.budgetMs, `${earned} earned, ${returned} back: ${plan.endMs} ms`);
        assert.equal(plan.earnedAt.length, earned);
        assert.equal(plan.returnedAt.length, returned);
        assert.ok(plan.staggerMs >= 0 && plan.staggerMs <= MOTION.arrival.staggerMs);
        const lastEarned = earned > 0 ? plan.earnedAt[earned - 1] : -1;
        for (const at of plan.returnedAt) assert.ok(at > lastEarned, "a day gone back starts after every day earned has started");
        if (plan.amountAt !== null) {
          assert.ok(plan.amountAt >= Math.max(lastEarned, ...plan.returnedAt), "the amount counts last");
          assert.ok(amount);
        }
      }
    }
  }
  // The laboratory's own example: two days earned, one gone back, then the amount.
  const example = arrivalSchedule(2, 1, true, TIMINGS);
  assert.deepEqual(example.earnedAt, [0, MOTION.arrival.staggerMs]);
  assert.ok(example.endMs < 2000);
});

test("every movement answers a gesture: nothing plays on a clock, nothing repeats, and reduced motion stops all of it", () => {
  const source = readFileSync("app/kit/Motion.tsx", "utf8");
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(source, /\(hover: hover\) and \(pointer: fine\)/, "hover answers a pointer only");
  assert.doesNotMatch(source, /iterations/, "no moment repeats");
  assert.doesNotMatch(source, /setInterval|setTimeout/, "nothing waits for a clock to start");
  assert.match(source, /IntersectionObserver/, "a reveal answers the scroll");
  assert.match(source, /pointermove/, "a gaze answers the pointer");

  // The press and the hover are the two movements the stylesheet plays, because they answer a finger and a pointer.
  const css = readFileSync("app/globals.css", "utf8");
  assert.doesNotMatch(css, /@keyframes|animation-name|infinite/, "the stylesheet plays no animation of its own");
  assert.ok(css.includes(`--press-duration: ${MOTION.press.durationMs}ms`), "the press lasts what the token says");
  assert.ok(css.includes(`--press-easing: ${MOTION.press.easing}`), "the press is the token's curve");
  assert.ok(css.includes(`--hover-duration: ${MOTION.hover.durationMs}ms`), "the hover lasts what the token says");
  assert.ok(css.includes(`--hover-lift: ${MOTION.hover.lift}px`), "a pointer lifts a button by what the token says");
  assert.match(css, /@media \(hover: hover\) and \(pointer: fine\)/, "a button lifts under a pointer only");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reduced, /\.control-relief:is\(:active, :hover\)/, "under reduced motion a press gives way but nothing travels");
});

/**
 * An amount that changed counts to its value once (brief, section 6), driven frame by frame rather than by the
 * stylesheet, so `document.getAnimations()` never sees it. Every run that photographs a screen has to wait for the
 * count, or it keeps a figure that was true for 200ms: the captures of 18 Sep showed $0.11, $0.24 and $0.78 for an
 * account holding $2.00, which is how this was found (relecture, line 5).
 */
test("the amount says when it has arrived, and every capture run waits for it", () => {
  const motion = readFileSync("app/kit/Motion.tsx", "utf8");
  assert.match(motion, /data-count-settled=\{shown === to \? "true" : "false"\}/, "nothing says when the count is over");
  for (const script of ["scripts/capture-connected.ts", "scripts/review-capture.ts", "scripts/capture-looks.ts"]) {
    assert.match(readFileSync(script, "utf8"), /data-count-settled/, `${script} photographs a screen mid-count`);
  }
});
