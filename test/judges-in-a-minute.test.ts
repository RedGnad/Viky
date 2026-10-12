// The judges page reads in a minute or two, with nothing removed (the founder's preview of 12 Oct 2026). The first
// block is seven short lines; a fold opens on a few lines or a table; each long text is whole one level down, under a
// line that carries its title (`Row`, app/judges/Fold.tsx). The words a fold shows when it opens are counted in a
// browser (test/browser/judges-in-a-minute.spec.ts); here, the shape each part is written in, and that no point is lost.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CONDITIONS } from "../src/conditions";
import { TOULOUSE_PASSES } from "../src/judges-first-use";
import { OPENS_ON_REQUEST, READ_WITHOUT_A_GIFT, saidOfAWay, waysOfReading } from "../src/judges-ways";
import { BLOCK_TIME, FINALITY_GAP } from "../src/measured";

const read = (file: string) => readFileSync(file, "utf8");
const page = read("app/judges/page.tsx");
/** The source of one fold of the page, from its opening tag to the next fold or component. */
const foldOf = (id: string) => {
  const from = page.indexOf(`<Fold id="${id}"`);
  assert.ok(from > 0, id);
  return page.slice(from, page.indexOf("</Fold>", from));
};
const rowTitles = (source: string) => [...source.matchAll(/<Row (?:key=\{[^}]+\} )?title=(?:"([^"]+)"|\{<>([\s\S]*?)<\/>\}|\{([^}]+)\})/g)].map((found) => (found[1] ?? found[2] ?? found[3]).replace(/&apos;/g, "'"));

test("the first block says the page in seven lines, and what it said at length is whole, one level down", () => {
  const minute = read("app/judges/JudgesMinute.tsx");
  assert.deepEqual([...minute.matchAll(/<dt className=\{MUTED\}>([^<]+)<\/dt>/g)].map((found) => found[1]), ["What it is", "Who it is for", "Who has used it", "Proven", "Why Monad", "Where it runs", "One command"]);
  // "Final in under a second" is the measure's own: the most blocks a step waits, at the measured block time.
  assert.ok(minute.includes("Neither person holds MON or reads a fee. A step is final in under a second. One signature funds a gift."));
  assert.ok(FINALITY_GAP.mostBlocks * BLOCK_TIME.seconds < 1, `${FINALITY_GAP.mostBlocks} blocks of ${BLOCK_TIME.seconds} s`);
  // The pass it points at is the register's, never a figure typed beside it.
  assert.match(minute, /<strong>\{TOULOUSE_PASSES\.onTheFixedRule\.secondsFromSignIn\} seconds<\/strong> after they signed in, with no review \(Toulouse,\{" "\}\s+\{TOULOUSE_PASSES\.onTheFixedRule\.day\}\)/);
  assert.doesNotMatch(minute, /\b(20|21) (seconds|gifts)/);
  // The counts are the index's, with the founder's own tries taken out.
  assert.match(minute, /\{count\(usage\.funders\.all - usage\.funders\.founders, "account", "accounts"\)\} funded a gift and\{" "\}\s+\{usage\.recipients\.all - usage\.recipients\.founders\} opened one\./);
  // Nothing removed: the four answers as they stood, under one row.
  const atLength = minute.slice(minute.indexOf('<Row title="The same, at length">'), minute.indexOf("</Row>"));
  for (const kept of ["Nobody profits from a missed day.", "a parent", 'data-minute="judge-credit"', "gone back. Counted from the index", "AUSD is on Monad with EIP-3009", "{FINALITY_GAP.fewestBlocks} or {FINALITY_GAP.mostBlocks} blocks after its own"]) assert.ok(atLength.includes(kept), kept);
  // The universities are a fold of their own, and the first block leads to it.
  assert.ok(minute.includes('href="#universities"') && !minute.includes("<UniversityPath"));
  assert.match(read("app/judges/JudgesUniversities.tsx"), /<Fold id="universities" title="Universities: set up once, then paid on sign-in">/);
});

test("the conditions stand as three ways of reading, which hold every condition once, and no figure is typed", () => {
  const ways = waysOfReading();
  assert.deepEqual(ways.map((way) => way.nature), ["read", "shown", "connected"]);
  assert.deepEqual([...new Set(CONDITIONS.map((condition) => condition.nature))].sort(), ["connected", "read", "shown"]);
  for (const way of ways) {
    const lines = CONDITIONS.filter((condition) => condition.nature === way.nature).map((condition) => condition.id);
    assert.deepEqual(Object.keys(way.short).sort(), [...lines].sort(), `${way.nature}: a short name for each of its lines, and for no other`);
    assert.match(way.what, /\.$/);
  }
  assert.deepEqual(ways.map((way) => CONDITIONS.filter((condition) => condition.nature === way.nature).length), [12, 4, 2]);
  // A card counts the lines offered: 12, 4 and 2, the eighteen every other page says (the founder, 12 Oct 2026),
  // the line offered on request among them.
  const counted = ways.map((way) => saidOfAWay(way, CONDITIONS.filter((condition) => condition.nature === way.nature), null, { firstDay: "", nextDay: "", secondsFromSignIn: 0 }).conditions);
  assert.deepEqual(counted, [12, 4, 2]);
  assert.equal(counted.reduce((sum, one) => sum + one, 0), CONDITIONS.filter((condition) => condition.live).length);
  assert.equal(ways[2]!.what, "Active minutes on Fitbit, kilometres on Strava.");
  // The ten public lines read under attestation without a gift on 12 Oct 2026: public lines, and not the two paid ones.
  assert.equal(READ_WITHOUT_A_GIFT.on, "12 Oct 2026");
  assert.equal(READ_WITHOUT_A_GIFT.conditions.length, 10);
  for (const id of READ_WITHOUT_A_GIFT.conditions) assert.equal(CONDITIONS.find((condition) => condition.id === id)?.nature, "read", id);
  assert.ok(!READ_WITHOUT_A_GIFT.conditions.includes("duolingo-daily") && !READ_WITHOUT_A_GIFT.conditions.includes("chess-rating"));
  // The cards count from the rows as the page is served, and say nothing of what was paid when the count is not read.
  const cards = read("app/judges/JudgesConditions.tsx");
  assert.match(cards, /const counts = await realProofCounts\(\);/);
  assert.match(cards, /const said = saidOfAWay\(way, lines, counts, \{ firstDay: TOULOUSE_PASSES\.first\.day, nextDay: TOULOUSE_PASSES\.onTheFixedRule\.day, secondsFromSignIn: TOULOUSE_PASSES\.onTheFixedRule\.secondsFromSignIn \}, toBeOpened\);/);
  // The sentence of four figures at the head of the fold, counted from the same two readings, and the same phrase at the end of each row.
  assert.match(cards, /const counted = standsCounted\(counts, toBeOpened\);/);
  assert.match(cards, /\{counted\.total\} conditions: \{fourFigures\(counted\)\}/);
  assert.match(cards, /meta=\{<span data-condition-stands=\{condition\.id\}>\{standInOneLine\(standOf\(condition, counts, toBeOpened\)\)\}<\/span>\}/);
  assert.doesNotMatch(cards + read("src/judges-ways.ts"), /\b(11 (days|real proofs)|3 times|20 seconds|12 conditions)\b/);
  // Then a row a condition, with the four questions under it.
  assert.match(cards, /<Row\s+key=\{condition\.id\}\s+title=\{condition\.name\}/);
  for (const question of ["Does the data come from the source&apos;s own servers?", "Is the account theirs?", "Who acted on the account?", "What does the source do against cheating?"]) assert.ok(cards.includes(`<dt>${question}</dt>`), question);
});

test("the risks are four groups of rows, a line a point, and no point is lost", () => {
  const risks = foldOf("risks");
  const groups = risks.split("<RowGroup ").slice(1);
  assert.deepEqual(groups.map((group) => /^title="([^"]+)"/.exec(group)?.[1].replace(/&apos;/g, "'")), ["The sources' terms", "What a proof is worth", "Viky's own keys and steps", "The ways out"]);
  assert.deepEqual(groups.map((group) => rowTitles(group).length), [16, 5, 3, 4]);
  assert.equal(rowTitles(risks).length, 28);
  assert.equal(new Set(rowTitles(risks)).size, 28);
  assert.doesNotMatch(risks, /<li>\s*<strong>/, "no point is left as an item of a list");
  // A group says how many rows it holds by counting them.
  assert.match(read("app/judges/Fold.tsx"), /<span> \{Children\.count\(children\)\}<\/span>/);
});

test("how to try it is numbered steps and nothing else, each long text one level down", () => {
  const steps = foldOf("try");
  assert.match(steps, /^<Fold id="try" title="For judges, how to try it" open>\s+<ol className=/);
  assert.deepEqual(rowTitles(steps), [
    "The code, the credit, and what a real funder pays",
    "A gift above the credit",
    "The other side, gesture by gesture",
    "What each path asks, and what it costs in readings",
    "The short path, and where the money goes",
    "What comes back, and what the first device kept",
    "The second key, in six gestures",
  ]);
  assert.match(steps, /<\/ol>\s*$/, "the fold ends with its list: no paragraph stands outside the steps");
});

test("the other folds open on their lines or their table: each long text is a row by its own title", () => {
  const titles: Record<string, readonly string[]> = {
    "app/judges/JudgesVerify.tsx": ["Where every settled day is published", "One example to check from a clone, with no key and no account", "The two people of a gift check their own day", "A milestone gift: a reading rather than a day", "What a pass proves, and what it does not"],
    "app/judges/JudgesReliability.tsx": ["Why the hour is held, and not the minute"],
    "app/judges/JudgesEarlyGifts.tsx": ["Where they were made, and why this app does not show them", "What this costs us"],
    "app/judges/JudgesIndex.tsx": ["What the index is, where it runs, and what it is not", "The index beside the token, contract by contract", "Every gift, and the transaction that created it"],
    "app/components/MilestoneJudges.tsx": ["What the milestone contract holds, and when it pays", "The rule it rests on, and its goals", "How a reading is made", "What the owner of this contract can do, and what it cannot", "What was hardened against cheating", "Whom a settlement trusts", "What is not proven"],
  };
  for (const [file, expected] of Object.entries(titles)) assert.deepEqual(rowTitles(read(file)), expected, file);
  assert.deepEqual(rowTitles(read("app/judges/JudgesContracts.tsx")), ["contract.label", "What the owner of a contract can do, and what it cannot"]);
  assert.deepEqual(rowTitles(foldOf("reading")), ["A daily gift made today: a day is paid the day it is read", "Duolingo, read in public mode", "Hardened on 18 Sep 2026: one course, and the account as Duolingo names it", "What a reading costs, and the ceilings Viky holds itself to", "The count of the month, and what was spent"]);
  assert.deepEqual(rowTitles(foldOf("money-in")), ["Rampnow, by card", "Ramp, by card or bank transfer", "Ramp, by card or bank transfer", "Rampnow, by card"]);
  assert.deepEqual(rowTitles(foldOf("network")), ["Each address, its deployment, its verified source and its hand-over to the Safe", "How each contract was handed to the Safe, and by which key"]);
  // A row is a plain `details`: it opens without a script, and a browser's own search finds what it holds.
  assert.match(read("app/judges/Fold.tsx"), /export function Row\([^)]*\) \{\s+return \(\s+<details className="judges-row">/);
});

test("a card says what was paid from the count of real proofs, and why the rest waits", () => {
  const [page, shown, connected] = waysOfReading();
  const lines = (nature: string) => CONDITIONS.filter((condition) => condition.nature === nature);
  const toulouse = { firstDay: TOULOUSE_PASSES.first.day, nextDay: TOULOUSE_PASSES.onTheFixedRule.day, secondsFromSignIn: TOULOUSE_PASSES.onTheFixedRule.secondsFromSignIn };
  // The counts as production holds them on 12 Oct 2026: a daily lesson paid, a climb, three enrolments.
  const counts = new Map([["duolingo-daily", 11], ["chess-rating", 7], ["university-enrollment-shown", 3]]);
  assert.deepEqual(saidOfAWay(page, lines("read"), counts, toulouse), {
    conditions: 12,
    lead: "Paid with real money:",
    said: "Duolingo, 11 real proofs and the Chess.com rating, 7 real proofs. Each of the 10 others had its real page read under attestation on 12 Oct 2026, with no gift yet.",
  });
  assert.deepEqual(saidOfAWay(shown, lines("shown"), counts, toulouse), {
    conditions: 4,
    lead: "Paid with real money:",
    said: "enrolment, 3 real proofs. The first enrolment was read by hand (Toulouse, 7 Oct 2026) and the next was paid 20 seconds after sign-in (9 Oct 2026). Nobody has shown one yet: the year passed, a grade and a TOEFL score.",
  });
  // Strava while it is on request: the founder's sentence, with Strava's own figures (its API FAQ, read 12 Oct 2026).
  const onRequest = new Set(["strava-daily"]);
  const opens = "Strava opens on request, within two days of a first gift: its developer program is a paid subscription, taken when a gift asks for it, and serves ten athletes before its review, up to 9,999 after it.";
  assert.equal(OPENS_ON_REQUEST["strava-daily"], opens);
  assert.deepEqual(saidOfAWay(connected, lines("connected"), counts, toulouse, onRequest), {
    conditions: 2,
    lead: "Built, read on no real account yet.",
    said: `Fitbit takes a Fitbit tracker or a Pixel Watch. ${opens}`,
  });
  // Once the operator has opened it, it is a line like Fitbit, and the card says no more of it than of any other.
  assert.deepEqual(saidOfAWay(connected, lines("connected"), counts, toulouse, new Set()), { conditions: 2, lead: "Built, read on no real account yet.", said: "Fitbit takes a Fitbit tracker or a Pixel Watch." });
  // A line that gets its first proof moves from the ones read without a gift to the ones paid, by the count alone.
  const later = new Map([...counts, ["codeforces-rating", 1], ["fitbit-daily", 2]]);
  assert.match(saidOfAWay(page, lines("read"), later, toulouse).said, /^Duolingo, 11 real proofs, Codeforces, 1 real proof and the Chess\.com rating, 7 real proofs\. Each of the 9 others had its real page read/);
  assert.deepEqual(saidOfAWay(connected, lines("connected"), later, toulouse, onRequest), { conditions: 2, lead: "Paid with real money:", said: `Fitbit, 2 real proofs. Fitbit takes a Fitbit tracker or a Pixel Watch. ${opens}` });
  // Nothing is paid, and nothing is said paid; the count not read, and nothing is named at all.
  assert.equal(saidOfAWay(shown, lines("shown"), new Map(), toulouse).lead, "Built, and nobody has shown one yet.");
  assert.deepEqual(saidOfAWay(page, lines("read"), null, toulouse), { conditions: 12, lead: null, said: "The count of real proofs could not be read just now, so nothing is said here of what was paid." });
  // The line on request says so all the same: that is the register's and the operator's, and needs no count.
  assert.deepEqual(saidOfAWay(connected, lines("connected"), null, toulouse, onRequest), { conditions: 2, lead: null, said: `The count of real proofs could not be read just now, so nothing is said here of what was paid. ${opens}` });
});
