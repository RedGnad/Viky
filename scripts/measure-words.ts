import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The three numbers a shortening pass is judged by, from what the screens actually said (`words.json`, written by
 * `pnpm review:capture-connected`).
 *
 * 1. **Words per screen**, outside what a person types. An input's value is never in `innerText`, so the count is the
 *    words of `main` as the browser lays it out: the prose, the labels, the buttons, the help.
 * 2. **Sentences on two screens or more.** A sentence repeated across screens is read twice and helps once (the
 *    structure's item 9 allows exactly one repetition, the gift card).
 * 3. **Screens per task**: how many states a person passes through to offer a gift, to open one, and to take money
 *    out.
 *
 * Usage: `pnpm measure:words review-captures/<folder>` and, to compare two runs,
 * `pnpm measure:words <after> --against <before>`.
 */

type Words = { journey: string; state: string; size: string; appearance: string; selects: number; path: string; text: string };

/**
 * Which screen a state is on. Eleven states of a gift's page are one screen, not eleven, and the rule about a
 * sentence read twice is about two screens: a gift number and a step's query string are not a different screen.
 */
export const screenOf = (row: Words): string => {
  const route = row.path.replace(/^\/g\/\d+/, "/g/[id]").replace(/\/$/, "") || "/";
  // A task that walks steps keeps one address, and the person still meets several screens: the screen says which one
  // it is ("Step 2 of 5", GOV.UK's caption), so the caption is what separates them. Steps 2 and 3 of the way out
  // stand on one screen, and the first caption on the screen is the one that names it.
  // Read whatever case the screen draws it in: the caption carries the meta voice, which is capitals (K, Ramp
  // section 2), and `innerText` gives back what the transform made of it.
  const step = /step (\d+) of (\d+)/i.exec(row.text.replace(/\n/g, " "));
  return step ? `${route} step ${step[1]}/${step[2]}` : route;
};

/** The tasks the founder measures, and the journeys of the capture run that make them up. */
const TASKS: ReadonlyArray<{ task: string; journeys: readonly string[] }> = [
  { task: "offering a gift", journeys: ["funder"] },
  { task: "opening a gift", journeys: ["recipient"] },
  { task: "taking money out", journeys: ["withdrawal"] },
];

const wordsOf = (text: string) => text.split(/\s+/).filter((word) => word.length > 0).length;

/** Sentences as a reader meets them, normalised so the same sentence on two screens is seen as the same one. */
export function sentencesOf(text: string): string[] {
  return text
    .split("\n")
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    // A sentence ends in a full stop. What does not is a title, a label or a button, and those are meant to repeat:
    // the mark is on every screen and "Continue" is the same word on five steps, which is the point of them.
    .filter((sentence) => /[.!?]$/.test(sentence) && sentence.split(/\s+/).length >= 4);
}

function read(folder: string): Words[] {
  const all = JSON.parse(readFileSync(resolve(folder, "words.json"), "utf8")) as Words[];
  return all.filter((row) => row.size === "390x844");
}

export type Measure = Readonly<{
  screens: number;
  /** Words on the screens of the three tasks and the home page: the journey, without the documents written for judges. */
  journeyWords: number;
  words: { total: number; median: number; most: Array<{ state: string; words: number }> };
  repeated: Array<{ sentence: string; screens: string[] }>;
  perTask: Array<{ task: string; screens: number; states: number }>;
}>;

export function measure(rows: Words[]): Measure {
  const screens = rows.map((row) => ({ name: `${row.journey}: ${row.state}`, screen: screenOf(row), words: wordsOf(row.text), text: row.text }));
  const counts = screens.map((screen) => screen.words).sort((a, b) => a - b);
  const median = counts.length === 0 ? 0 : counts[Math.floor(counts.length / 2)];

  // A sentence counts as repeated when two different screens say it, never when one screen says it in two states.
  const where = new Map<string, Set<string>>();
  for (const screen of screens) {
    for (const sentence of sentencesOf(screen.text)) {
      const seen = where.get(sentence) ?? new Set<string>();
      seen.add(screen.screen);
      where.set(sentence, seen);
    }
  }
  const repeated = [...where.entries()]
    .filter(([, seen]) => seen.size >= 2)
    .map(([sentence, seen]) => ({ sentence, screens: [...seen].sort() }))
    .sort((a, b) => b.screens.length - a.screens.length || a.sentence.localeCompare(b.sentence));

  const onTheJourney = new Set<string>([...TASKS.flatMap((task) => task.journeys), "home"]);
  return {
    screens: screens.length,
    journeyWords: rows.filter((row) => onTheJourney.has(row.journey)).reduce((sum, row) => sum + wordsOf(row.text), 0),
    words: {
      total: counts.reduce((sum, count) => sum + count, 0),
      median,
      most: [...screens].sort((a, b) => b.words - a.words).slice(0, 10).map((screen) => ({ state: screen.name, words: screen.words })),
    },
    repeated,
    perTask: TASKS.map((task) => ({
      task: task.task,
      screens: new Set(rows.filter((row) => task.journeys.includes(row.journey)).map(screenOf)).size,
      states: rows.filter((row) => task.journeys.includes(row.journey)).length,
    })),
  };
}

function report(now: Measure, before?: Measure): string {
  const change = (after: number, older: number | undefined) => (older === undefined ? "" : ` (was ${older})`);
  const lines = [
    `- Screens measured: ${now.screens}${change(now.screens, before?.screens)}`,
    `- Words a person reads, all screens: ${now.words.total}${change(now.words.total, before?.words.total)}`,
    `- Words on the journey itself, without the documents: ${now.journeyWords}${change(now.journeyWords, before?.journeyWords)}`,
    `- Words on the middle screen: ${now.words.median}${change(now.words.median, before?.words.median)}`,
    `- Sentences on two screens or more: ${now.repeated.length}${change(now.repeated.length, before?.repeated.length)}`,
    "",
    "| task | screens | states photographed |",
    "| --- | --- | --- |",
    ...now.perTask.map(
      (task) =>
        `| ${task.task} | ${task.screens}${change(task.screens, before?.perTask.find((older) => older.task === task.task)?.screens)} | ${task.states} |`,
    ),
    "",
    "| the heaviest screens | words |",
    "| --- | --- |",
    ...now.words.most.map((screen) => `| ${screen.state} | ${screen.words} |`),
    "",
    "| a sentence read on more than one screen | where |",
    "| --- | --- |",
    ...now.repeated.map((entry) => `| ${entry.sentence.replace(/\|/g, "\\|")} | ${entry.screens.join(" · ")} |`),
  ];
  return lines.join("\n");
}

function main() {
  const folder = process.argv[2];
  if (!folder) throw new Error("give the capture folder: pnpm measure:words review-captures/<folder>");
  const againstAt = process.argv.indexOf("--against");
  const before = againstAt > 0 ? measure(read(process.argv[againstAt + 1])) : undefined;
  const now = measure(read(folder));
  const text = report(now, before);
  writeFileSync(resolve(folder, "words.md"), `${text}\n`);
  console.log(text);
  console.log(`\nwritten to ${resolve(folder, "words.md")}`);
}

if (process.argv[1]?.endsWith("measure-words.ts")) main();
