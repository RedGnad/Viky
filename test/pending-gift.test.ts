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
const terms = { account: A, recipientName: "Léa", funderName: "Maman", conditionId: "duolingo-daily", username: "ama_learns", dollars: "25", days: "7", target: "10" };

test("the gift set up before paying comes back for the account that set it up", () => {
  const stored = pendingGiftToStore(terms, NOW);
  // Twelve minutes later, which is how long the payment of 15 Sep took, with the session long closed.
  const back = pendingGiftFor(stored, A, NOW + 12 * 60_000);
  assert.deepEqual(back, { ...terms, account: A.toLowerCase(), savedAtMs: NOW });
  assert.deepEqual(pendingGiftFor(stored, A.toLowerCase(), NOW + 1), back, "whatever the letter case of the identifier");
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
  const fund = readFileSync("app/components/FundGift.tsx", "utf8");
  assert.match(fund, /<AccountPanel returning signInOnly \/>/);
  const panel = readFileSync("app/components/AccountPanel.tsx", "utf8");
  assert.match(panel, /className=\{returning \? PRIMARY_BUTTON : SECONDARY_BUTTON\}/, "sign in leads when somebody comes back");
  assert.match(panel, /className=\{returning \? SECONDARY_BUTTON : PRIMARY_BUTTON\}/, "and making an account follows it");
});

/** What is kept is what the gift is made from, and nothing else: D72 asks for no contact, so none is kept or sent. */
test("the terms kept are exactly the terms the gift is made from", () => {
  const fund = readFileSync("app/components/FundGift.tsx", "utf8");
  const kept = fund.slice(fund.indexOf("savePendingGift({"), fund.indexOf("}),", fund.indexOf("savePendingGift({")));
  for (const field of ["recipientName: recipient", "funderName: funder", "conditionId: condition?.id", "username: draft.username.trim()", "dollars", "days: draft.days", "target: draft.target", "course: draft.course"]) {
    assert.ok(kept.includes(field), `the device keeps ${field}`);
  }
  const call = fund.slice(fund.indexOf("await prepareGift({"), fund.indexOf("const record: Made"));
  assert.match(call, /duolingoUsername: terms\.username \|\| undefined/);
  assert.match(call, /recipientName: recipient/);
  assert.match(call, /funderName: funder/);
  // Since U1 the goal type is part of the terms signed, because a gift counted on one course is its own goal.
  assert.match(call, /goalType: terms\.goalType/);
  assert.match(call, /course: terms\.course \|\| undefined/);
  assert.match(call, /dailyTarget: daily\.target/);
  assert.match(call, /durationDays: length\.days/);
  assert.match(call, /amount: amount\.units/);
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
