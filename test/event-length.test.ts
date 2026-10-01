// How long a gift may run, and how long a gift on an event has to (the audit of 1 Oct 2026). The register offered 400
// days where the contract takes 365 at the most, and a gift on a race further off than the suggested length was
// offered a length that ended before the race.

import assert from "node:assert/strict";
import { globSync, readFileSync } from "node:fs";
import test from "node:test";
import { CONDITIONS } from "../src/conditions";
import { competitionReadableAtMs, endsBeforeTheEvent, eventToOutlast, lengthForTheEvent, outlastsTheEvent, raceReadableAtMs, raceReadableAtOf } from "../src/event-length";
import { durationBounds } from "../src/gift-draft";
import { MARATHON_DURATION_DAYS, MARATHON_RACES } from "../src/marathon";
import { MILESTONE_MAX_DURATION_DAYS, MILESTONE_MIN_DURATION_DAYS } from "../src/milestone-protocol";
import { WAEC_DURATION_DAYS } from "../src/waec-shown";
import { WCA_DURATION_DAYS } from "../src/wca";

const DAY = 86_400_000;
const NOW = Date.parse("2026-10-01T08:00:00Z");

test("no length the register offers is longer than the contract takes", () => {
  assert.match(readFileSync("contracts/MilestoneGift.sol", "utf8"), /uint32 public constant MAX_DURATION_DAYS = 365;/);
  assert.equal(MILESTONE_MAX_DURATION_DAYS, 365);
  for (const condition of CONDITIONS) {
    if (condition.kind === "daily") continue;
    const bounds = durationBounds(condition.id);
    assert.ok(bounds.max <= MILESTONE_MAX_DURATION_DAYS, `${condition.id} offers ${bounds.max} days`);
    assert.ok(bounds.min >= MILESTONE_MIN_DURATION_DAYS && bounds.min <= bounds.suggested && bounds.suggested <= bounds.max, condition.id);
  }
  // And every length written down in the sources, in the register today or not: a number at or under the ceiling, or
  // the ceiling itself by name.
  let read = 0;
  for (const file of globSync("src/*.ts")) {
    for (const found of readFileSync(file, "utf8").matchAll(/_DURATION_DAYS = Object\.freeze\(\{[^}]*\bmax: ([A-Z_0-9]+)/g)) {
      read += 1;
      assert.ok(found[1] === "MILESTONE_MAX_DURATION_DAYS" || Number(found[1]) <= MILESTONE_MAX_DURATION_DAYS, `${file} offers ${found[1]}`);
    }
  }
  assert.ok(read >= 9, "the lengths were found where they are written");
  for (const bounds of [MARATHON_DURATION_DAYS, WCA_DURATION_DAYS, WAEC_DURATION_DAYS]) assert.equal(bounds.max, 365, "the three that offered 400");
});

test("a gift on a race outlasts the race by three days, on a competition by ten after its last day", () => {
  const race = "2027-04-19T00:00:00-04:00";
  assert.equal(raceReadableAtMs(race), Date.parse(race) + 3 * DAY);
  // The competition's last day ends, anywhere on earth, and ten days pass.
  assert.equal(competitionReadableAtMs("2026-11-08"), Date.parse("2026-11-09T12:00:00Z") + 10 * DAY);
  assert.equal(outlastsTheEvent(120, NOW + 120 * DAY, NOW), true);
  assert.equal(outlastsTheEvent(120, NOW + 120 * DAY + 1, NOW), false);
  assert.equal(outlastsTheEvent(120, Number.NaN, NOW), false, "a date that cannot be read outlasts nothing");
});

test("the chip pressed when an event is chosen is the first that outlasts it: a marathon in 200 days takes the longest", () => {
  const bounds = MARATHON_DURATION_DAYS;
  // Near: the suggested length is enough.
  assert.equal(lengthForTheEvent(bounds, NOW + 60 * DAY, NOW), 120);
  // In 200 days: the suggested 120 would end 83 days before the result; the longest is pressed, and the contract takes it.
  const in200 = NOW + 200 * DAY + 3 * DAY;
  const pressed = lengthForTheEvent(bounds, in200, NOW);
  assert.equal(pressed, 365);
  assert.ok(pressed <= MILESTONE_MAX_DURATION_DAYS && pressed >= bounds.min && pressed <= bounds.max, "a length the route and the contract both accept");
  assert.equal(outlastsTheEvent(pressed, in200, NOW), true);
  // The same from the register's own race: Boston, 19 April 2027.
  const boston = MARATHON_RACES.find((race) => race.raceId === "boston-2027")!;
  assert.equal(raceReadableAtOf("boston-2027/marathon"), raceReadableAtMs(boston.startsAt));
  assert.equal(lengthForTheEvent(bounds, raceReadableAtMs(boston.startsAt), NOW), 365);
  // The three chips of D130 stay three: the choosers press one of them, and add none.
  const sheet = readFileSync("app/kit/offer/WillSheet.tsx", "utf8");
  assert.match(sheet, /days: String\(lengthForTheEvent\(certificate\.duration, raceReadableAtMs\(startsAt\)\)\)/);
  assert.match(sheet, /days: String\(lengthForTheEvent\(certificate\.duration, competitionReadableAtMs\(endDate\)\)\)/);
  assert.match(readFileSync("app/kit/offer/OfferCard.tsx", "utf8"), /const quick = \[bounds\.min, bounds\.suggested, bounds\.max\];/);
});

test("the route refuses a length that ends before the event, before anything is signed for", async () => {
  const noWca = async () => {
    throw new Error("not asked");
  };
  const race = await eventToOutlast("marathon-finish", "boston-2027/marathon", noWca);
  assert.deepEqual(race, { what: "race", readableAtMs: raceReadableAtOf("boston-2027/marathon") });
  const asked: string[] = [];
  const competition = await eventToOutlast("wca-time", "ParisOpen2026/333", async (competitionId) => {
    asked.push(competitionId);
    return "2026-11-08";
  });
  assert.deepEqual(asked, ["ParisOpen2026"]);
  assert.deepEqual(competition, { what: "competition", readableAtMs: competitionReadableAtMs("2026-11-08") });
  // Nothing to outlast for a gift that names no event.
  assert.equal(await eventToOutlast("coursera-certificate", "machine-learning", noWca), null);
  assert.equal(await eventToOutlast("marathon-finish", undefined, noWca), null);
  assert.equal(endsBeforeTheEvent("race"), "This gift would end before the race's result can be read, so it could never pay. Choose a longer one. Nothing was taken.");
  const route = readFileSync("app/api/gift/certificate/create/route.ts", "utf8");
  assert.match(route, /if \(event && !outlastsTheEvent\(durationDays, event\.readableAtMs, Date\.now\(\)\)\) throw new GiftApiError\("INVALID_DURATION", endsBeforeTheEvent\(event\.what\)\);/);
  assert.ok(route.indexOf("outlastsTheEvent(durationDays") < route.indexOf("makeMilestoneGift("), "refused before the gift is made");
});
