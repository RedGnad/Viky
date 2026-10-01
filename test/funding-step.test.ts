import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CONVERSION_RESERVE, nextFundingStep, pausedAfterFailure, POLL_MS, RETRY_PAUSE_MS } from "../src/funding-step";

/**
 * The waiting screen's cadence when the conversion keeps failing (the audit of 1 Oct 2026, finding F-20).
 *
 * The screen's watch depends on its phase, and a failed conversion puts the phase back to waiting: the watch starts
 * again at once, looks at once, and found the same payment to convert. Measured on a local build with the price not
 * answering: 596 to 717 requests in twelve seconds. The pause is in the decision, so it is tested here as the screen
 * runs it: a look at once whenever the phase comes back to waiting, and a look every `POLL_MS` after that.
 */

const WANTED = 30_000_000n;
const ARRIVED = CONVERSION_RESERVE + 40_000_000_000_000_000_000n;
/** How long a conversion that fails takes to fail, as measured locally: about twenty milliseconds. */
const FAILS_AFTER_MS = 20;

/** The conversions tried in a window, every one failing. `paused` false is the screen as it was. */
function conversionsTried(windowMs: number, paused: boolean): number[] {
  const tried: number[] = [];
  let failedAtMs: number | null = null;
  let lookAt = 0;
  while (lookAt < windowMs) {
    const step = nextFundingStep({ held: 0n, arriving: ARRIVED, wanted: WANTED, failedAtMs: paused ? failedAtMs : null, nowMs: lookAt });
    if (step.do === "convert") {
      tried.push(lookAt);
      failedAtMs = lookAt + FAILS_AFTER_MS;
      // The phase came back to waiting: the watch starts again and looks at once.
      lookAt = failedAtMs;
    } else {
      // Nothing to do at this look: the next one is the watch's own, a whole interval later.
      lookAt += POLL_MS;
    }
  }
  return tried;
}

test("a conversion that keeps failing is tried once a look, not hundreds of times", () => {
  assert.ok(RETRY_PAUSE_MS < POLL_MS, "the pause is shorter than a look, so the look after a failure does try");
  const before = conversionsTried(12_000, false);
  assert.ok(before.length >= 500, `without the pause the screen tried ${before.length} times in twelve seconds`);
  const now = conversionsTried(12_000, true);
  assert.deepEqual(now, [0, POLL_MS + FAILS_AFTER_MS], "once on arriving, once a look later, and nothing between");
  // Over a minute: one try a look, each a whole pause after the failure before it.
  const minute = conversionsTried(60_000, true);
  assert.ok(minute.length <= Math.ceil(60_000 / POLL_MS), `${minute.length} tries in a minute`);
  for (let index = 1; index < minute.length; index += 1) assert.ok(minute[index] - minute[index - 1] >= RETRY_PAUSE_MS);
});

test("the pause holds a conversion only, only after a failure, and only for its length", () => {
  assert.equal(pausedAfterFailure(null, 5_000), false, "never failed, never paused");
  assert.equal(pausedAfterFailure(1_000, 1_000), true);
  assert.equal(pausedAfterFailure(1_000, 1_000 + RETRY_PAUSE_MS - 1), true);
  assert.equal(pausedAfterFailure(1_000, 1_000 + RETRY_PAUSE_MS), false, "the pause is over, the next look converts");
  // A clock that went backwards holds nothing for ever.
  assert.equal(pausedAfterFailure(10_000, 1_000), false);
  // What the person is told while it is held is that something arrived, and nothing is done.
  assert.deepEqual(nextFundingStep({ held: 0n, arriving: ARRIVED, wanted: WANTED, failedAtMs: 1_000, nowMs: 2_000 }), { do: "wait", sawSomething: true });
  assert.deepEqual(nextFundingStep({ held: 0n, arriving: ARRIVED, wanted: WANTED, failedAtMs: 1_000, nowMs: 1_000 + RETRY_PAUSE_MS }), { do: "convert", amount: ARRIVED - CONVERSION_RESERVE });
  // A gift that can be made is made, pause or not: the pause is about converting.
  assert.deepEqual(nextFundingStep({ held: WANTED, arriving: ARRIVED, wanted: WANTED, failedAtMs: 1_000, nowMs: 1_001 }), { do: "give" });
  // With nothing said about a failure, the decision is what it always was.
  assert.deepEqual(nextFundingStep({ held: 0n, arriving: ARRIVED, wanted: WANTED }), { do: "convert", amount: ARRIVED - CONVERSION_RESERVE });
});

test("the screen keeps the time of the failure, and its watch still depends on the phase", () => {
  const screen = readFileSync("app/components/PayGift.tsx", "utf8");
  const watch = screen.slice(screen.indexOf("// While paying: watch the account"), screen.indexOf("const copy = "));
  assert.match(watch, /nextFundingStep\(\{ held: read\.held, arriving: read\.arriving, wanted, failedAtMs: failedAtMs\.current, nowMs: Date\.now\(\) \}\)/);
  const failure = watch.slice(watch.indexOf('"/api/fund/quote"'), watch.indexOf("const after = await readAusdBalance"));
  assert.ok(failure.indexOf("failedAtMs.current = Date.now()") < failure.indexOf('setPhase("waiting")'), "the time is kept before the phase starts the watch again");
  assert.match(failure, /setProblem\(W\.arrived\.priceMoved\);\s+setPhase\("waiting"\)/, "the sentence is said with the phase it belongs to");
  assert.match(watch, /\}, \[step, address, units, phase, refresh, give, ensureSigner\]\);/, "the phase stays among what the watch depends on");
  assert.match(watch, /setInterval\(\(\) => void look\(\), POLL_MS\)/);
});
