import { liveConditions } from "./conditions";
import { racesOffered } from "./marathon";
import { pickUniversities } from "./universities";

/**
 * What a gift can wait for, one thing at a time in the sentence under the landing's card (D285, widened by D286: many
 * phrases, drawn at random). Every item is true of what Viky reads today, and comes from the register that makes it
 * true, never from a name written here:
 * - a school: a certificate from one of its courses, while both certificate lines are live (`pickUniversities`, D225);
 * - a live goal of the register that is read where it happens (not the "shown" ones), in its own words;
 * - every race still offered, one phrase per distance it offers, saying what it is (`racePhrases`).
 * Three kinds, so the many races do not drown the rest: the sentence draws a kind, then an item of it.
 */
export type LandingGoals = Readonly<{ first: string; kinds: readonly (readonly string[])[] }>;

/** A name from the register, as it reads inside a sentence: its first letter small ("A chess rating" to "a chess rating"). */
const inSentence = (name: string) => name.charAt(0).toLowerCase() + name.slice(1);

/** Goals whose register name is not a thing a gift waits for ("Reach a ... rating"), said from the register's source. */
const SAID_OTHERWISE: Readonly<Record<string, (source: string) => string>> = {
  "codeforces-rating": (source) => `a rating on ${source}`,
  "fitbit-daily": (source) => `active minutes each day, on ${source}`,
};
/** Said by the races themselves, one phrase each. */
const SAID_BY_RACES = new Set(["marathon-finish"]);

/** A race as a runner names it: without the year, "the Chicago Marathon" for the sponsor's long name, "the" before a "... Marathon". */
function raceRef(race: Readonly<{ name: string; town: string }>): string {
  const withoutYear = race.name.replace(/\s+\d{4}$/, "");
  if (withoutYear.endsWith(`${race.town} Marathon`)) return `the ${race.town} Marathon`;
  return /Marathon$/.test(withoutYear) ? `the ${withoutYear}` : withoutYear;
}

/**
 * One phrase per distance a race offers, saying what it is (the founder, 27 Sep 2026: a half marathon or a trail is
 * named as such): "a finish at the Chicago Marathon", "a marathon at Maratona di Reggio Emilia", "a half marathon at
 * Tout Rennes Court", "a 10 km trail at Trail de la Ria d'Etel", "a 10 km run at Voie Royale". A trail is one the race
 * or its event calls a trail, as the timing company prints it.
 */
export function racePhrases(race: Readonly<{ name: string; town: string; events: readonly { distance: string; label: string }[] }>): readonly string[] {
  const ref = raceRef(race);
  return race.events.map((event) => {
    if (event.distance === "marathon") return ref.endsWith("Marathon") ? `a finish at ${ref}` : `a marathon at ${ref}`;
    if (event.distance === "half") return `a half marathon at ${ref}`;
    const trail = /trail/i.test(race.name) || /trail/i.test(event.label);
    return `a 10 km ${trail ? "trail" : "run"} at ${ref}`;
  });
}

export function landingGoals(nowMs: number = Date.now(), random: () => number = Math.random): LandingGoals {
  const schools = pickUniversities(random).map((name) => `a certificate from ${name}`);
  const goals = liveConditions()
    .filter((goal) => goal.nature !== "shown" && !SAID_BY_RACES.has(goal.id))
    .map((goal) => SAID_OTHERWISE[goal.id]?.(goal.source) ?? inSentence(goal.name));
  const races = [...new Set(racesOffered(nowMs, false).flatMap(racePhrases))];
  const kinds = [schools, goals, races].filter((kind) => kind.length > 0);
  if (kinds.length === 0) return { first: "", kinds };
  const kind = kinds[Math.floor(random() * kinds.length)];
  return { first: kind[Math.floor(random() * kind.length)], kinds };
}

/**
 * The next item, at random: a kind other than the one just said when there is another, then an item of it that was not
 * said in the last few, so the sentence never runs the same cycle twice and never repeats itself soon.
 */
export function nextGoal(kinds: readonly (readonly string[])[], recent: readonly string[], random: () => number = Math.random): string {
  const last = recent[recent.length - 1];
  const kindOfLast = kinds.findIndex((kind) => kind.includes(last));
  const others = kinds.filter((kind, index) => index !== kindOfLast && kind.length > 0);
  const from = others.length > 0 ? others : kinds;
  const kind = from[Math.floor(random() * from.length)];
  const fresh = kind.filter((item) => !recent.includes(item));
  const pool = fresh.length > 0 ? fresh : kind.filter((item) => item !== last);
  return (pool.length > 0 ? pool : kind)[Math.floor(random() * (pool.length > 0 ? pool.length : kind.length))];
}
