import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after, before, beforeEach } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { indexFrom, type IndexRead } from "../src/envio-index";
import { configureIndexKept, INDEX_PLAN, indexToShow, KEEP_EVERY_MS, lastIndexKept, whenIndexRead } from "../src/index-kept";
import type { SqlExecutor } from "../src/proof-session-store";

/**
 * The last answer of the index, kept (the founder, 12 Oct 2026): the hosted index runs on a plan that counts its
 * hours, so when it does not answer the judges page shows the last figures it read, with their block and their date,
 * instead of showing nothing. Held here against a database: what is kept, what replaces it, and what is shown when
 * neither the index nor the database answers.
 */

let db: PGlite;

const answerAt = (block: number, giftsCreated = 2) => ({
  _meta: [{ chainId: 143, progressBlock: block, sourceBlock: block + 3 }],
  GlobalStat: [{ giftsCreated, giftsClaimed: 1, daysEarned: 2, daysReturned: 5, milestonesReached: 1, amountEarned: "5010000", amountWithdrawn: "4010000", amountRefunded: "5000000", consentKeysBound: 1, yesAnchored: 2, stopsAnchored: 1, eventsIndexed: 257 }],
  Gift: [],
});

/** The index as it would answer, or as it would not. */
const answering = (answer: unknown) => async () => {
  const index = indexFrom(answer);
  return index ? { index, answer } : null;
};
const silent = async () => null;

before(async () => {
  db = new PGlite();
  const executor: SqlExecutor = async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    return (await db.query<Record<string, unknown>>(text, values)).rows;
  };
  configureIndexKept(executor);
});

beforeEach(async () => {
  await db.query("DROP TABLE IF EXISTS viky_index_kept");
  configureIndexKept(async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    return (await db.query<Record<string, unknown>>(text, values)).rows;
  });
});

after(async () => {
  configureIndexKept(undefined);
  await db.close();
});

test("an answer of the index is shown as it is and kept; when the index does not answer, the one kept is shown with its moment", async () => {
  // Nothing kept and no answer: nothing, and the page says so in a sentence.
  assert.equal(await indexToShow(silent), null);
  const read = new Date("2026-10-12T14:05:00Z");
  const shown = await indexToShow(answering(answerAt(112_000_000)), read);
  assert.equal(shown?.block, 112_000_000);
  assert.equal(shown?.keptFrom, undefined, "an answer of now is not said kept");
  assert.equal(whenIndexRead(shown as IndexRead), "as this page is served");
  // The index stops answering: the same figures, with the block it had reached and the moment they were read.
  const kept = await indexToShow(silent, new Date("2026-10-14T06:30:00Z"));
  assert.equal(kept?.block, 112_000_000);
  assert.equal(kept?.totals.eventsIndexed, 257);
  assert.equal(kept?.totals.amountWithdrawn, 4_010_000n, "an amount is read back as the units it is");
  assert.equal(kept?.keptFrom?.toISOString(), read.toISOString());
  assert.equal(whenIndexRead(kept as IndexRead), "at its last reading, on 12 Oct 2026, 14:05 UTC");
});

test("the answer kept is replaced once it is ten minutes old, and never by an index that has gone back", async () => {
  assert.equal(KEEP_EVERY_MS, 600_000);
  const first = new Date("2026-10-12T14:05:00Z");
  await indexToShow(answering(answerAt(112_000_000)), first);
  // A page served again five minutes later shows the new answer and writes nothing.
  const soon = await indexToShow(answering(answerAt(112_001_000, 3)), new Date(first.getTime() + 5 * 60_000));
  assert.equal(soon?.totals.giftsCreated, 3);
  assert.equal((await lastIndexKept())?.block, 112_000_000);
  // Ten minutes after the one kept, the new answer takes its place.
  const later = new Date(first.getTime() + KEEP_EVERY_MS);
  await indexToShow(answering(answerAt(112_002_000, 3)), later);
  const kept = await lastIndexKept();
  assert.deepEqual([kept?.block, kept?.totals.giftsCreated, kept?.keptFrom?.toISOString()], [112_002_000, 3, later.toISOString()]);
  // An index deployed again starts from its first block: what it says is shown, and the whole reading stays kept.
  const again = await indexToShow(answering(answerAt(109_000_000, 1)), new Date(later.getTime() + 60 * 60_000));
  assert.equal(again?.block, 109_000_000);
  assert.equal((await lastIndexKept())?.block, 112_002_000);
  assert.equal((await db.query<{ n: number }>("SELECT count(*)::int AS n FROM viky_index_kept")).rows[0]?.n, 1, "one row, the last");
});

test("a row that is not an answer shows nothing, and a database that does not answer never breaks the page", async () => {
  await indexToShow(answering(answerAt(112_000_000)), new Date("2026-10-12T14:05:00Z"));
  // What is kept is held to every check a fresh answer is: an answer of another shape is nothing.
  await db.query(`UPDATE viky_index_kept SET answer = '{"_meta": [], "GlobalStat": [], "Gift": []}'::jsonb`);
  assert.equal(await indexToShow(silent), null);
  // No database: the index's own answer is shown all the same, and with no answer there is nothing, never an error.
  configureIndexKept(async () => {
    throw new Error("no database");
  });
  assert.equal((await indexToShow(answering(answerAt(112_003_000))))?.block, 112_003_000);
  assert.equal(await indexToShow(silent), null);
});

test("the judges page asks the index once, says of when its figures are, and says the plan in one line", () => {
  const page = readFileSync("app/judges/page.tsx", "utf8");
  assert.match(page, /const index = await indexToShow\(\);/);
  assert.equal(page.match(/indexToShow\(/g)?.length, 1);
  assert.doesNotMatch(page, /readIndex\(/);
  const block = readFileSync("app/judges/JudgesIndex.tsx", "utf8");
  // The plan, as Envio's dashboard states it: one line, in the open, on both forms of the fold.
  assert.deepEqual([INDEX_PLAN.name, INDEX_PLAN.free, INDEX_PLAN.indexingHoursAMonth], ["Development", true, 750]);
  assert.match(block, /\{INDEX_PLAN\.name\} plan: \{INDEX_PLAN\.indexingHoursAMonth\} indexing hours a month\. When it does not answer, this page shows the last\s+figures it read, with their block and their date\./);
  assert.equal(block.match(/<Plan \/>/g)?.length, 2);
  // The figures kept are said kept before any of them, with their block and their moment.
  assert.match(block, /\{kept \? \(\s+<p className=\{HELP\} data-index="kept">\s+<strong>The index did not answer just now\.<\/strong> What follows is the last answer this page kept of it: block\{" "\}\s+\{index\.block\.toLocaleString\("en-US"\)\}, read on \{momentInWords\(kept\)\}\./);
  // What the token says is of now, what the index said is of then: the comparison says both.
  assert.match(block, /the index&apos;s events \{kept \? "added" : "add"\} up to \{formatAusdExact\(indexed\)\} still held\{kept \? " at that reading" : ""\}/);
  assert.match(block, /A gift made, paid or sent back since that reading is in the token's figure and not in the index's\./);
  // Every other block that prints a figure of the index says of when it is.
  assert.match(readFileSync("app/judges/JudgesWhoUsed.tsx", "utf8"), /Counted from the index of the contracts&apos; events \{whenIndexRead\(index\)\}, at block/);
  const minute = readFileSync("app/judges/JudgesMinute.tsx", "utf8");
  assert.match(minute, /\{index\?\.keptFrom \? <span data-minute="index-kept">Counted at the index&apos;s last reading, on \{momentInWords\(index\.keptFrom\)\}\. <\/span> : null\}/);
  assert.match(minute, /Counted from the index\{" "\}\s+\{index \? whenIndexRead\(index\) : "as this page is served"\}:/);
  assert.match(readFileSync("app/judges/JudgesMera.tsx", "utf8"), /index\.keptFrom \? `At its last reading, on \$\{momentInWords\(index\.keptFrom\)\}, the index counted` : "As this page is served the index counts"/);
  // The table is made the first time it is needed, and by the migration for whoever runs it.
  assert.match(readFileSync("scripts/migrate-db.ts", "utf8"), /await ensureIndexKeptSchema\(\);/);
});
