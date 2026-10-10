import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PENDING_GIFT_MAX_AGE_MS, pendingGiftExists, pendingGiftFor, pendingGiftToStore } from "../src/pending-gift";

/**
 * The gift a funder set up before paying survives the session closing (D74). On 15 Sep the card payment took twelve
 * minutes, the session closed after ten, and the payment sat in the account with no gift made from it.
 */

const A = "0x350aF869ABa6ff26AB33517ECd3E38ACaF107761";
const B = "0x91C964e745ffd6265c75df33cA9137D81c3c454d";
const NOW = Date.UTC(2026, 8, 15, 20, 13);
const terms = { account: A, recipientName: "Léa", funderName: "Mom", conditionId: "duolingo-daily", username: "ama_learns", dollars: "25", days: "7", target: "10" };

test("the gift set up before paying comes back for the account that set it up", () => {
  const stored = pendingGiftToStore(terms, NOW);
  // Twelve minutes later, which is how long the payment of 15 Sep took, with the session long closed.
  const back = pendingGiftFor(stored, A, NOW + 12 * 60_000);
  assert.deepEqual(back, { ...terms, account: A.toLowerCase(), savedAtMs: NOW });
  assert.deepEqual(pendingGiftFor(stored, A.toLowerCase(), NOW + 1), back, "whatever the letter case of the identifier");
});

test("the figure typed comes back with it, so the gift is said as it was typed wherever it is picked up again", () => {
  // 45 euros typed: written down with the payment started, and never read back, so Home said "$50.51 for Boo".
  const typed = { ...terms, dollars: "50.51", typedAmount: "45", typedIn: "EUR" };
  assert.deepEqual(pendingGiftFor(pendingGiftToStore(typed, NOW), A, NOW + 1), { ...typed, account: A.toLowerCase(), savedAtMs: NOW });
  // A gift kept before the figure was written down with it has none, and is said in dollars.
  const back = pendingGiftFor(pendingGiftToStore(terms, NOW), A, NOW + 1);
  assert.equal(back && "typedAmount" in back, false);
});

test("it never comes back for another account, or once it is old", () => {
  const stored = pendingGiftToStore(terms, NOW);
  assert.equal(pendingGiftFor(stored, B, NOW + 1), undefined);
  assert.equal(pendingGiftFor(stored, undefined, NOW + 1), undefined);
  assert.ok(pendingGiftFor(stored, A, NOW + PENDING_GIFT_MAX_AGE_MS - 1));
  assert.equal(pendingGiftFor(stored, A, NOW + PENDING_GIFT_MAX_AGE_MS + 1), undefined);
  assert.equal(pendingGiftFor(stored, A, NOW - 10 * 60_000), undefined, "saved in the future is not a gift anybody set up");
  // The rail's help centre says a payment can take several hours when the network is busy.
  assert.ok(PENDING_GIFT_MAX_AGE_MS >= 6 * 60 * 60_000);
});

/**
 * After a reload there is nobody signed in to name, and the first step is all the funder sees. It says a gift is
 * waiting, so this answers without an account, and only for a gift that could still be picked up.
 */
test("the device says a gift is waiting without naming whose it is", () => {
  assert.equal(pendingGiftExists(pendingGiftToStore(terms, NOW), NOW + 12 * 60_000), true);
  assert.equal(pendingGiftExists(pendingGiftToStore(terms, NOW), NOW + PENDING_GIFT_MAX_AGE_MS + 1), false);
  assert.equal(pendingGiftExists(null, NOW), false);
  assert.equal(pendingGiftExists("{", NOW), false);
  assert.equal(pendingGiftExists(JSON.stringify({ savedAtMs: NOW }), NOW), false);
});

/**
 * Coming back is not the same as arriving: a second account would leave the gift and the payment on the first. Since
 * the drawn flows (F8), the screen after a closed session offers signing in and nothing else.
 */
test("on the screen after a closed session, signing in is the only thing offered", () => {
  const pay = readFileSync("app/components/PayGift.tsx", "utf8");
  assert.match(pay, /<AccountPanel returning signInOnly \/>/);
  const panel = readFileSync("app/components/AccountPanel.tsx", "utf8");
  assert.match(panel, /className=\{returning \? PRIMARY_BUTTON : SECONDARY_BUTTON\}/, "sign in leads when somebody comes back");
  assert.match(panel, /className=\{returning \? SECONDARY_BUTTON : PRIMARY_BUTTON\}/, "and making an account follows it");
});

/** What is kept is what the gift is made from, and nothing else: D72 asks for no contact, so none is kept or sent. */
test("the terms kept are exactly the terms the gift is made from", () => {
  // Since the card of 19 Sep 2026 the terms are written by one function, `draftToTerms`, which the card, the paying
  // screen and the tests all read: the device cannot keep something the gift is not made from.
  const terms = readFileSync("src/gift-draft.ts", "utf8");
  const written = terms.slice(terms.indexOf("export function draftToTerms"), terms.indexOf("export function draftFromTerms"));
  for (const field of ["recipientName: draft.recipientName", "funderName: draft.funderName", "conditionId: draft.conditionId", "username: draft.subject", "dollars: draft.dollars", "days: draft.days", "target: draft.target", "course: draft.course"]) {
    assert.ok(written.includes(field), `the device keeps ${field}`);
  }
  const pay = readFileSync("app/components/PayGift.tsx", "utf8");
  assert.match(pay, /savePendingGift\(\{ \.\.\.draftToTerms\(next, address\), wayIn: way\.name \}\)/, "and the way in that was pressed");
  const call = pay.slice(pay.indexOf("await prepareGift({"), pay.indexOf("const record: Made"));
  assert.match(call, /duolingoUsername: terms\.username \|\| undefined/);
  assert.match(call, /recipientName: recipient/);
  assert.match(call, /funderName: funder/);
  // Since U1 the goal type is part of the terms signed, because a gift counted on one course is its own goal.
  assert.match(call, /goalType: terms\.goalType/);
  assert.match(call, /course: terms\.course \|\| undefined/);
  assert.match(call, /dailyTarget: target/);
  assert.match(call, /durationDays: days/);
  assert.match(call, /amount: units/);
  assert.doesNotMatch(call, /contact/i, "no contact is asked for, kept or sent (D72)");
});

test("a gift kept on a device before the names existed is still picked up, as the lesson it was", () => {
  const before = JSON.stringify({ account: A.toLowerCase(), username: "ama_learns", dollars: "25", days: "7", target: "10", savedAtMs: NOW });
  const back = pendingGiftFor(before, A, NOW + 60_000);
  assert.equal(back?.recipientName, "");
  assert.equal(back?.funderName, "");
  assert.equal(back?.conditionId, "duolingo-daily");
  assert.equal(pendingGiftFor(pendingGiftToStore(terms, NOW), A, NOW + 1)?.recipientName, "Léa");
});

test("anything unreadable, or terms the gift would refuse, is not picked up", () => {
  for (const raw of [null, "", "{", "null", "[]", JSON.stringify(terms), JSON.stringify({ ...terms, savedAtMs: "x" })]) {
    assert.equal(pendingGiftFor(raw, A, NOW), undefined, String(raw));
  }
  for (const bad of [{ dollars: "1e3" }, { dollars: "0" }, { days: "6" }, { target: "0" }, { username: 3 }]) {
    const raw = JSON.stringify({ ...terms, account: A.toLowerCase(), savedAtMs: NOW, ...bad });
    assert.equal(pendingGiftFor(raw, A, NOW), undefined, JSON.stringify(bad));
  }
});

/**
 * A gift had or not is read back as a gift kept (the final audit of 9 Oct 2026, A5). The cadence and the place a climb
 * started from were asked of every milestone, so an enrolment paid for by card never came back: Home offered no way to
 * its payment, and outside the countries of the card service its wait was built on that service all the same.
 */
test("a gift had or not comes back with the way it is paid by, and a climb still needs where it started", () => {
  const enrolment = { ...terms, conditionId: "university-enrollment-shown", username: "Léa Martin", days: "30", target: "1", wayIn: "Ramp", course: "utoulouse" };
  assert.deepEqual(pendingGiftFor(pendingGiftToStore(enrolment, NOW), A, NOW + 1), { ...enrolment, account: A.toLowerCase(), savedAtMs: NOW });
  assert.equal(pendingGiftExists(pendingGiftToStore(enrolment, NOW), NOW + 1), true);
  // Its target is judged by its own rule: an enrolment is had or not, and no other figure is one of its targets.
  assert.equal(pendingGiftFor(pendingGiftToStore({ ...enrolment, target: "7" }, NOW), A, NOW + 1), undefined);
  // A race may ask for nothing but the finish, which its rule writes 0; a daily gift's target is still above nothing.
  const race = { ...terms, conditionId: "marathon-finish", username: "Léa Martin", days: "30", target: "0", wayIn: "Ramp", course: "paris-marathon" };
  assert.ok(pendingGiftFor(pendingGiftToStore(race, NOW), A, NOW + 1));
  assert.equal(pendingGiftFor(pendingGiftToStore({ ...terms, target: "0" }, NOW), A, NOW + 1), undefined);
  // A climb with no cadence or no place it started from is refused, as before; with them it comes back.
  const climb = { ...terms, conditionId: "chess-rating", username: "boo_plays", days: "30", target: "1200" };
  assert.equal(pendingGiftFor(pendingGiftToStore(climb, NOW), A, NOW + 1), undefined);
  assert.equal(pendingGiftFor(pendingGiftToStore({ ...climb, cadence: "rapid" }, NOW), A, NOW + 1), undefined);
  assert.ok(pendingGiftFor(pendingGiftToStore({ ...climb, cadence: "rapid", standing: 1100, standingReadAt: new Date(NOW).toISOString() }, NOW), A, NOW + 1));
});
