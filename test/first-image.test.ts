import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { SEEN_MAX_ENTRIES, seenCookieWith, seenFromCookie, seenKey } from "../src/seen-cookie";
import { renderMinute } from "../src/render-minute";

/**
 * The fix to #154 (the chain D160, D171, #154, written in DECISIONS): the first image of an arrival is either its final
 * state, when nothing changed, or its starting state, the days to come not there and the amount at its old value;
 * never the final state followed by a restart.
 */
test("the cookie carries numbers only, keyed by what they are about, and never grows past forty entries", () => {
  assert.equal(seenKey("viky.seen.days.3"), "days.3");
  assert.deepEqual(seenFromCookie(seenCookieWith({}, "days.3", 5)), { "days.3": 5 });
  assert.deepEqual(seenFromCookie(encodeURIComponent(JSON.stringify({ a: 1, b: "x", c: Number.NaN }))), { a: 1 }, "anything that is not a number is dropped");
  assert.deepEqual(seenFromCookie("not json"), {});
  let seen = {};
  for (let index = 0; index < 60; index += 1) seen = seenFromCookie(seenCookieWith(seen, `days.${index}`, index));
  assert.equal(Object.keys(seen).length, SEEN_MAX_ENTRIES);
  assert.ok("days.59" in seen && !("days.0" in seen), "the oldest go first");
});

test("the server draws the starting state: the days to come not there, the amount at its old value, the walker hidden", () => {
  const motion = readFileSync("app/kit/Motion.tsx", "utf8");
  assert.match(motion, /className=\{pending \? "contents arrival-pending" : "contents"\}/);
  assert.match(motion, /const \[shown, setShown\] = useState\(from\);/, "the first image shows where the count starts");
  const css = readFileSync("app/globals.css", "utf8");
  assert.match(css, /\.arrival-pending svg,\n\.arrival-pending\.climb-walker,\n\.arrival-pending\.climb-done \{\n  opacity: 0;\n\}/);
  // Reduced motion never moves, so its first image is the final state: the pending days are shown where they are.
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\n  \.arrival-pending svg,\n  \.arrival-pending\.climb-walker,\n  \.arrival-pending\.climb-done \{\n    opacity: 1;\n  \}\n\}/);
});

test("the dated things are in the first image: the server's render minute is the clock of its render and of hydration", () => {
  assert.equal(renderMinute(Date.UTC(2026, 8, 23, 9, 41, 37, 512)), Date.UTC(2026, 8, 23, 9, 41));
  const clock = readFileSync("app/kit/clock.tsx", "utf8");
  assert.match(clock, /useSyncExternalStore\(everyMinute, thisMinute, \(\) => drawnAt\)/);
  assert.doesNotMatch(readFileSync("app/components/GiftPage.tsx", "utf8"), /browser && daily/, "the row of days is drawn by the server");
});
