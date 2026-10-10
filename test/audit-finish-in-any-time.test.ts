import assert from "node:assert/strict";
import test from "node:test";
import { STARTING_DRAFT, unanswered, type GiftDraft } from "../src/gift-draft";
import { certificateById } from "../src/milestone-conditions";

/**
 * "Finish a race" left on "finish" (the final audit of 9 Oct 2026, A5, which asked whether it passed "Done": read in
 * the code by a verifier, seen running by nobody). It did not. A race and a competition may ask for nothing but the
 * finish, which their own rule writes 0 and which the card suggests for them; the card read a 0 as no target at all,
 * so it said the target was still to answer until a time was typed.
 */
const card = (conditionId: string, target: string): GiftDraft => ({ ...STARTING_DRAFT, conditionId, subject: "Lea Martin", course: "a-race", courseTitle: "A race", target });

test("a race and a competition left on the finish are answered, as their own rule and the route judge them", () => {
  for (const id of ["marathon-finish", "wca-time"]) {
    const condition = certificateById(id);
    assert.ok(condition, id);
    assert.equal(condition.target.suggested, 0, `${id} suggests the finish`);
    assert.equal(condition.validTarget(0), true, `${id}'s own rule takes it`);
    assert.equal(unanswered(card(id, String(condition.target.suggested))), null, `${id} left on the finish passes`);
    // A time typed is judged as before.
    assert.equal(unanswered(card(id, "4.5")), null);
    // A field left empty is still no target, and a figure the rule refuses is still refused.
    assert.equal(unanswered(card(id, "")), "target");
    assert.equal(unanswered(card(id, "-1")), "target");
  }
  assert.equal(unanswered(card("marathon-finish", "24")), "target", "a day or more is not a time to finish under");
});

test("nothing else takes a target of nothing", () => {
  // A habit's target, a score and something issued or not: 0 is no answer to any of them.
  assert.equal(unanswered({ ...STARTING_DRAFT, recipientName: "Boo", subject: "boo_learns", target: "0" }), "target");
  for (const id of ["toefl-mybest-shown", "duolingo-english-test", "coursera-certificate"]) assert.equal(unanswered(card(id, "0")), "target", id);
  // The TOEFL's own scale starts at 0, so its rule takes a 0: the card still does not, since a score of 0 or more is
  // one anybody has. Only a condition that suggests the 0 itself is answered by it.
  assert.equal(certificateById("toefl-mybest-shown")?.validTarget(0), true);
  assert.notEqual(certificateById("toefl-mybest-shown")?.target.suggested, 0);
});
