import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { conditionById, liveConditions } from "../src/conditions";
import { MOTION } from "../src/design-tokens";
import { ADDED_PORTALS, DIRECTORY_PORTALS } from "../src/directory-portals";
import { landingGoals, nextGoal, racePhrases, townSaid, UNIVERSITIES_SAID } from "../src/landing-goals";
import { racesOffered } from "../src/marathon";
import { UNIVERSITIES } from "../src/universities";

/**
 * What a gift can wait for, going by under the landing's card (D285, widened by D286): many phrases, every one true
 * today and from the register that makes it true, each race named for what it is, and the next drawn at random.
 */

const NOW = Date.parse("2026-09-27T12:00:00Z");

test("groups: every school, every live goal as its group says it, every race still offered", () => {
  const { first, kinds } = landingGoals(NOW, () => 0.3);
  const schools = kinds[0];
  const races = kinds[kinds.length - 1];
  const goals = kinds.slice(1, -1).flat();
  assert.deepEqual(schools.toSorted(), UNIVERSITIES.map((school) => `a certificate from ${school.name}`).toSorted());
  const duolingo = conditionById("duolingo-daily")!;
  assert.ok(goals.includes(duolingo.name.charAt(0).toLowerCase() + duolingo.name.slice(1)), "a goal in the register's own words");
  assert.ok(goals.includes(`a rating on ${conditionById("codeforces-rating")!.source}`), "a goal said from its source when its name is not a thing to wait for");
  // The founder's list of 29 Sep 2026: the chess modes, the university's own grades and enrolment, the Rubik's Cube.
  for (const phrase of ["a rapid rating on Chess.com", "a blitz rating on Chess.com", "a bullet rating on Chess.com", "a daily chess rating on Chess.com", "a grade at Harvard", "the year passed at Sapienza", "an enrolment at the Université de Toulouse", "a Rubik's Cube time at a WCA competition", "a TOEFL score", "an edX certificate from Harvard, MIT and more"]) {
    assert.ok(goals.includes(phrase), phrase);
  }
  assert.ok(kinds.every((kind) => kind.length > 0), "no empty group is drawn");
  assert.ok(!goals.some((phrase) => / at university$/.test(phrase)), "universities by name, not the word");
  assert.deepEqual(races, [...new Set(racesOffered(NOW, false).flatMap(racePhrases))], "every race still offered, as it is said");
  assert.ok(kinds.flat().includes(first));
  assert.equal(new Set(kinds.flat()).size, kinds.flat().length, "each once");
});

test("every university named is one a funder can choose, and each sense is said", () => {
  const listed = new Set<string>([
    ...(JSON.parse(readFileSync("data/university-register.json", "utf8")) as { rows: { university: string }[] }).rows.map((row) => row.university),
    ...DIRECTORY_PORTALS.map((portal) => portal.university),
    ...ADDED_PORTALS.map((portal) => portal.university),
  ]);
  for (const one of UNIVERSITIES_SAID) assert.ok(listed.has(one.registered), `${one.registered} is not in the list a funder chooses from`);
  assert.equal(new Set(UNIVERSITIES_SAID.map((one) => one.said)).size, UNIVERSITIES_SAID.length, "each once");
  for (const sense of ["enrolment", "year", "grade"]) assert.ok(UNIVERSITIES_SAID.some((one) => one.sense === sense), sense);
});

test("a race is said by its distance and its town, never by its own name (the founder, 5 Oct 2026)", () => {
  const race = (name: string, town: string, ...events: [string, string][]) => ({ name, town, events: events.map(([distance, label]) => ({ distance, label })) });
  // His own example, and each distance a race offers as one phrase.
  assert.deepEqual(racePhrases(race("Haspa Marathon Hamburg 2026", "Hamburg", ["half", "Halbmarathon"])), ["the half marathon in Hamburg"]);
  assert.deepEqual(racePhrases(race("Bank of America Chicago Marathon 2026", "Chicago", ["marathon", "Marathon"])), ["the marathon in Chicago"]);
  assert.deepEqual(racePhrases(race("Mansfield Marathon 2026", "Mansfield", ["marathon", "Marathon"], ["half", "Half"], ["10k", "10km"])), ["the marathon in Mansfield", "the half marathon in Mansfield", "a 10 km race in Mansfield"]);
  // A 10 km is a trail where the organiser or the race's own name calls it one.
  assert.deepEqual(racePhrases(race("Trail du Loup Vert 2026", "Jumièges", ["10k", "10km"])), ["a 10 km trail in Jumièges"]);
  assert.deepEqual(racePhrases(race("Somewhere 2026", "Sablé-sur-Sarthe", ["10k", "Trail 10 km"])), ["a 10 km trail in Sablé-sur-Sarthe"]);
  assert.deepEqual(racePhrases(race("Voie Royale 2026", "Saint-Denis", ["10k", "10km"])), ["a 10 km race in Saint-Denis"]);
  // The town as it reads in a sentence: a province in brackets is dropped, and what is not a town's name is not said.
  assert.equal(townSaid("Reggio Emilia (RE)"), "Reggio Emilia");
  assert.equal(townSaid("Feldkirchen in Kärnten"), "Feldkirchen in Kärnten");
  assert.equal(townSaid("St. Gallen"), "St. Gallen");
  for (const notATown of ["19. Kristallmarathon", "Standalone Farm. Letchworth Garden City.", "Moosen/Riedering", "Wettringen - Haddorf", "St. Laurence's 5k & 10k Fun Run", ""]) {
    assert.equal(townSaid(notATown), null, notATown);
    assert.deepEqual(racePhrases(race("A race 2026", notATown, ["marathon", "Marathon"])), [], `${notATown}: not said on the landing, still in the chooser`);
  }
  // No phrase of the landing is a race's own name any more, and none is long enough for three lines on a phone.
  const said = landingGoals(NOW).kinds.at(-1)!;
  assert.ok(said.length > 10, "the races are still said");
  for (const phrase of said) assert.match(phrase, /^(the marathon|the half marathon|a 10 km race|a 10 km trail) in \p{L}/u, phrase);
  for (const phrase of landingGoals(NOW).kinds.flat()) assert.ok(phrase.length <= 52, `${phrase} (${phrase.length})`);
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
