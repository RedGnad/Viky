import assert from "node:assert/strict";
import test from "node:test";
import { PRIVACY, privacyOf, privacyWords, verdictOnly } from "../src/condition-privacy";
import { BUILDING, CONDITIONS } from "../src/conditions";
import { scanSource } from "../src/consumer-words";

/**
 * The privacy page says, condition by condition, what is read, who sees it, what is kept and what reaches the public
 * program (D185). Every condition the register holds has its line; the lines a person shows from their own account
 * are all under the verdict rule; and nothing printed uses a word the person must never see.
 */
const EVERY = [...CONDITIONS, ...BUILDING];

test("every condition in the register has its privacy line, and no line names a condition that does not exist", () => {
  for (const condition of EVERY) assert.doesNotThrow(() => privacyOf(condition), condition.id);
  const ids = new Set(EVERY.map((condition) => condition.id));
  for (const id of Object.keys(PRIVACY)) assert.ok(ids.has(id), `${id} is not in the register`);
});

test("what a person shows from their own account is under the verdict rule; what a source publishes about them is kept as read", () => {
  for (const condition of EVERY) {
    if (condition.nature === "shown") assert.equal(verdictOnly(condition.id), true, `${condition.id} is shown by them`);
    else assert.equal(verdictOnly(condition.id), false, `${condition.id} is read for them`);
  }
  assert.equal(verdictOnly("nobody-knows"), false, "an unknown condition falls under no rule");
});

test("the lines are sentences the person may read: no forbidden word, and every one ends with a full stop", () => {
  for (const condition of EVERY) {
    const words = privacyWords(condition);
    assert.deepEqual(scanSource(condition.id, words), [], words);
    assert.ok(words.endsWith("."), words);
    assert.ok(words.includes(condition.source) || privacyOf(condition).kept === "fact", `${condition.id} names its source`);
  }
});

test("the verdict line says the four things the rule says", () => {
  const words = privacyWords({ id: "toefl-mybest-shown", source: "ETS" });
  for (const said of ["seen once, on your own screen, and by nobody else", "keeps neither the number nor the page's answer", "the public program receives that alone", "they do not see the number"]) {
    assert.ok(words.includes(said), said);
  }
});
