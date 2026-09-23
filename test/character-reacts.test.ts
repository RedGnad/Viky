import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MOTION } from "../src/design-tokens";

/**
 * The character reacts (the life of the product, step 2, 23 Sep 2026): it looks at a pointer, opens when a day earned
 * lands, looks down for 300 ms when a day goes back, and jumps once at "atteint". Each reaction comes from the gift's
 * own record, never from a clock, and it never scolds.
 */
test("it looks at a pointer, 2.5 px in 200 ms, and only a pointer", () => {
  assert.equal(MOTION.hover.gaze, 2.5);
  assert.equal(MOTION.hover.durationMs, 200);
  const motion = readFileSync("app/kit/Motion.tsx", "utf8");
  assert.match(motion, /if \(!element \|\| reduced\(\) \|\| !window\.matchMedia\(POINTER\)\.matches\) return;/);
});

test("it opens when a day earned lands and looks down when a day goes back, cued by the day's own animation", () => {
  const motion = readFileSync("app/kit/Motion.tsx", "utf8");
  assert.match(motion, /const cue = element\.animate\(\[\], \{ duration: step\.moment === "earned" \? gatherMs \+ riseMs \+ fallMs : MOTION\.returned\.durationMs, delay: step\.delay \}\);/);
  assert.match(motion, /feel\(step\.moment === "earned" \? "open" : "down", element, true\)/);
  assert.doesNotMatch(motion, /setTimeout|setInterval/, "never a clock");
  // A look down lasts what a day going back lasts, and changes the gaze and nothing else: no frown, no scolding.
  assert.equal(MOTION.returned.durationMs, 300);
  assert.match(motion, /if \(mood\.feeling === "down"\) return \{ \.\.\.AT_REST, gaze: `translate\(0px, \$\{MOTION\.hover\.gaze\}px\)` \};/);
});

test("it jumps once when the gift is reached, with the confetti, and not under reduced motion", () => {
  const confetti = readFileSync("app/kit/Confetti.tsx", "utf8");
  assert.match(confetti, /feel\("jump", drawing, true\);/);
  assert.ok(confetti.indexOf('feel("jump"') > confetti.indexOf("prefers-reduced-motion: reduce"), "after the reduced-motion door, never before");
  const motion = readFileSync("app/kit/Motion.tsx", "utf8");
  assert.match(motion, /if \(mood\.feeling === "jump"\) \{\n\s*const jumping = playEarned\(element, 0\);/);
});
