import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MOTION } from "../src/design-tokens";

/**
 * The character reacts (the life of the product, step 2, 23 Sep 2026): it opens when a day earned lands, looks down for
 * 300 ms when a day goes back, and jumps once at "atteint". Each reaction comes from the gift's own record, never from
 * a clock, and it never scolds. It answers no button and no pointer (D216).
 */
test("it answers no button and no pointer (D216): the two expressions and the gaze are gone", () => {
  const motion = readFileSync("app/kit/Motion.tsx", "utf8");
  assert.doesNotMatch(motion, /export function Gaze\(/, "nothing follows the pointer");
  assert.doesNotMatch(motion, /"curious"|"happy"/, "no expression answers a control");
  assert.doesNotMatch(readFileSync("app/kit/mood.ts", "utf8"), /"curious"|"happy"/);
  for (const file of ["app/kit/offer/OfferCard.tsx", "app/kit/ShowProof.tsx"]) assert.ok(!readFileSync(file, "utf8").includes("feel("), `${file} asks the character nothing`);
  for (const file of ["app/kit/HeadCharacter.tsx", "app/kit/HeroMoment.tsx", "app/kit/DayRow.tsx"]) assert.ok(!readFileSync(file, "utf8").includes("<Gaze"), `${file} has no gaze`);
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

test("it jumps once when the gift is reached, in the moment, and not under reduced motion", () => {
  const moment = readFileSync("app/kit/ReachedMoment.tsx", "utf8");
  assert.match(moment, /figure\.current\.animate\(/);
  assert.ok(moment.indexOf("figure.current.animate(") > moment.indexOf("if (still) return;"), "after the reduced-motion door, never before");
  const motion = readFileSync("app/kit/Motion.tsx", "utf8");
  assert.match(motion, /if \(mood\.feeling === "jump"\) \{\n\s*const jumping = playEarned\(element, 0\);/);
});
