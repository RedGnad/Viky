import assert from "node:assert/strict";
import test from "node:test";
import { PENDING_GIFT_MAX_AGE_MS, pendingGiftFor, pendingGiftToStore } from "../src/pending-gift";

/**
 * The gift a funder set up before paying survives the session closing (D74). On 15 Sep the card payment took twelve
 * minutes, the session closed after ten, and the payment sat in the account with no gift made from it.
 */

const A = "0x350aF869ABa6ff26AB33517ECd3E38ACaF107761";
const B = "0x91C964e745ffd6265c75df33cA9137D81c3c454d";
const NOW = Date.UTC(2026, 8, 15, 20, 13);
const terms = { account: A, username: "ama_learns", dollars: "25", days: "7", target: "10" };

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

test("anything unreadable, or terms the gift would refuse, is not picked up", () => {
  for (const raw of [null, "", "{", "null", "[]", JSON.stringify(terms), JSON.stringify({ ...terms, savedAtMs: "x" })]) {
    assert.equal(pendingGiftFor(raw, A, NOW), undefined, String(raw));
  }
  for (const bad of [{ dollars: "1e3" }, { dollars: "0" }, { days: "6" }, { target: "0" }, { username: 3 }]) {
    const raw = JSON.stringify({ ...terms, account: A.toLowerCase(), savedAtMs: NOW, ...bad });
    assert.equal(pendingGiftFor(raw, A, NOW), undefined, JSON.stringify(bad));
  }
});
