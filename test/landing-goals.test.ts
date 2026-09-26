import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { conditionById } from "../src/conditions";
import { MOTION } from "../src/design-tokens";
import { landingGoals } from "../src/landing-goals";
import { racesOffered } from "../src/marathon";
import { UNIVERSITIES } from "../src/universities";

/**
 * What a gift can wait for, going by under the landing's card (D285): every item true today, from the register that
 * makes it true, a school and something else in turn, drawn by the server, and the movement stopping when nobody sees it.
 */

const NOW = Date.parse("2026-09-27T12:00:00Z");

test("every school, every live goal shown, and every marathon still offered, each once", () => {
  const said = landingGoals(NOW, () => 0.3);
  for (const school of UNIVERSITIES) assert.ok(said.includes(`a certificate from ${school.name}`), school.name);
  const duolingo = conditionById("duolingo-daily")!;
  assert.ok(said.includes(duolingo.name.charAt(0).toLowerCase() + duolingo.name.slice(1)), "a goal in the register's own words");
  const marathons = racesOffered(NOW, false).filter((race) => race.name.includes(`${race.town} Marathon`));
  assert.ok(marathons.length > 0);
  for (const race of marathons) assert.ok(said.includes(`a finish at the ${race.town} Marathon`), race.name);
  assert.equal(new Set(said).size, said.length, "each once");
  // No race is named by a name it does not carry: a marathon whose own name is not "<town> Marathon" is left out.
  assert.ok(!said.some((item) => item.includes("Rennes Marathon")));
});

test("a school and something else in turn, so the sentence changes kind as it goes", () => {
  const said = landingGoals(NOW, () => 0.7);
  assert.match(said[0], /^a certificate from /);
  assert.doesNotMatch(said[1], /^a certificate from /);
  assert.match(said[2], /^a certificate from /);
});

test("a race that has started is no longer said", () => {
  const later = Date.parse("2027-06-01T00:00:00Z");
  assert.ok(!landingGoals(later).some((item) => item.includes("Boston Marathon")));
});

test("drawn by the server, held long enough to read, and still whenever nobody can see it", () => {
  assert.match(readFileSync("app/page.tsx", "utf8"), /goals=\{landingGoals\(\)\}/);
  const going = readFileSync("app/kit/GoalsGoingBy.tsx", "utf8");
  assert.match(going, /reduced\(\)/, "reduced motion keeps the first item");
  assert.match(going, /IntersectionObserver/, "off the screen, it waits");
  assert.match(going, /document\.hidden/, "a tab behind, it waits");
  assert.match(going, /className="sr-only"/, "a reader hears the whole sentence once");
  assert.ok(MOTION.rotate.holdMs >= 2500, "long enough to read");
});
