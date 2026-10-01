import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { GiftRequest } from "../src/client/gift";
import { attemptFor, forgetsAttempt } from "../src/gift-attempt";

/**
 * "Try again" on the funder's page sends the request it already signed (D87). Signing again draws a new salt, which
 * is a new gift to the server; if the first one's money had moved, that could pay for the same gift twice.
 */

const terms = { account: "0x350aF869ABa6ff26AB33517ECd3E38ACaF107761", username: "ama_learns", recipientName: "Léa", funderName: "Maman", goalType: 1, dailyTarget: 10, durationDays: 7, amount: "25000000" };
const request = {
  goalType: 1,
  dailyTarget: 10,
  durationDays: 7,
  amount: "25000000",
  refundTo: terms.account,
  salt: `0x${"01".repeat(32)}`,
  authorization: { validAfter: "0", validBefore: "1", nonce: `0x${"02".repeat(32)}`, v: 27, r: `0x${"03".repeat(32)}`, s: `0x${"04".repeat(32)}` },
} as GiftRequest;

test("the request kept for exactly these terms is sent again, whatever the letter case of the account", () => {
  assert.equal(attemptFor({ terms, request }, terms), request);
  assert.equal(attemptFor({ terms, request }, { ...terms, account: terms.account.toLowerCase() }), request);
});

test("other terms, another account, or anything unreadable sign again", () => {
  for (const other of [{ amount: "26000000" }, { durationDays: 8 }, { recipientName: "Lea" }, { funderName: "Mum" }, { username: "" }, { account: "0x91C964e745ffd6265c75df33cA9137D81c3c454d" }]) {
    assert.equal(attemptFor({ terms, request }, { ...terms, ...other }), undefined, JSON.stringify(other));
  }
  for (const kept of [null, undefined, "", 3, {}, { terms }, { request }, { terms, request: {} }]) {
    assert.equal(attemptFor(kept, terms), undefined, JSON.stringify(kept));
  }
});

test("a refusal of the terms, or a gift already made, ends the kept request; a wait keeps it", () => {
  for (const code of ["ALREADY_MADE", "REFUSED", "TERMS_MISMATCH", "INVALID_AMOUNT", "NO_SUCH_PROFILE"]) assert.equal(forgetsAttempt(code), true, code);
  for (const code of ["IN_PROGRESS", "BEING_RECORDED", "SIGN_IN_REQUIRED", "RATE_LIMITED", "SOURCE_UNAVAILABLE", undefined]) assert.equal(forgetsAttempt(code), false, String(code));
});

test("the funder's page keeps the signed request before sending it, and forgets it once the gift is made", () => {
  const pay = readFileSync("app/components/PayGift.tsx", "utf8");
  // Up to where the gift is made: what follows builds its link and its record on this device.
  const give = pay.slice(pay.indexOf("const give = useCallback"), pay.indexOf("// The gift's link:"));
  assert.ok(give.indexOf("attemptFor(readSession(GIFT_ATTEMPT_KEY), terms)") < give.indexOf("await prepareGift({"), "the kept request is looked for before signing");
  assert.ok(give.indexOf("writeSession(GIFT_ATTEMPT_KEY, { terms, request })") < give.indexOf("await submitGift(request)"), "kept before it is sent");
  assert.match(give, /writeSession\(GIFT_ATTEMPT_KEY, null\);\s*$/, "forgotten once made");
  assert.doesNotMatch(give, /createGift\(/, "never signs again behind the page's back");
});
