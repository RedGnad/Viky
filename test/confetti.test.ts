import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import test from "node:test";
import { MOTION } from "../src/design-tokens";

/**
 * Decision B of the founder (23 Sep 2026): the one confetti of the app is "Atteint", for the person it is for and for
 * the funder; never at payment, where the gift's character arrives on its spring and nothing is thrown.
 */
test("the confetti is thrown in one place, on a gift reached, to its two people and to nobody else", () => {
  const users = globSync("app/**/*.tsx").filter((file) => /<Confetti\b/.test(readFileSync(file, "utf8")));
  assert.deepEqual(users, ["app/components/GiftPage.tsx"]);
  const page = readFileSync("app/components/GiftPage.tsx", "utf8");
  assert.match(page, /<Confetti giftId=\{giftId\} play=\{moment === "won" && \(mine \|\| readerIsFunder\)\} \/>/);
  const confetti = readFileSync("app/kit/Confetti.tsx", "utf8");
  assert.match(confetti, /prefers-reduced-motion: reduce/, "reduced motion throws nothing");
  assert.match(confetti, /viky\.seen\.reached\./, "once per device and per gift, the first time it is seen reached");
  assert.doesNotMatch(confetti, /setInterval|setTimeout|iterations/, "nothing on a clock, nothing repeated");
  assert.ok(MOTION.confetti.durationMs < 1000, "over in under a second");
});

test("at payment, the gift's character arrives on its spring, only when the payment was just made, and nothing is thrown", () => {
  const pay = readFileSync("app/components/PayGift.tsx", "utf8");
  assert.doesNotMatch(pay, /Confetti/);
  assert.match(pay, /justMade \? \(\s*<Success>\s*<span className="block w-\[72px\] shrink-0">\s*<Figure id="made"/);
  assert.match(pay, /setMade\(record\);\n\s*setJustMade\(true\);/, "the press that made it, and not a reload, is what plays it");
});
