import { CHESS_MODES } from "./chess-com";
import { liveConditions, type Condition } from "./conditions";
import { racesOffered } from "./marathon";
import { pickUniversities } from "./universities";
import { WCA_EVENTS, wcaEventIsTimed } from "./wca";

/**
 * What a gift can wait for, one thing at a time in the sentence under the landing's card (D285, widened by D286: many
 * phrases, drawn at random). Every item is true of what Viky reads today, and comes from the register that makes it
 * true, never from a name written here:
 * - a school: a certificate from one of its courses, while both certificate lines are live (`pickUniversities`, D225);
 * - every live goal of the register, said as `SAID` says it and grouped as it groups it: university, tests, courses,
 *   games, the cube, every day (the founder, 29 Sep 2026: the chess modes, grades and enrolment at universities named
 *   one by one, the Rubik's Cube rather than the WCA alone);
 * - every race still offered, one phrase per distance it offers, by its distance and its town (`racePhrases`).
 * The sentence draws a group, then an item of it, so the many races do not drown the rest.
 */
export type LandingGoals = Readonly<{ first: string; kinds: readonly (readonly string[])[] }>;

/** A name from the register, as it reads inside a sentence: its first letter small ("A chess rating" to "a chess rating"). */
const inSentence = (name: string) => name.charAt(0).toLowerCase() + name.slice(1);

/**
 * The groups the sentence draws from, so no one of them drowns the rest (the founder, 29 Sep 2026: "a certificate from"
 * and the races were all anybody saw). A live goal not written in `SAID` is said by its register name among the others.
 */
type Group = "university" | "tests" | "courses" | "games" | "cube" | "everyDay" | "others";
const GROUPS: readonly Group[] = ["university", "tests", "courses", "games", "cube", "everyDay", "others"];

/** The events the WCA times, said as a cuber says them: the 3x3x3 Cube is the Rubik's Cube. */
const CUBE_SAID: Readonly<Record<string, string>> = {
  "333": "a Rubik's Cube time",
  "333oh": "a one-handed Rubik's Cube time",
  "333bf": "a blindfolded Rubik's Cube time",
  "222": "a 2x2 cube time",
  "444": "a 4x4 cube time",
  minx: "a Megaminx time",
  pyram: "a Pyraminx time",
  skewb: "a Skewb time",
  sq1: "a Square-1 time",
};

/**
 * Universities by name for the three university goals, since names going by say more than "university" does (the
 * founder, 29 Sep 2026, knowing that most portals have not been shown to Viky by a student yet). Each is one a funder
 * can choose in "Which university?": its `registered` name is the list's own (data/university-register.json, or a
 * portal written by hand in src/directory-portals.ts), which a test holds. Said as a student says it after "at". The
 * two with an enrolment provider (D267, D313) are said with enrolment; the others share the three senses in turn.
 */
export const UNIVERSITIES_SAID: readonly Readonly<{ said: string; registered: string; sense: "enrolment" | "year" | "grade" }>[] = [
  { said: "the Université de Toulouse", registered: "Université de Toulouse (Paul Sabatier)", sense: "enrolment" },
  { said: "the American University of Rome", registered: "The American University of Rome", sense: "enrolment" },
  { said: "Harvard", registered: "Harvard University", sense: "grade" },
  { said: "Stanford", registered: "Stanford University", sense: "year" },
  { said: "MIT", registered: "Massachusetts Institute of Technology", sense: "grade" },
  { said: "Cambridge", registered: "University of Cambridge", sense: "year" },
  { said: "Yale", registered: "Yale University", sense: "enrolment" },
  { said: "Princeton", registered: "Princeton University", sense: "grade" },
  { said: "Berkeley", registered: "University of California, Berkeley", sense: "year" },
  { said: "Imperial", registered: "Imperial College London", sense: "grade" },
  { said: "EPFL", registered: "EPFL - EPF Lausanne", sense: "year" },
  { said: "McGill", registered: "McGill University", sense: "enrolment" },
  { said: "the University of Toronto", registered: "University of Toronto", sense: "grade" },
  { said: "Panthéon-Sorbonne", registered: "Paris 1 Panthéon-Sorbonne University", sense: "year" },
  { said: "Paris-Saclay", registered: "Paris-Saclay University", sense: "grade" },
  { said: "Sciences Po", registered: "Sciences Po Paris", sense: "enrolment" },
  { said: "Toulouse Capitole", registered: "Toulouse I Capitole University", sense: "grade" },
  { said: "Sapienza", registered: "Sapienza Università di Roma", sense: "year" },
  { said: "the University of Bologna", registered: "University of Bologna", sense: "grade" },
  { said: "the University of Barcelona", registered: "University of Barcelona", sense: "year" },
  { said: "Heidelberg", registered: "Universität Heidelberg", sense: "grade" },
  { said: "the University of Amsterdam", registered: "University of Amsterdam", sense: "enrolment" },
  { said: "KU Leuven", registered: "Katholieke Universiteit Leuven", sense: "year" },
  { said: "the University of Tokyo", registered: "The University of Tokyo", sense: "grade" },
  { said: "NUS", registered: "National University of Singapore (NUS)", sense: "year" },
  { said: "the University of Melbourne", registered: "University of Melbourne", sense: "grade" },
  { said: "Cheikh Anta Diop University", registered: "Cheikh Anta Diop University of Dakar", sense: "year" },
  { said: "the University of Cape Town", registered: "University of Cape Town", sense: "grade" },
  { said: "the University of Nairobi", registered: "University of Nairobi", sense: "enrolment" },
];

/** Which university goal each sense belongs to, so a sense is said only while its goal is live. */
const SENSE_GOAL = { enrolment: "university-enrollment-shown", year: "university-year-passed-shown", grade: "university-grade-shown" } as const;
const SENSE_SAID = { enrolment: (at: string) => `an enrolment at ${at}`, year: (at: string) => `the year passed at ${at}`, grade: (at: string) => `a grade at ${at}` } as const;
const universitySaid = (sense: keyof typeof SENSE_GOAL) => () => UNIVERSITIES_SAID.filter((one) => one.sense === sense).map((one) => SENSE_SAID[sense](one.said));

/** How each goal is said, and in which group: every phrase is a thing the goal's own register makes a gift wait for. */
const SAID: Readonly<Record<string, Readonly<{ group: Group; phrases: (goal: Condition) => readonly string[] }>>> = {
  [SENSE_GOAL.enrolment]: { group: "university", phrases: universitySaid("enrolment") },
  [SENSE_GOAL.year]: { group: "university", phrases: universitySaid("year") },
  [SENSE_GOAL.grade]: { group: "university", phrases: universitySaid("grade") },
  "toefl-mybest-shown": { group: "tests", phrases: () => ["a TOEFL score"] },
  "duolingo-english-test": { group: "tests", phrases: (goal) => [inSentence(goal.name)] },
  "edx-certificate": { group: "courses", phrases: () => ["an edX certificate from Harvard, MIT and more"] },
  "mitx-online-certificate": { group: "courses", phrases: (goal) => [inSentence(goal.name)] },
  "coursera-certificate": { group: "courses", phrases: (goal) => [inSentence(goal.name)] },
  "credly-badge": { group: "courses", phrases: (goal) => [inSentence(goal.name)] },
  "accredible-credential": { group: "courses", phrases: (goal) => [inSentence(goal.name)] },
  // One phrase per mode a chess gift is made on (src/chess-com.ts), since a rapid player and a blitz player are two people.
  "chess-rating": { group: "games", phrases: (goal) => CHESS_MODES.map((mode) => `a ${mode === "daily" ? "daily chess" : mode} rating on ${goal.source}`) },
  "chess-tactics": { group: "games", phrases: (goal) => [inSentence(goal.name)] },
  "codeforces-rating": { group: "games", phrases: (goal) => [`a rating on ${goal.source}`] },
  "wca-time": { group: "cube", phrases: () => Object.keys(CUBE_SAID).filter((event) => event in WCA_EVENTS && wcaEventIsTimed(event)).map((event) => `${CUBE_SAID[event]} at a WCA competition`) },
  "duolingo-daily": { group: "everyDay", phrases: (goal) => [inSentence(goal.name)] },
  "fitbit-daily": { group: "everyDay", phrases: (goal) => [`active minutes each day, on ${goal.source}`] },
  "strava-daily": { group: "everyDay", phrases: (goal) => [inSentence(goal.name)] },
};

/** Said by the races themselves, one phrase each. */
const SAID_BY_RACES = new Set(["marathon-finish"]);

/**
 * The town a race is run in, as it reads in a sentence, or nothing when the register's field is not a town's name. The
 * timing companies' lists put other things there now and then: the event's own name ("19. Kristallmarathon"), an
 * address ("Standalone Farm. Letchworth Garden City."), two places at once ("Moosen/Riedering", "Wettringen -
 * Haddorf"). A province in brackets is dropped ("Reggio Emilia (RE)").
 */
export function townSaid(town: string): string | null {
  const name = town.replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (name.length < 2 || name.length > 28) return null;
  // Letters in any alphabet, with the marks a town's name carries: a space, a hyphen, an apostrophe, "St." for a saint.
  if (!/^(?:St\. )?\p{L}+(?:[ '’-]\p{L}+)*$/u.test(name)) return null;
  if (/marat|\brun\b|\brace\b|\bfarm\b/i.test(name)) return null;
  return name;
}

/**
 * A race on the landing is said by its distance and its town (the founder, 5 Oct 2026: "the half marathon in
 * Hamburg"), not by its own name: a name ran to three lines on a phone, and the cell that keeps the room of the
 * longest phrase left a hole under every shorter one. A gift on a race waits for a finish at the distance the funder
 * chose, whatever the time, so each distance a race offers is one phrase; a 10 km is said as a trail where the
 * organiser calls it one. A race whose town the register does not name is not said here, and stays in the chooser.
 */
export function racePhrases(race: Readonly<{ name: string; town: string; events: readonly { distance: string; label: string }[] }>): readonly string[] {
  const town = townSaid(race.town);
  if (!town) return [];
  const phrases: string[] = [];
  for (const event of race.events) {
    if (event.distance === "marathon") phrases.push(`the marathon in ${town}`);
    else if (event.distance === "half") phrases.push(`the half marathon in ${town}`);
    else phrases.push(/trail/i.test(`${event.label} ${race.name}`) ? `a 10 km trail in ${town}` : `a 10 km race in ${town}`);
  }
  return phrases;
}

export function landingGoals(nowMs: number = Date.now(), random: () => number = Math.random): LandingGoals {
  const schools = pickUniversities(random).map((name) => `a certificate from ${name}`);
  const grouped = new Map<Group, string[]>(GROUPS.map((group) => [group, []]));
  for (const goal of liveConditions()) {
    if (SAID_BY_RACES.has(goal.id)) continue;
    const said = SAID[goal.id];
    grouped.get(said?.group ?? "others")!.push(...(said ? said.phrases(goal) : [inSentence(goal.name)]));
  }
  const races = [...new Set(racesOffered(nowMs, false).flatMap(racePhrases))];
  const kinds = [schools, ...GROUPS.map((group) => grouped.get(group)!), races].filter((kind) => kind.length > 0);
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
