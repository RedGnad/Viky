import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { conditionById, liveConditions } from "../src/conditions";
import { MOTION } from "../src/design-tokens";
import { landingGoals, nextGoal, racePhrases } from "../src/landing-goals";
import { racesOffered } from "../src/marathon";
import { UNIVERSITIES } from "../src/universities";

/**
 * What a gift can wait for, going by under the landing's card (D285, widened by D286): many phrases, every one true
 * today and from the register that makes it true, each race named for what it is, and the next drawn at random.
 */

const NOW = Date.parse("2026-09-27T12:00:00Z");

test("three kinds: every school, every live goal read where it happens, every distance of every race still offered", () => {
  const { first, kinds } = landingGoals(NOW, () => 0.3);
  const [schools, goals, races] = kinds;
  assert.deepEqual(schools.toSorted(), UNIVERSITIES.map((school) => `a certificate from ${school.name}`).toSorted());
  const duolingo = conditionById("duolingo-daily")!;
  assert.ok(goals.includes(duolingo.name.charAt(0).toLowerCase() + duolingo.name.slice(1)), "a goal in the register's own words");
  assert.ok(goals.includes(`a rating on ${conditionById("codeforces-rating")!.source}`), "a goal said from its source when its name is not a thing to wait for");
  const shown = liveConditions().filter((goal) => goal.nature === "shown");
  for (const goal of shown) assert.ok(!goals.some((phrase) => phrase.includes(goal.name.toLowerCase())), `${goal.id} is shown, not read`);
  const expected = racesOffered(NOW, false).reduce((count, race) => count + race.events.length, 0);
  assert.equal(races.length, expected, "one phrase per distance");
  assert.ok(kinds.flat().includes(first));
  assert.equal(new Set(kinds.flat()).size, kinds.flat().length, "each once");
});

test("a race is named for what it is: a marathon, a half marathon, a 10 km trail or a 10 km run", () => {
  const race = (name: string, town: string, ...events: [string, string][]) => ({ name, town, events: events.map(([distance, label]) => ({ distance, label })) });
  assert.deepEqual(racePhrases(race("Bank of America Chicago Marathon 2026", "Chicago", ["marathon", "Marathon"])), ["a finish at the Chicago Marathon"]);
  assert.deepEqual(racePhrases(race("Wase Marathon 2026", "Sinaai", ["half", "Halve Marathon"], ["marathon", "Marathon"])), ["a half marathon at the Wase Marathon", "a finish at the Wase Marathon"]);
  assert.deepEqual(racePhrases(race("Maratona di Reggio Emilia 2026", "Reggio Emilia", ["marathon", "Maratona"])), ["a marathon at Maratona di Reggio Emilia"]);
  assert.deepEqual(racePhrases(race("Trail du Loup Vert 2026", "Jumièges", ["10k", "10km"])), ["a 10 km trail at Trail du Loup Vert"]);
  assert.deepEqual(racePhrases(race("Somewhere 2026", "Town", ["10k", "Trail 10 km"])), ["a 10 km trail at Somewhere"]);
  assert.deepEqual(racePhrases(race("Voie Royale 2026", "Saint-Denis", ["10k", "10km"])), ["a 10 km run at Voie Royale"]);
});

test("a race that has started is no longer said", () => {
  const later = Date.parse("2027-06-01T00:00:00Z");
  assert.ok(!landingGoals(later).kinds.flat().some((item) => item.includes("Boston Marathon")));
});

test("the next phrase is drawn at random, never the kind just said when there is another, never one of the last few", () => {
  const kinds = [["s1", "s2", "s3", "s4", "s5"], ["g1", "g2", "g3", "g4", "g5"], ["r1", "r2", "r3", "r4", "r5"]];
  const recent = ["s1"];
  for (let draw = 0; draw < 200; draw++) {
    const next = nextGoal(kinds, recent.slice(-4));
    assert.ok(!recent.slice(-4).includes(next), `${next} was said just before`);
    assert.notEqual(next[0], recent[recent.length - 1][0], "another kind than the last");
    recent.push(next);
  }
  // Two runs from the same start do not follow the same cycle.
  const run = () => {
    const said = ["s1"];
    for (let draw = 0; draw < 12; draw++) said.push(nextGoal(kinds, said.slice(-4)));
    return said.join(",");
  };
  assert.ok(new Set([run(), run(), run(), run(), run()]).size > 1);
});

test("drawn by the server, held long enough to read, and still whenever nobody can see it", () => {
  assert.match(readFileSync("app/page.tsx", "utf8"), /goals=\{landingGoals\(\)\}/);
  const going = readFileSync("app/kit/GoalsGoingBy.tsx", "utf8");
  assert.match(going, /reduced\(\)/, "reduced motion keeps the first phrase");
  assert.match(going, /IntersectionObserver/, "off the screen, it waits");
  assert.match(going, /document\.hidden/, "a tab behind, it waits");
  assert.match(going, /nextGoal\(kinds, recent\.current\)/, "the next is drawn at random");
  assert.match(going, /className="invisible col-start-1 row-start-1"/, "the room is the longest phrase's own");
  assert.ok(MOTION.rotate.holdMs >= 2500, "long enough to read");
});
