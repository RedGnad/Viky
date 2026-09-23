import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { moneyOf } from "../app/components/GiftPage";
import { MOTION } from "../src/design-tokens";

/**
 * The arrival on a return (the founder, 23 Sep 2026, the life of the product, step 1): opening a gift plays what
 * changed since this device's last visit, once, the days earned, then the days gone back, then the amount counting;
 * nothing if nothing changed; and on a climb, the slope advances to today's reading.
 */
test("what this device last saw is read by the browser after a server-drawn screen, not frozen at the server's answer", () => {
  const motion = readFileSync("app/kit/Motion.tsx", "utf8");
  const hook = motion.slice(motion.indexOf("export function useLastSeen"));
  assert.doesNotMatch(hook.slice(0, hook.indexOf("\n}\n")), /useState\(/, "a first render frozen in state is the hydration's, which knows nothing");
  assert.match(motion, /const seenOnThisScreen = new Map/);
  assert.match(hook, /seenOnThisScreen\.delete\(key\)/, "and forgotten when the screen goes, so the next one reads what this one wrote");
});

test("the money on a gift's card counts, last in the arrival, and nothing that is not money counts", () => {
  assert.deepEqual(moneyOf("$2.00"), { symbol: "$", value: 2, after: "" });
  assert.deepEqual(moneyOf("$1,250.50"), { symbol: "$", value: 1250.5, after: "" });
  assert.equal(moneyOf("1410"), null, "a rating is a reading, not an amount");
  assert.equal(moneyOf(undefined), null);
  const page = readFileSync("app/components/GiftPage.tsx", "utf8");
  assert.match(page, /<Arrival\n\s*storageKey="viky\.seen\.days"\n\s*amount/, "the gift's arrival counts its amount");
  assert.match(page, /<ArrivalAmount from=\{seenMoney \?\? figureMoney\.value\} to=\{figureMoney\.value\}/, "from what this device last saw");
  assert.equal(MOTION.count.durationMs, 700);
  assert.equal(MOTION.arrival.budgetMs, 2000);
  assert.equal(MOTION.arrival.staggerMs, 120);
  assert.deepEqual([MOTION.earned.gatherMs, MOTION.earned.riseMs, MOTION.earned.fallMs], [80, 170, 130]);
  assert.equal(MOTION.returned.durationMs, 300);
});

test("on a climb, the ink advances with the character to today's reading, once, and not under reduced motion", () => {
  const climb = readFileSync("app/kit/Climb.tsx", "utf8");
  assert.match(climb, /inked\.current\?\.animate\(\[\{ strokeDasharray: `\$\{from\} 1` \}, \{ strokeDasharray: `\$\{progress\} 1` \}\]/);
  assert.match(climb, /duration: MOTION\.count\.durationMs/);
  assert.match(climb, /prefers-reduced-motion: reduce/);
});
