import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MOTION } from "../src/design-tokens";
import { springEasing } from "../src/motion";

// At the opening, the days wake (the founder, 3 Oct 2026; the motion roadmap, section 6): eyes open one by one from
// the left, 40 ms apart, on the spring a day earned lands on, the whole row inside 600 ms whatever its length.

const row = readFileSync("app/kit/DayRow.tsx", "utf8");

test("the wake's three figures are tokens: 40 ms apart, 600 ms for the row, the spring of a day earned", () => {
  assert.deepEqual({ staggerMs: MOTION.wake.staggerMs, budgetMs: MOTION.wake.budgetMs }, { staggerMs: 40, budgetMs: 600 });
  assert.equal(MOTION.wake.eyes, MOTION.earned.landing);
  const spring = springEasing(MOTION.wake.eyes).durationMs;
  assert.ok(spring < MOTION.wake.budgetMs, `the spring (${spring} ms) fits inside the budget`);
  // The first days are 40 ms apart; from the day that would end past the budget, they open together, and none ends late.
  const lastStart = MOTION.wake.budgetMs - spring;
  for (const days of [7, 30, 90]) {
    const starts = Array.from({ length: days }, (_, index) => Math.min(index * MOTION.wake.staggerMs, lastStart));
    assert.ok(Math.max(...starts) + spring <= MOTION.wake.budgetMs, `${days} days have woken by ${MOTION.wake.budgetMs} ms`);
    assert.deepEqual(starts.slice(0, 4), [0, 40, 80, 120]);
  }
});

test("the row plays it once, at the opening, before the browser paints, and never against reduced motion", () => {
  const effect = row.slice(row.indexOf("const wasAwake = useRef(awake);"), row.indexOf("}, [awake]);"));
  assert.match(effect, /useLayoutEffect\(\(\) => \{\s+if \(wasAwake\.current === awake\) return;/, "only when it changes after the first image");
  assert.match(effect, /if \(!woke \|\| reduced\(\)\) return;/, "and only on waking, with motion allowed");
  assert.match(effect, /const \{ staggerMs, budgetMs, eyes \} = MOTION\.wake;/);
  assert.match(effect, /delay: Math\.min\(index \* staggerMs, lastStart\), fill: "backwards"/);
  // What follows the row arrives once it has woken, as a screen's blocks arrive.
  assert.match(effect, /duration: MOTION\.reveal\.durationMs, easing: MOTION\.reveal\.easing, delay: budgetMs, fill: "backwards"/);
  assert.doesNotMatch(effect, /\b\d{2,4}\b/, "no figure of its own");
  assert.doesNotMatch(effect, /iterations|setTimeout|setInterval/, "nothing loops and nothing waits on a clock");
  // Awake is a state of the gift, opened and not started, and the page gives it from the server's answer.
  assert.match(readFileSync("app/components/GiftPage.tsx", "utf8"), /awake=\{daily\.opened\}/);
  assert.match(row, /data-awake=\{awake \? "" : undefined\}/);
  assert.match(readFileSync("app/globals.css", "utf8"), /\.day-row-days \[data-awake\] \[data-part="eye"\] \{\n\s*transform: scaleY\(2\.8\);/);
});
