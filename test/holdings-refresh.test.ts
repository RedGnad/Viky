import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * Money that arrives shows on Home without reloading the page (the founder, 28 Sep 2026): the holdings are read again
 * while the screen is in front of the person, and at once when they come back to it.
 */
test("the holdings are read again on a timer, on coming back to the screen, and never while it is hidden", () => {
  const source = readFileSync("app/kit/money.ts", "utf8");
  assert.match(source, /export const HOLDINGS_EVERY_MS = 10_000;/);
  assert.match(source, /setInterval\(read, HOLDINGS_EVERY_MS\)/);
  assert.match(source, /addEventListener\("visibilitychange", read\)/);
  assert.match(source, /addEventListener\("focus", read\)/);
  assert.match(source, /document\.visibilityState !== "visible"\) return;/, "a hidden screen reads nothing");
  // Everything added is taken away when the screen goes, or a left page would keep reading for ever.
  assert.match(source, /clearInterval\(timer\)/);
  assert.match(source, /removeEventListener\("visibilitychange", read\)/);
  assert.match(source, /removeEventListener\("focus", read\)/);
  assert.match(source, /sameHoldings\(was, next\) \? was : next/, "the same amounts change nothing on screen");
});
