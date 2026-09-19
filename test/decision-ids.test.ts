import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * One decision, one id (docs/DECISIONS.md).
 *
 * Two entries were written as D104 on 18 Sep 2026, which is how a reference stops meaning anything: an id is quoted
 * from the code and from the other documents, so a number that names two decisions sends half its readers to the
 * wrong one. The second is D104 bis, nothing was renumbered, and this test is what stops the next collision from
 * being found weeks later by a reader.
 */

const decisions = readFileSync("docs/DECISIONS.md", "utf8");
const headings = [...decisions.matchAll(/^## (D\d+(?: bis)?)[,:]/gm)].map((match) => match[1]);

/**
 * The collision this test found while fixing D104, and did not touch: D88 names the Chess.com milestone and the look
 * "Ink and sun", both on 17 Sep 2026, and both are quoted by that number (`scripts/measure-chess-rd.ts` means the
 * first, `test/exit-steps.test.ts` the second). Renaming an entry is the founder's call and he asked for D104; this
 * line is here so the next reader meets it in the code rather than by getting the wrong decision.
 */
const KNOWN_COLLISIONS = new Set(["D88"]);

test("no two entries carry the same id, apart from the one still to settle", () => {
  assert.ok(headings.length > 100, `only ${headings.length} entries found: the heading shape must have changed`);
  const seen = new Set<string>();
  for (const id of headings) {
    if (seen.has(id)) assert.ok(KNOWN_COLLISIONS.has(id), `${id} names two decisions`);
    seen.add(id);
  }
});

test("the collision that happened is written where a reader meets it, and neither entry moved", () => {
  const head = decisions.slice(0, decisions.indexOf("## D1,"));
  assert.match(head, /D104 bis/, "the head of the file says which number carries two entries");
  assert.match(head, /nothing else is renumbered/);
  assert.ok(headings.includes("D104") && headings.includes("D104 bis"));
  // Both entries keep the day they were taken, and the id a reader finds in the code still resolves.
  assert.match(decisions, /^## D104, 18 Sep 2026: on the way out, the money leads and the quantity follows$/m);
  assert.match(decisions, /^## D104 bis, 18 Sep 2026: a code proves an account only when its own recipient named it$/m);
});

test("what the code quotes as D104 bis is the entry about proving an account", () => {
  // The three lines that meant the second entry, changed with it: a reference left saying D104 would now point at
  // the way out naming an amount, which is a different decision about a different screen.
  for (const file of ["app/components/MilestoneGiftPage.tsx", "src/sentences.ts", "docs/SCREEN-CLAIMS.md"]) {
    // A comment wraps, so the line break and its asterisk come out before the number.
    const source = readFileSync(file, "utf8").replace(/\n\s*\*?\s*/g, " ");
    assert.match(source, /D27, D104 bis/, `${file} names the entry it means`);
  }
});
