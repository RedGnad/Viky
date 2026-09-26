import { conditionById } from "./conditions";
import { racesOffered } from "./marathon";
import { pickUniversities } from "./universities";

/**
 * What a gift can wait for, one at a time in the sentence under the landing's card (D285, the founder, 27 Sep 2026:
 * bigger, the schools going by in the sentence, and sometimes something else than a certificate). Every item is true
 * of what Viky reads today, and each comes from the register that makes it true, never from a word written here:
 * - a school: a certificate from one of its courses, while both certificate lines are live (`pickUniversities`, D225);
 * - a goal of the register, by its own name, while it is live;
 * - a marathon of the register of races that is still offered, named as runners name it ("the Chicago Marathon"),
 *   and only when the race's own name says so, so that no race is ever given a name it does not carry.
 * Drawn by the server once per request, so the first image and the browser's take-over show the same first item.
 */
const GOALS_SHOWN = ["duolingo-daily", "chess-rating", "strava-daily", "mitx-online-certificate", "duolingo-english-test", "wca-time"] as const;

/** A name from the register, as it reads inside a sentence: its first letter small ("A chess rating" to "a chess rating"). */
const inSentence = (name: string) => name.charAt(0).toLowerCase() + name.slice(1);

export function landingGoals(nowMs: number = Date.now(), random: () => number = Math.random): readonly string[] {
  const schools = pickUniversities(random).map((name) => `a certificate from ${name}`);
  const goals = GOALS_SHOWN.map((id) => conditionById(id)).filter((goal) => goal?.live === true).map((goal) => inSentence(goal!.name));
  const races = racesOffered(nowMs, false)
    .filter((race) => race.events.some((event) => event.distance === "marathon") && race.name.includes(`${race.town} Marathon`))
    .map((race) => `a finish at the ${race.town} Marathon`);
  const others = [...goals, ...races];
  // Shuffled by the same random, then a school and something else in turn, so the sentence changes kind as it goes.
  for (let at = others.length - 1; at > 0; at--) {
    const to = Math.floor(random() * (at + 1));
    [others[at], others[to]] = [others[to], others[at]];
  }
  const said: string[] = [];
  for (let at = 0; at < Math.max(schools.length, others.length); at++) {
    if (schools[at]) said.push(schools[at]);
    if (others[at]) said.push(others[at]);
  }
  return said;
}
