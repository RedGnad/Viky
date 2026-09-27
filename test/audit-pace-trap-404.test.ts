import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { attestedSource, BREIZH_CHRONO_RUNNER, MIKA_TIMING_RUNNER, RACE_RESULT_ROW } from "../src/attested-sources";
import { marathonEventById } from "../src/marathon";
import { attestMarathonResult, MarathonReadError, readMarathonResult } from "../src/marathon-reading";
import { isRaceResultTrap, RaceResultError, readRaceResultConfig, readRaceResultRow } from "../src/race-result";
import { PLATFORM_PACE, SourcePace } from "../src/source-throttle";
import { throttleAnswerOf } from "../src/throttle-answer";

/**
 * race result's second way of asking a reader to slow down (D290, D292): after its 429s, a throttled address is
 * answered 404 with a trap page whose body starts `"A":`, for hours. Wherever production reads race result, that 404
 * is a 429: a failure to read now, never "no such event" or "no such runner"; in the reading service, a pause, and the
 * reading is not counted.
 */

const T0 = Date.UTC(2026, 8, 27, 10, 0, 0);
const TRAP = '"A":{"A":{"A":"A"}}';
const CONFIG = JSON.stringify({ key: "bafa4cbc7e8acfb6a08aa821a73310c1", server: "my4.raceresult.com", eventname: "42K de Buenos Aires 2026", contests: { "1": "Maratón" }, TabConfig: { Lists: [{ Name: "Maratón 2026|Resultado General G/CH", Contest: "1" }] } });
const THROTTLED = "race result is being read too often right now. Nothing was counted: try again in half an hour.";
const BUENOS_AIRES = marathonEventById("buenos-aires-2026/marathon")!;
const ZKFETCH_404 = "HTTP response status 404 is not a success status";

/** race result's answers: the trap on every page, or on the list only once the event's page was read. */
const trapEverywhere = async () => new Response(TRAP, { status: 404 });
const trapOnTheList = async (url: string) => (url.includes("/results/config") ? new Response(CONFIG, { status: 200 }) : new Response(TRAP, { status: 404 }));

test("a trap 404 on the event's page or on its list is read as a 429, and a plain 404 is still an unknown event", async () => {
  for (const [where, fetchImpl] of [["the event's page", trapEverywhere], ["the list", trapOnTheList]] as const) {
    await assert.rejects(
      readRaceResultRow(BUENOS_AIRES.race, BUENOS_AIRES.event, "1", fetchImpl),
      (error: unknown) => error instanceof RaceResultError && error.code === "FETCH_FAILED" && error.message === THROTTLED,
      `${where}: a failure to read now, the same words as a 429`,
    );
    await assert.rejects(readMarathonResult("423560|1|1", fetchImpl), (error: unknown) => error instanceof MarathonReadError && error.code === "FETCH_FAILED" && error.message === THROTTLED, `${where}: the plain reading the screen shows`);
    let asked = 0;
    const deps = { zkFetch: async () => { asked += 1; throw new Error("not reached"); }, verify: async () => true } as never;
    await assert.rejects(attestMarathonResult("423560|1|1", deps, fetchImpl), (error: unknown) => error instanceof MarathonReadError && error.code === "FETCH_FAILED" && error.message === THROTTLED, `${where}: the reading that moves money`);
    assert.equal(asked, 0, `${where}: nothing is asked of the reading service after the trap`);
  }
  await assert.rejects(readRaceResultConfig("423560", async () => new Response("Not Found", { status: 404 })), (error: unknown) => error instanceof RaceResultError && error.code === "UNKNOWN_RACE", "a 404 that is not the trap");
  await assert.rejects(readRaceResultConfig("423560", async () => new Response("", { status: 404 })), (error: unknown) => error instanceof RaceResultError && error.code === "UNKNOWN_RACE", "an empty 404");
});

test("the trap is one rule, the generator's, kept in one place", () => {
  assert.equal(isRaceResultTrap(TRAP), true);
  assert.equal(isRaceResultTrap(`\n${TRAP}`), true, "whatever comes before it on the line");
  assert.equal(isRaceResultTrap("Not Found"), false);
  assert.equal(isRaceResultTrap(""), false);
  assert.equal(isRaceResultTrap('{"A":1}'), false, "a JSON object is not the trap");
  const generator = readFileSync("scripts/raceresult-register.ts", "utf8");
  assert.match(generator, /import \{[^}]*\bisRaceResultTrap\b[^}]*\} from "\.\.\/src\/race-result"/);
  assert.match(generator, /if \(!isRaceResultTrap\(text\)\) return null;/);
  assert.doesNotMatch(generator, /startsWith\('"A":'\)/, "no second copy of the rule");
});

test("in the reading service, a 404 on race result's row is the trap: the platform is paused, and the reading is not counted", () => {
  assert.equal(throttleAnswerOf(RACE_RESULT_ROW, ZKFETCH_404), "TRAP_404");
  assert.equal(throttleAnswerOf(RACE_RESULT_ROW, "received HTTP 404 from the server"), "TRAP_404");
  assert.equal(throttleAnswerOf(RACE_RESULT_ROW, "HTTP response status 429 is not a success status"), "ANSWERED_429");
  assert.equal(throttleAnswerOf(MIKA_TIMING_RUNNER, "HTTP response status 429 is not a success status"), "ANSWERED_429");
  assert.equal(throttleAnswerOf(MIKA_TIMING_RUNNER, ZKFETCH_404), null, "another platform's 404 keeps its meaning");
  assert.equal(throttleAnswerOf(BREIZH_CHRONO_RUNNER, ZKFETCH_404), null);
  assert.equal(throttleAnswerOf(attestedSource("codeforces-user")!, ZKFETCH_404), null);
  assert.equal(throttleAnswerOf(RACE_RESULT_ROW, 'Regex "x" didn\'t match'), null, "a page read and refused by its pattern is not the trap");
  assert.equal(throttleAnswerOf(RACE_RESULT_ROW, "HTTP response status 500 is not a success status"), null);

  // What the service does with it: the day's one reading is booked, the trap pauses the platform and gives it back.
  const pace = new SourcePace({ "race-result": { ...PLATFORM_PACE["race-result"], perDay: 1, minIntervalMs: 0 } });
  assert.equal(pace.take(RACE_RESULT_ROW.id, T0).go, true);
  assert.ok(throttleAnswerOf(RACE_RESULT_ROW, ZKFETCH_404));
  assert.equal(pace.answered429(RACE_RESULT_ROW.id, T0), 30 * 60_000);
  const put = pace.take(RACE_RESULT_ROW.id, T0 + 60_000);
  assert.equal(put.go === false && put.reason, "PAUSED_AFTER_429", "put off for the pause");
  assert.equal(pace.take(RACE_RESULT_ROW.id, T0 + 30 * 60_000).go, true, "after it, the day's one reading is still there");

  const worker = readFileSync("scripts/zkfetch-worker.ts", "utf8");
  assert.match(
    worker,
    /const throttle = throttleAnswerOf\(source, message\);\s*if \(throttle\) \{\s*const pausedMs = pace\.answered429\(source\.id, Date\.now\(\)\);[^\n]*\n[^\n]*reason: throttle[^\n]*\n\s*return reply\(503, \{ error: "THROTTLED", message: `THROTTLED \$\{throttle\}:/,
    "the worker pauses on either answer and replies THROTTLED, which the app reads as a failure to read now",
  );
  assert.doesNotMatch(worker, /if \(isTooManyRequests\(message\)\)/, "a 429 alone no longer decides");
});
