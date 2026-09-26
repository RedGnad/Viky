import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { classifyFetchFailure } from "../src/attested-read";
import { attestedSource } from "../src/attested-sources";
import { isTooManyRequests, PLATFORM_PACE, SourcePace } from "../src/source-throttle";

/** The reading service's pace with race result and MikaTiming (the founder, 27 Sep 2026, after the 26 Sep throttle). */

const T0 = Date.UTC(2026, 8, 27, 10, 0, 0);

test("an interval between two readings of a platform, none for the other sources", () => {
  const pace = new SourcePace();
  assert.deepEqual(pace.take("race-result-row", T0), { go: true, waitMs: 0, platform: "race-result" });
  assert.deepEqual(pace.take("race-result-row", T0 + 1_000), { go: true, waitMs: 2_000, platform: "race-result" }, "waits out the interval");
  assert.deepEqual(pace.take("race-result-row", T0 + 1_000), { go: true, waitMs: 5_000, platform: "race-result" }, "queued behind the one before");
  assert.deepEqual(pace.take("mika-timing-runner", T0 + 1_000), { go: true, waitMs: 0, platform: "mika-timing" }, "each platform its own pace");
  assert.deepEqual(pace.take("codeforces-user", T0 + 1_000), { go: true, waitMs: 0, platform: null }, "the other sources untouched");
});

test("a ceiling per day, given back on a 429, and a pause after it that puts readings off without counting them", () => {
  const pace = new SourcePace({ "race-result": { ...PLATFORM_PACE["race-result"], perDay: 2, minIntervalMs: 0 } });
  assert.equal(pace.take("race-result-row", T0).go, true);
  assert.equal(pace.take("race-result-row", T0).go, true);
  const third = pace.take("race-result-row", T0);
  assert.equal(third.go, false);
  assert.equal(third.go === false && third.reason, "DAILY_CEILING");
  assert.equal(pace.take("race-result-row", T0 + 86_400_000).go, true, "a new UTC day, a new ceiling");
  const again = new SourcePace({ "race-result": { ...PLATFORM_PACE["race-result"], perDay: 1, minIntervalMs: 0 } });
  assert.equal(again.take("race-result-row", T0).go, true);
  assert.equal(again.answered429("race-result-row", T0), 30 * 60_000);
  const paused = again.take("race-result-row", T0 + 60_000);
  assert.equal(paused.go === false && paused.reason, "PAUSED_AFTER_429");
  assert.equal(paused.go === false && paused.retryAfterMs, 29 * 60_000);
  assert.equal(again.take("race-result-row", T0 + 30 * 60_000).go, true, "after the pause, and the 429'd reading was not counted against the day");
});

test("a 429 is read as THROTTLED everywhere, and the service answers it at once", () => {
  assert.ok(isTooManyRequests("received HTTP 429 from the server") && isTooManyRequests('{"error":"too many requests"}') && !isTooManyRequests("HTTP response status 404"));
  const source = attestedSource("race-result-row")!;
  for (const message of ["HTTP response status 429", "THROTTLED DAILY_CEILING: race-result is read again in 60 minutes"]) {
    const read = classifyFetchFailure(message, source);
    assert.equal(read.code, "FETCH_FAILED", "a failure to read now, never a fact about the runner");
    assert.match(read.message, /^THROTTLED/);
  }
  const worker = readFileSync("scripts/zkfetch-worker.ts", "utf8");
  assert.match(worker, /const booked = pace\.take\(source\.id, Date\.now\(\)\)/);
  assert.match(worker, /pace\.answered429\(source\.id, Date\.now\(\)\)/);
  assert.match(readFileSync("src/marathon-reading.ts", "utf8"), /if \(\/\^THROTTLED\/\.test\(error\.message\)\)/);
});
