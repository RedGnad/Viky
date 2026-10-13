// "Paid on N real proofs" counts the proofs that paid (the founder, 13 Oct 2026). A first reading pays nothing: the
// start of a climb, and the first check-in of a daily gift, which ties the account and credits no day. Counted with the
// rest, they made the pages say 11 and 7 where the contracts had paid 5 days and 2 climbs.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { standInOneLine, standOf } from "../src/condition-stands";
import { conditionById } from "../src/conditions";
import { configureProofCounts, realProofCounts } from "../src/proof-counts";
import type { SqlExecutor } from "../src/proof-session-store";

/** The rows as they stood in production on 13 Oct 2026, by what each did. */
const READINGS = [
  ...["1000000", "1000002", "1000003", "1000004", "1000005"].map((gift) => ({ condition: "chess-rating", gift, outcome: "started" })),
  ...["1000004", "1000005"].map((gift) => ({ condition: "chess-rating", gift, outcome: "reached" })),
  ...["1000006", "1000008", "1000009"].map((gift) => ({ condition: "university-enrollment-shown", gift, outcome: "reached" })),
];
/** Eleven check-ins of the daily lesson: six first readings that credit no day, five that credit one. */
const CHECK_INS = [
  ...["1", "2", "3", "4", "1000", "1001"].map((gift) => ({ gift, tx: `0xfirst${gift}`, earned: false })),
  ...["1", "2", "4", "1000", "1001"].map((gift) => ({ gift, tx: `0xday${gift}`, earned: true })),
];

/** Answers the two counts the way the database would, by what each query asks for. */
const rows: SqlExecutor = (async (strings: TemplateStringsArray) => {
  const asked = strings.join("?").replace(/\s+/g, " ");
  if (asked.includes("viky_milestone_readings")) {
    const taken = READINGS.filter((reading) => (asked.includes("r.outcome = 'reached'") ? reading.outcome === "reached" : true));
    const by = new Map<string, number>();
    for (const reading of taken) by.set(reading.condition, (by.get(reading.condition) ?? 0) + 1);
    return [...by].map(([id, n]) => ({ id, n }));
  }
  const taken = CHECK_INS.filter((checkIn) => (asked.includes("d.tx_hash = rel.tx_hash AND d.outcome = 'earned'") ? checkIn.earned : true));
  return [{ goal: 1, n: taken.length }];
}) as unknown as SqlExecutor;

test("only a proof that paid is counted: a climb reached, a check-in that credited a day", async (t) => {
  configureProofCounts(rows);
  t.after(() => configureProofCounts(undefined));
  const counts = await realProofCounts();
  assert.deepEqual([...(counts ?? [])].sort(), [["chess-rating", 2], ["duolingo-daily", 5], ["university-enrollment-shown", 3]]);
  const nothingWaits = new Set<string>();
  assert.equal(standInOneLine(standOf(conditionById("duolingo-daily")!, counts, nothingWaits)), "Open. Paid on 5 real proofs.");
  assert.equal(standInOneLine(standOf(conditionById("chess-rating")!, counts, nothingWaits)), "Open. Paid on 2 real proofs.");
  assert.equal(standInOneLine(standOf(conditionById("university-enrollment-shown")!, counts, nothingWaits)), "Open. Paid on 3 real proofs.");
});

test("a line is not said paid on a start alone", async (t) => {
  // A climb that has started and reached nothing, and a daily gift whose only check-in is the first: no proof paid.
  const started: SqlExecutor = (async (strings: TemplateStringsArray) => {
    const asked = strings.join("?").replace(/\s+/g, " ");
    if (asked.includes("viky_milestone_readings")) return asked.includes("r.outcome = 'reached'") ? [] : [{ id: "chess-tactics", n: 1 }];
    return asked.includes("d.outcome = 'earned'") ? [] : [{ goal: 1, n: 1 }];
  }) as unknown as SqlExecutor;
  configureProofCounts(started);
  t.after(() => configureProofCounts(undefined));
  const counts = await realProofCounts();
  assert.deepEqual([...(counts ?? [])], []);
  assert.notEqual(standOf(conditionById("chess-tactics")!, counts, new Set()).kind, "paid");
  assert.notEqual(standOf(conditionById("duolingo-daily")!, counts, new Set()).kind, "paid");
});

test("the two counts ask the database for what paid, in so many words", () => {
  const source = readFileSync("src/proof-counts.ts", "utf8").replace(/\s+/g, " ");
  assert.ok(source.includes("WHERE r.attested AND r.outcome = 'reached'"), "a climb or a result reached, never a start");
  assert.doesNotMatch(source, /outcome IN \(/);
  assert.ok(source.includes("WHERE rel.kind = 'check-in' AND EXISTS (SELECT 1 FROM viky_days d WHERE d.gift_id = rel.gift_id AND d.tx_hash = rel.tx_hash AND d.outcome = 'earned')"), "a check-in whose own transaction credited a day");
});
