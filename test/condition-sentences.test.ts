import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CONDITIONS, conditionById } from "../src/conditions";

/**
 * The verification sentence each condition carries (design audit of 16 Sep 2026, section 3).
 *
 * The chooser says two things about a condition and no more: what the person will do, and how that is verified and by
 * whom. The second is the `help` line, and it is the line a mentor asks for. These tests keep it a sentence rather
 * than letting it grow into a paragraph or shrink into a description of the source.
 */

test("every condition carries one, and it fits under a radio", () => {
  for (const condition of CONDITIONS) {
    assert.ok(condition.help.trim().length > 40, `${condition.id} says too little`);
    assert.ok(condition.help.length <= 200, `${condition.id} says ${condition.help.length} characters, which is a paragraph`);
    assert.match(condition.help, /\.$/, `${condition.id} ends its sentence`);
  }
});

test("it says something the name does not, and no two conditions say the same thing", () => {
  const said = new Set<string>();
  for (const condition of CONDITIONS) {
    assert.ok(!condition.help.includes(condition.name), `${condition.id} repeats its own name`);
    assert.ok(!said.has(condition.help), `${condition.id} says what another condition already says`);
    said.add(condition.help);
  }
});

test("the supervised result says what makes it supervised: camera, document, examiners", () => {
  // The audit's own three, taken because the register's line said less: it said "under watch" where the source
  // describes a recorded session, and dropped the marking. The sentence itself changed on 19 Sep 2026, when the
  // condition opened and the rule for a line a funder chooses from applied to it: what is read, and what it is
  // worth, in one sentence. The three the audit fixed are what is pinned here, never the wording around them.
  const det = conditionById("duolingo-english-test");
  assert.ok(det);
  assert.match(det.help, /camera/, "the session is recorded");
  assert.match(det.help, /identity document/, "and checked against a document");
  assert.match(det.help, /examiners/, "and marked by people");
  assert.match(det.help, /:/, "and it says what the reading is worth, as every choosable line does");
});

test("the three the audit did not improve keep what the register already said, and it said more", () => {
  const daily = conditionById("duolingo-daily");
  const chess = conditionById("chess-rating");
  const coursera = conditionById("coursera-certificate");
  assert.ok(daily && chess && coursera);
  // Each of these carries something the audit's table left out, so replacing them would have lost it.
  assert.match(daily.help, /nothing to install/, "what it costs the person");
  assert.match(daily.help, /not who held the phone/, "and what the reading is not worth");
  assert.match(chess.help, /never pays an account it has closed/, "what we do about the source's own verdict");
  assert.match(coursera.help, /not each piece of work/, "the limit of an identity checked once");
});

test("no verification sentence uses a word the product never says", () => {
  // The same list `pnpm check:words` enforces across consumer text, applied here to the register's own lines.
  const banned = /\b(wallet|gas|blockchain|seed|token|crypto|transaction hash|address)\b/i;
  for (const condition of CONDITIONS) assert.doesNotMatch(condition.help, banned, condition.id);
  const register = readFileSync("src/conditions.ts", "utf8");
  assert.match(register, /how it is verified and\s*\n?\s*\*?\s*by whom/, "the field says what it is for");
});
