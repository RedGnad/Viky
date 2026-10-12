import type { Condition } from "./conditions";

/**
 * The three ways a condition is read, as the judges page draws them at the head of "What each condition proves" (the
 * founder's preview of 12 Oct 2026): a public page or API read under attestation, the person's own account shown by
 * them, an account the person connects. They are the register's three natures (`read`, `shown`, `connected`), each
 * with the words a card says of it. What was paid, and how many proofs each line has, is never written here: the card
 * counts it from the rows as the page is served (app/judges/JudgesConditions.tsx).
 *
 * A card counts the lines offered today, so the three add up to the number every other page says (seventeen on
 * 12 Oct 2026). A line its source closed is not counted and is not in what the way holds: its card names it apart,
 * closed, with the register's own reason.
 */
export type WayOfReading = Readonly<{
  nature: Condition["nature"];
  title: string;
  /** What the way holds today, in one line of plain names: the lines offered, never one its source closed. */
  what: string;
  /** A condition's short name in the card's sentence, by its id. */
  short: Readonly<Record<string, string>>;
  /** What the open line of an account connected takes, where that is worth a sentence. */
  takes?: string;
}>;

const WAYS: readonly WayOfReading[] = [
  {
    nature: "read",
    title: "A public page or API, read under attestation",
    what: "A Duolingo lesson a day, a Chess.com rating and puzzle record, a Codeforces rating, Credly, Accredible, the Duolingo English Test, edX, MIT and Coursera certificates, a cube result, a race finish.",
    short: {
      "duolingo-daily": "Duolingo",
      "chess-rating": "the Chess.com rating",
      "chess-tactics": "the Chess.com puzzle record",
      "codeforces-rating": "Codeforces",
      "credly-badge": "Credly",
      "accredible-credential": "Accredible",
      "duolingo-english-test": "the Duolingo English Test",
      "edx-certificate": "edX",
      "mitx-online-certificate": "MIT",
      "coursera-certificate": "Coursera",
      "wca-time": "a cube result",
      "marathon-finish": "a race finish",
    },
  },
  {
    nature: "shown",
    title: "The person's own account, shown by them",
    what: "Enrolled at university, the year passed, a grade reached, a TOEFL score.",
    short: {
      "university-enrollment-shown": "enrolment",
      "university-year-passed-shown": "the year passed",
      "university-grade-shown": "a grade",
      "toefl-mybest-shown": "a TOEFL score",
    },
  },
  {
    nature: "connected",
    title: "An account the person connects",
    what: "Active minutes on Fitbit.",
    short: { "fitbit-daily": "Fitbit", "strava-daily": "Strava" },
    takes: "Fitbit takes a Fitbit tracker or a Pixel Watch.",
  },
];

export function waysOfReading(): readonly WayOfReading[] {
  return WAYS;
}

/**
 * The public lines whose real page was read under attestation without a gift, on the founder's word, on 12 Oct 2026:
 * one attested read of each source that had never passed a real one, asked of production's own reading service. Every
 * one of them gave a proof (the readings are counted with October's cycle, `OUTSIDE_THE_JOURNAL` in
 * src/attested-calls.ts). A line is said "read with no gift yet" only while it has no real proof of its own.
 */
export const READ_WITHOUT_A_GIFT: Readonly<{ on: string; conditions: readonly string[] }> = {
  on: "12 Oct 2026",
  conditions: ["codeforces-rating", "chess-tactics", "wca-time", "duolingo-english-test", "coursera-certificate", "edx-certificate", "mitx-online-certificate", "credly-badge", "accredible-credential", "marathon-finish"],
};

/** "one, two and three", for a list said in a sentence. */
const listed = (words: readonly string[]) => (words.length <= 1 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`);
const proofsInWords = (count: number) => (count === 1 ? "1 real proof" : `${count} real proofs`);

export type WaySaid = Readonly<{
  /** How many lines offered today are read this way: a line its source closed is not one of them. */
  conditions: number;
  /** The words a card sets in bold, and what it says after them; nothing when the count of proofs was not read. */
  lead: string | null;
  said: string;
}>;

/**
 * What a card says of a way of reading, from the register and from the count of real proofs as the page is served: what
 * was paid with real money, what was read, and why the rest waits. No figure is written here: a line is named as paid
 * only while it has a proof, and the dated facts are the repository's own (the pass at Toulouse, the readings of 12 Oct
 * 2026). When the count cannot be read the card says so and names nothing as paid. A line its source closed is named
 * closed with its reason in both cases: that is the register's, and needs no count.
 */
export function saidOfAWay(
  way: WayOfReading,
  lines: readonly Pick<Condition, "id" | "name" | "source" | "live" | "state" | "beforeItOpens">[],
  counts: ReadonlyMap<string, number> | null,
  toulouse: Readonly<{ firstDay: string; nextDay: string; secondsFromSignIn: number }>,
): WaySaid {
  const offered = lines.filter((line) => line.live);
  // A line its source closed says why, in the register's own line, with the source's name said once.
  const closed = lines.filter((line) => line.state === "closed").map((line) => `${line.source} is closed: ${(line.beforeItOpens ?? "").replace(/\.$/, "").replace(new RegExp(`^${line.source}'s`), "its")}.`);
  if (counts === null) return { conditions: offered.length, lead: null, said: ["The count of real proofs could not be read just now, so nothing is said here of what was paid.", ...closed].join(" ") };
  const proofs = (id: string) => counts.get(id) ?? 0;
  const short = (line: Pick<Condition, "id" | "name">) => way.short[line.id] ?? line.name;
  const paid = offered.filter((line) => proofs(line.id) > 0);
  const waiting = offered.filter((line) => proofs(line.id) === 0);
  const said: string[] = [];
  if (paid.length > 0) said.push(`${listed(paid.map((line) => `${short(line)}, ${proofsInWords(proofs(line.id))}`))}.`);
  if (way.nature === "read") {
    const read = waiting.filter((line) => READ_WITHOUT_A_GIFT.conditions.includes(line.id));
    if (read.length > 0) said.push(`${read.length === waiting.length ? `Each of the ${waiting.length} others` : `${read.length} of the ${waiting.length} others`} had its real page read under attestation on ${READ_WITHOUT_A_GIFT.on}, with no gift yet.`);
  }
  if (way.nature === "shown") {
    if (paid.some((line) => line.id === "university-enrollment-shown")) said.push(`The first enrolment was read by hand (Toulouse, ${toulouse.firstDay}) and the next was paid ${toulouse.secondsFromSignIn} seconds after sign-in (${toulouse.nextDay}).`);
    if (waiting.length > 0) said.push(`Nobody has shown one yet: ${listed(waiting.map(short))}.`);
  }
  if (way.nature === "connected" && way.takes) said.push(way.takes);
  said.push(...closed);
  const lead = paid.length > 0 ? "Paid with real money:" : way.nature === "connected" ? "Built, read on no real account yet." : way.nature === "shown" ? "Built, and nobody has shown one yet." : "Built, with no real proof yet.";
  return { conditions: offered.length, lead, said: said.join(" ") };
}
