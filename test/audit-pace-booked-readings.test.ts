import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { RACE_RESULT_ROW } from "../src/attested-sources";
import { PLATFORM_PACE, SourcePace } from "../src/source-throttle";

/**
 * A reading booked before a 429 and still waiting its turn when the 429 lands (money path audit, 27 Sep 2026): it asks
 * the pace again just before it goes, and while the platform is paused it is put off and not counted, like a reading
 * refused at booking. race result's trap 404 pauses the same way (src/throttle-answer.ts), so it is covered too.
 */

const T0 = Date.UTC(2026, 8, 27, 10, 0, 0);
const PAUSE = 30 * 60_000;

test("readings booked before a 429 are put off during the pause, and their day's count is given back", () => {
  const pace = new SourcePace({ "race-result": { ...PLATFORM_PACE["race-result"], perDay: 3 } });
  const starts = [T0, T0 + 100, T0 + 200].map((at) => {
    const booked = pace.take(RACE_RESULT_ROW.id, at);
    assert.equal(booked.go, true);
    return at + (booked.go ? booked.waitMs : 0);
  });
  assert.deepEqual(starts, [T0, T0 + 3_000, T0 + 6_000], "three seconds apart");

  // The first reading is answered 429 two seconds in: the platform is paused, that reading is not counted.
  assert.equal(pace.answered429(RACE_RESULT_ROW.id, T0 + 2_000), PAUSE);

  // The two still waiting ask again when their turn comes, and are put off for what is left of the pause.
  for (const start of starts.slice(1)) {
    assert.deepEqual(pace.stillOpen(RACE_RESULT_ROW.id, start), { go: false, reason: "PAUSED_AFTER_429", retryAfterMs: T0 + 2_000 + PAUSE - start, platform: "race-result" });
    pace.release(RACE_RESULT_ROW.id, T0);
  }

  // Nothing of the three was counted: after the pause the day still holds three readings, and not a fourth.
  const after = T0 + 2_000 + PAUSE;
  for (let index = 0; index < 3; index += 1) assert.equal(pace.take(RACE_RESULT_ROW.id, after).go, true, `reading ${index + 1} of the day`);
  const fourth = pace.take(RACE_RESULT_ROW.id, after);
  assert.equal(fourth.go === false && fourth.reason, "DAILY_CEILING");
});

test("the second look lets a reading go when nothing paused its platform, and a give-back never goes below zero or across days", () => {
  const pace = new SourcePace({ ...PLATFORM_PACE, "race-result": { ...PLATFORM_PACE["race-result"], perDay: 1 } });
  assert.deepEqual(pace.stillOpen(RACE_RESULT_ROW.id, T0), { go: true, waitMs: 0, platform: "race-result" });
  assert.deepEqual(pace.stillOpen("mika-timing-runner", T0), { go: true, waitMs: 0, platform: "mika-timing" }, "each platform its own pause");
  assert.deepEqual(pace.stillOpen("codeforces-user", T0), { go: true, waitMs: 0, platform: null }, "the other sources untouched");
  pace.answered429(RACE_RESULT_ROW.id, T0);
  assert.equal(pace.stillOpen(RACE_RESULT_ROW.id, T0 + PAUSE - 1).go, false, "the last millisecond of the pause");
  assert.equal(pace.stillOpen(RACE_RESULT_ROW.id, T0 + PAUSE).go, true, "the pause is over");
  assert.equal(pace.stillOpen("mika-timing-runner", T0 + 1).go, true, "a 429 from race result pauses race result alone");

  // The day's one reading, booked late on a day and given back after midnight: the new day's count is not touched.
  const late = Date.UTC(2026, 8, 27, 23, 59, 59);
  assert.equal(pace.take(RACE_RESULT_ROW.id, late).go, true);
  assert.equal(pace.take(RACE_RESULT_ROW.id, late + 2_000).go, true, "a new UTC day");
  pace.release(RACE_RESULT_ROW.id, late);
  assert.equal(pace.take(RACE_RESULT_ROW.id, late + 10_000).go, false, "the new day's reading still counts");
  pace.release(RACE_RESULT_ROW.id, late + 2_000);
  pace.release(RACE_RESULT_ROW.id, late + 2_000);
  assert.equal(pace.take(RACE_RESULT_ROW.id, late + 10_000).go, true, "given back once");
  assert.equal(pace.take(RACE_RESULT_ROW.id, late + 13_000).go, false, "and never below zero");

  // A give-back keeps the spacing of the readings booked behind it.
  const spaced = new SourcePace();
  spaced.take(RACE_RESULT_ROW.id, T0);
  spaced.take(RACE_RESULT_ROW.id, T0);
  spaced.release(RACE_RESULT_ROW.id, T0);
  assert.deepEqual(spaced.take(RACE_RESULT_ROW.id, T0), { go: true, waitMs: 6_000, platform: "race-result" });
});

test("the reading service asks the pace again after the wait and before the fetch, and answers a pause THROTTLED with nothing counted", () => {
  const worker = readFileSync("scripts/zkfetch-worker.ts", "utf8");
  const booked = worker.indexOf("const booked = pace.take(source.id, Date.now());");
  const waited = worker.indexOf("await wait(booked.waitMs);");
  const again = worker.indexOf("const again = pace.stillOpen(source.id, Date.now());");
  const fetched = worker.indexOf("await localAttestedFetch(source, account, bearer)");
  assert.ok(booked > 0 && waited > booked && again > waited && fetched > again, "booked, waited, asked again, then fetched");
  const between = worker.slice(again, fetched);
  assert.match(between, /if \(!again\.go\) \{\s*pace\.release\(source\.id, started\);\s*return putOff\(again\);\s*\}/, "put off, and the day's count given back");
  assert.match(worker, /if \(!booked\.go\) return putOff\(booked\);/, "one answer for a reading put off, at booking or after the wait");
  assert.match(worker, /const putOff = \(answer: [^)]*\) => \{[^}]*code: "THROTTLED", reason: answer\.reason[^\n]*\n\s*return reply\(503, \{ error: "THROTTLED", message: `THROTTLED \$\{answer\.reason\}:/);
});

test("the judges page says a reading waiting its turn is put off by a pause, as the service now does", async () => {
  const { readFileSync } = await import("node:fs");
  const page = readFileSync(new URL("../app/judges/page.tsx", import.meta.url), "utf8").replace(/\s+/g, " ");
  assert.ok(page.includes("one already waiting its turn is put off too"));
  assert.ok(!page.includes("one already waiting its turn still goes"));
});
