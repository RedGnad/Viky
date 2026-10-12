// Where each condition stands, in the same words on the README, on "What Viky can check" and on the judges page (the
// founder, 12 Oct 2026). One function says it, from the register and from the count of real proofs; this holds its
// four phrases, the sentence of four figures, and the rule that a reading of 12 Oct 2026 is said only of a line whose
// proof really exists.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fourFigures, READY_ON_REQUEST, standInOneLine, standInTheReadme, standOf, standOnAPage, standsCounted, WAITS_FOR_THE_YEAR } from "../src/condition-stands";
import { conditionById, liveConditions } from "../src/conditions";
import { READ_WITHOUT_A_GIFT } from "../src/judges-ways";

const line = (id: string) => conditionById(id)!;
/**
 * The real proofs that paid, as production's rows hold them on 13 Oct 2026: five days credited, three enrolments, two
 * climbs reached. Until that day the count took first readings too, which pay nothing, and said 11, 3 and 7.
 */
const COUNTS = new Map([["duolingo-daily", 5], ["university-enrollment-shown", 3], ["chess-rating", 2]]);
const WAITING = new Set(["strava-daily"]);

test("four phrases, each said the same on a page and, shorter, in the README", () => {
  // One real proof that paid, or more: paid, with its count where the count is read as the page is served.
  const paid = standOf(line("duolingo-daily"), COUNTS, WAITING);
  assert.deepEqual(paid, { kind: "paid", proofs: 5 });
  assert.deepEqual(standOnAPage(paid), { state: "Open.", says: "Paid on 5 real proofs." });
  assert.equal(standInOneLine(paid), "Open. Paid on 5 real proofs.");
  assert.equal(standInTheReadme(paid), "Paid with real money");
  assert.equal(standInOneLine(standOf(line("codeforces-rating"), new Map([["codeforces-rating", 1]]), WAITING)), "Open. Paid on 1 real proof.");
  // Read on its real page under attestation with no gift: the day on a page, none in the README, whose table is dated.
  const read = standOf(line("codeforces-rating"), COUNTS, WAITING);
  assert.equal(standInOneLine(read), "Open. Read on its real page, 12 Oct 2026.");
  assert.equal(standInTheReadme(read), "Read on its real page");
  // Nothing yet: what it waits for when it waits for something, and otherwise that nobody has yet, by its nature.
  assert.equal(standInOneLine(standOf(line("university-year-passed-shown"), COUNTS, WAITING)), `Open. ${WAITS_FOR_THE_YEAR}`);
  assert.equal(standInOneLine(standOf(line("university-grade-shown"), COUNTS, WAITING)), "Open. Waits for the year's results.");
  assert.equal(standInOneLine(standOf(line("toefl-mybest-shown"), COUNTS, WAITING)), "Open. Nobody has shown one yet.");
  assert.equal(standInOneLine(standOf(line("fitbit-daily"), COUNTS, WAITING)), "Open. Takes a Fitbit tracker or a Pixel Watch.");
  assert.equal(standInTheReadme(standOf(line("toefl-mybest-shown"), COUNTS, WAITING)), "Open. Nobody has shown one yet.");
  // On request, until the operator opens it: then it is a line like the others, which nobody has connected yet.
  const onRequest = standOf(line("strava-daily"), COUNTS, WAITING);
  assert.equal(standInOneLine(onRequest), `On request. ${READY_ON_REQUEST}`);
  assert.equal(standInTheReadme(onRequest), "On request. Ready two days after a first gift.");
  assert.equal(standInOneLine(standOf(line("strava-daily"), COUNTS, new Set())), "Open. Nobody has connected one yet.");
  // The register's own line for the state is the same sentence the pages print.
  assert.equal(line("strava-daily").beforeItOpens, READY_ON_REQUEST);
});

test("the count not read: an open line says it is open and no more, and a line read on its page still says so", () => {
  assert.deepEqual(standOf(line("duolingo-daily"), null, WAITING), { kind: "unread" });
  assert.equal(standInOneLine(standOf(line("duolingo-daily"), null, WAITING)), "Open.");
  assert.equal(standInOneLine(standOf(line("toefl-mybest-shown"), null, WAITING)), "Open.");
  // That its page was read on 12 Oct 2026 is the register's, and needs no count; so is a line on request.
  assert.equal(standInOneLine(standOf(line("wca-time"), null, WAITING)), "Open. Read on its real page, 12 Oct 2026.");
  assert.equal(standInOneLine(standOf(line("strava-daily"), null, WAITING)), "On request. Ready two days after a first gift.");
  // And no sentence of four figures is made of counts nobody read.
  assert.equal(standsCounted(null, WAITING), null);
});

test("the sentence of four figures is counted from the same stands, and adds up to every line offered", () => {
  const counted = standsCounted(COUNTS, WAITING)!;
  assert.deepEqual(counted, { paid: 3, read: 10, waiting: 4, onRequest: 1, total: 18 });
  assert.equal(counted.paid + counted.read + counted.waiting + counted.onRequest, liveConditions().length);
  assert.equal(fourFigures(counted), "3 paid with real money, 10 read on their real page, 4 open and waiting for their first person, 1 on request.");
  // A first proof on a line read on its page moves it to the paid ones, by the count alone.
  const later = standsCounted(new Map([...COUNTS, ["wca-time", 1], ["fitbit-daily", 2]]), WAITING)!;
  assert.equal(fourFigures(later), "5 paid with real money, 9 read on their real page, 3 open and waiting for their first person, 1 on request.");
  // Strava opened: nothing is on request, the figure is not said, and Strava waits for its first person.
  assert.equal(fourFigures(standsCounted(COUNTS, new Set())!), "3 paid with real money, 10 read on their real page, 5 open and waiting for their first person.");
  // One of each is said in the singular.
  assert.equal(fourFigures({ paid: 1, read: 1, waiting: 1, onRequest: 1, total: 4 }), "1 paid with real money, 1 read on its real page, 1 open and waiting for its first person, 1 on request.");
});

test("a reading of 12 Oct 2026 is said only of a line the register lists, each of which gave a proof that day", () => {
  assert.equal(READ_WITHOUT_A_GIFT.on, "12 Oct 2026");
  assert.equal(READ_WITHOUT_A_GIFT.conditions.length, 10);
  // Every line said read is in the list, and none outside it: a line taken out of it says what it said before.
  const said = liveConditions().filter((condition) => standOf(condition, COUNTS, WAITING).kind === "read").map((condition) => condition.id);
  assert.deepEqual([...said].sort(), [...READ_WITHOUT_A_GIFT.conditions].sort());
  const source = readFileSync("src/condition-stands.ts", "utf8");
  assert.match(source, /if \(READ_WITHOUT_A_GIFT\.conditions\.includes\(condition\.id\)\) return \{ kind: "read", on: READ_WITHOUT_A_GIFT\.on \};/);
  // The three surfaces ask the one function: the public page, the judges page, and the README's table through its test.
  assert.match(readFileSync("app/what-viky-can-check/page.tsx", "utf8"), /standOnAPage\(standOf\(condition, counts, toBeOpened\)\)\.says/);
  assert.match(readFileSync("app/judges/JudgesConditions.tsx", "utf8"), /standInOneLine\(standOf\(condition, counts, toBeOpened\)\)/);
  assert.match(readFileSync("test/readme-built-on.test.ts", "utf8"), /standInTheReadme\(standOf\(condition, counts, toBeOpened\)\)/);
});
