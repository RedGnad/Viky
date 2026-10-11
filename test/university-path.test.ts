import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { drawnStops, labelOf, PATH_TIMES, standingOn, stopsOf, timeAt, type PathStanding } from "../src/university-path";

/**
 * The path of a university gift (the founder, 11 Oct 2026): which stops a gift has, by its university's provider for
 * what the gift asks, where the character stands, and what is written under each stop. The words are the mockup's.
 */
const ids = (stops: ReturnType<typeof stopsOf>) => stops.map((stop) => stop.id);
const STANDS: PathStanding = { opened: true, reached: false, over: false, wait: null, resultsToCome: false };

test("the stops: four with no provider, three with one that has no pin, the road alone once it is ready", () => {
  assert.deepEqual(ids(stopsOf({ provider: "none", results: false })), ["setUp", "shown", "checked", "theirs"]);
  assert.deepEqual(ids(stopsOf({ provider: "unpinned", results: false })), ["shown", "checked", "theirs"]);
  assert.deepEqual(ids(stopsOf({ provider: "ready", results: false })), ["shown", "theirs"]);
  assert.deepEqual(ids(stopsOf({ provider: "seconds", results: false })), ["shown", "theirs"]);
  // The two that happen once for a university are the small ones, and they alone.
  assert.deepEqual(stopsOf({ provider: "none", results: false }).filter((stop) => stop.once).map((stop) => stop.id), ["setUp", "checked"]);
});

test("a gift on results starts at Results, and its setting up is not drawn", () => {
  assert.deepEqual(ids(stopsOf({ provider: "none", results: true })), ["results", "shown", "checked", "theirs"]);
  assert.deepEqual(ids(stopsOf({ provider: "unpinned", results: true })), ["results", "shown", "checked", "theirs"]);
  assert.deepEqual(ids(stopsOf({ provider: "seconds", results: true })), ["results", "shown", "theirs"]);
});

test("a time only where somebody waits on us, and 'in seconds' only on a fixed rule or Reclaim's own check", () => {
  const times = (provider: Parameters<typeof stopsOf>[0]["provider"], results = false) => Object.fromEntries(stopsOf({ provider, results }).map((stop) => [stop.id, stop.time]));
  assert.deepEqual(times("none"), { setUp: "once, 2 days", shown: null, checked: "once, 1 day", theirs: null });
  assert.deepEqual(times("ready"), { shown: null, theirs: null }, "ready, and its rule is written again by an agent at each pass: no time is promised");
  assert.deepEqual(times("seconds"), { shown: null, theirs: "in seconds" });
  assert.deepEqual(times("unpinned", true), { results: "end of year", shown: null, checked: "once, 1 day", theirs: null });
  assert.deepEqual(PATH_TIMES, { setUp: "once, 2 days", checked: "once, 1 day", seconds: "in seconds", results: "end of year" });
});

test("where the character stands: being set up, their turn, being checked, theirs", () => {
  const four = stopsOf({ provider: "none", results: false });
  assert.equal(standingOn(four, { ...STANDS, wait: "building" }), "setUp");
  assert.equal(standingOn(four, STANDS), "shown");
  assert.equal(standingOn(four, { ...STANDS, wait: "pending" }), "checked");
  assert.equal(standingOn(four, { ...STANDS, reached: true }), "theirs");
  assert.equal(standingOn(four, { ...STANDS, over: true }), null, "over without its proof: on no stop");
  // A gift nobody opened stands where it would stand opened: its character sleeps there.
  assert.equal(standingOn(four, { ...STANDS, opened: false, wait: "building" }), "setUp");
  // A university set up since the gift was made no longer has the stop the gift would wait on.
  assert.equal(standingOn(stopsOf({ provider: "seconds", results: false }), { ...STANDS, wait: "building" }), "shown");
  const results = stopsOf({ provider: "unpinned", results: true });
  assert.equal(standingOn(results, { ...STANDS, resultsToCome: true }), "results");
  assert.equal(standingOn(results, STANDS), "shown");
});

test("under the stop stood on: the day it is set up by, whose turn it is, how long the check takes", () => {
  assert.equal(timeAt("setUp", { yours: true, setUpBy: "13 Oct" }), "by 13 Oct");
  assert.equal(timeAt("setUp", { yours: true, setUpBy: null }), null, "a day that has passed is not said");
  assert.equal(timeAt("shown", { yours: true, setUpBy: null }), "by you");
  assert.equal(timeAt("shown", { yours: false, setUpBy: null }), "by them");
  assert.equal(timeAt("checked", { yours: true, setUpBy: null }), "within a day");
  assert.equal(timeAt("theirs", { yours: true, setUpBy: null }), null);
  assert.equal(labelOf("theirs", true), "Yours");
  assert.equal(labelOf("theirs", false), "Theirs");
});

test("what is drawn: stops passed, the one stood on with its own line, stops to come with their time", () => {
  const drawn = drawnStops(stopsOf({ provider: "none", results: false }), "checked", { yours: true, setUpBy: null });
  assert.deepEqual(
    drawn.map((stop) => [stop.label, stop.state, stop.time, stop.once, stop.lead]),
    [
      ["Set up", "done", null, true, true],
      ["Shown", "done", null, false, false],
      ["Checked", "now", "within a day", true, false],
      ["Yours", "toCome", null, false, false],
    ],
  );
  // Under a chosen university nothing has started: every stop is to come, with its time.
  const chosen = drawnStops(stopsOf({ provider: "none", results: false }), null, { yours: false, setUpBy: null });
  assert.deepEqual(chosen.map((stop) => [stop.label, stop.state, stop.time]), [["Set up", "toCome", "once, 2 days"], ["Shown", "toCome", null], ["Checked", "toCome", "once, 1 day"], ["Theirs", "toCome", null]]);
});

test("a gift keeps the stops it went through, once its university has moved on", () => {
  // The first gift, its university set up since: the Set up stop stays, passed, and the character is on Shown.
  const setUpSince = stopsOf({ provider: "unpinned", results: false, waitedOnSetUp: true });
  assert.deepEqual(ids(setUpSince), ["setUp", "shown", "checked", "theirs"]);
  assert.deepEqual(drawnStops(setUpSince, standingOn(setUpSince, STANDS), { yours: true, setUpBy: null }).map((stop) => [stop.state, stop.time]), [["done", null], ["now", "by you"], ["toCome", "once, 1 day"], ["toCome", null]]);
  // Its proof read and the rule fixed since: both small stops stay, and "in seconds" is never said of a proof a person read.
  const read = stopsOf({ provider: "seconds", results: false, waitedOnSetUp: true, readByAPerson: true });
  assert.deepEqual(ids(read), ["setUp", "shown", "checked", "theirs"]);
  assert.equal(read.at(-1)?.time, null);
  assert.deepEqual(drawnStops(read, "theirs", { yours: true, setUpBy: null }).map((stop) => stop.state), ["done", "done", "done", "now"]);
  // Another gift made during the setting up, whose proof nobody has to read: it waited, and is not checked.
  assert.deepEqual(ids(stopsOf({ provider: "seconds", results: false, waitedOnSetUp: true })), ["setUp", "shown", "theirs"]);
  // A proof held at a university set up before the gift was made: checked, with no setting up.
  assert.deepEqual(ids(stopsOf({ provider: "ready", results: false, readByAPerson: true })), ["shown", "checked", "theirs"]);
  // A gift on results draws no setting up, whatever it waited on.
  assert.deepEqual(ids(stopsOf({ provider: "ready", results: true, waitedOnSetUp: true })), ["results", "shown", "theirs"]);
  // The status reads both from the gift's own rows: the request its university was set up by, and its own review.
  const status = readFileSync("src/milestone-status.ts", "utf8");
  assert.match(status, /const \[request, review\] = await Promise\.all\(\[requestOf\(portal\.portalId, sense\), latestReviewOf\(giftId\)\]\);/);
  assert.match(status, /waitedOnSetUp: Boolean\(request\?\.builtAt && madeAtSeconds \* 1000 < request\.builtAt\.getTime\(\)\),/);
  assert.match(status, /readByAPerson: Boolean\(review\),/);
  assert.match(status, /const university = await universityPath\(record\.giftId, milestone, state\.fundedAt\);/);
  // And the two places a gift's path is drawn hand both on.
  for (const file of ["app/components/GiftPage.tsx", "app/kit/GiftCard.tsx"]) {
    assert.match(readFileSync(file, "utf8"), /waitedOnSetUp=\{milestone\.university\.waitedOnSetUp\}\n\s+readByAPerson=\{milestone\.university\.readByAPerson\}/, file);
  }
});
