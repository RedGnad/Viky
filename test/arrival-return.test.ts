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
test("what this device last saw comes from the cookie the server read, the same in the browser's first render (the fix to #154)", () => {
  const seen = readFileSync("app/kit/seen.tsx", "utf8");
  assert.match(seen, /useSyncExternalStore\(neverChanges, \(\) => snapshot\(key, initial\), \(\) => initial\[seenKey\(key\)\]\)/, "the server's answer and the hydration's are the cookie's");
  assert.match(seen, /const onThisScreen = new Map/, "frozen for as long as the screen stands");
  assert.match(seen, /export function forgetOnThisScreen/, "and forgotten when it goes");
  assert.doesNotMatch(readFileSync("app/kit/Motion.tsx", "utf8"), /localStorage/, "nothing the server cannot read decides the first image");
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
  assert.match(climb, /ink\.animate\(\[\{ strokeDasharray: `\$\{from\} 1` \}, \{ strokeDasharray: `\$\{progress\} 1` \}\], timing\)/);
  assert.match(climb, /duration: MOTION\.count\.durationMs/);
  assert.match(climb, /className=\{walks \? "climb-walker arrival-pending" : "climb-walker"\}/, "drawn not yet there when it will walk");
  assert.match(climb, /prefers-reduced-motion: reduce/);
});
