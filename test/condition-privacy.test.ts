import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { HELD_FOR_REVIEW, PRIVACY, privacyOf, privacyWords, verdictOnly } from "../src/condition-privacy";
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
    if (condition.nature === "shown" || condition.nature === "connected") assert.equal(verdictOnly(condition.id), true, `${condition.id} is shown or connected by them`);
    else assert.equal(verdictOnly(condition.id), false, `${condition.id} is read for them`);
  }
  assert.equal(verdictOnly("nobody-knows"), false, "an unknown condition falls under no rule");
});

test("the lines are sentences the person may read: no forbidden word, and every one ends with a full stop", () => {
  for (const condition of EVERY) {
    const words = privacyWords(condition);
    assert.deepEqual(scanSource(condition.id, words), [], words);
    assert.ok(words.endsWith("."), words);
    // "their university" is the funder's word: the person reads "your own university account" (the audit of 1 Oct 2026, V-02).
    assert.ok(words.includes(condition.source.replace(/^their /, "")) || privacyOf(condition).kept === "fact", `${condition.id} names its source`);
    assert.doesNotMatch(words, /your own their/, words);
  }
});

test("the verdict line says the four things the rule says", () => {
  const words = privacyWords({ id: "toefl-mybest-shown", source: "ETS", nature: "shown" });
  for (const said of ["seen once, on your own screen, and by nobody else", "keeps neither the number nor the page's answer", "the public program receives that alone", "they do not see the number"]) {
    assert.ok(words.includes(said), said);
  }
});

test("a connected line says it is read each morning from the account the person connected, under the same verdict rule", () => {
  const words = privacyWords({ id: "fitbit-daily", source: "Fitbit", nature: "connected" });
  assert.ok(words.startsWith("Read each morning by Viky's reading service from the Fitbit account you connected: yesterday's active minutes"), words);
  assert.ok(words.includes("keeps neither the number nor the page's answer"), words);
  // The server reads it, so nothing says the person saw it on their own screen (the audit of 1 Oct 2026, V-02).
  assert.doesNotMatch(words, /on your own screen/);
  assert.ok(words.includes("It is read by that service, never shown to a person, and dropped once judged."), words);
});

test("a university's line says its first proof is held for a person at Viky to read, and erased at the decision", () => {
  for (const id of HELD_FOR_REVIEW) {
    const words = privacyWords({ id, source: "their university", nature: "shown" });
    assert.ok(words.startsWith("Shown by you, from your own university account: "), words);
    assert.ok(words.includes("One exception: the first proof ever shown from a university's page is held until a person at Viky has read what was read from it"), words);
    assert.ok(words.includes("What they read is erased when they decide."), words);
  }
  // Held is what the verification holds: a proof of a witness portal with no pin, which only a university's portal is.
  assert.doesNotMatch(privacyWords({ id: "toefl-mybest-shown", source: "ETS", nature: "shown" }), /One exception/);
  // And the erasing is the code's: the decision empties what was read with the proofs.
  assert.match(readFileSync(new URL("../src/portal-store.ts", import.meta.url), "utf8"), /decided_at = now\(\), proofs = 'null'::jsonb, reading = '\{\}'::jsonb/);
});
