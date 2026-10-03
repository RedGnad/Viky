import assert from "node:assert/strict";
import test from "node:test";
import { conversionUse, mobileMoneyUse, momentInWords } from "../src/judges-first-use";
import { countryInWords } from "../src/university-shown";

// What the judges page says of mobile money and of Rampnow (the founder, 3 Oct 2026): switched off, open and unused,
// then the first use as it happened, with the transactions a judge can open.

const DEPOSIT = `0x${"d0".repeat(32)}`;
const EXIT = `0x${"e1".repeat(32)}`;
const at = new Date("2026-10-03T14:05:41.000Z");

test("a moment is written the way the rest of the page writes it, in UTC", () => {
  assert.equal(momentInWords(at), "3 Oct 2026, 14:05 UTC");
});

test("mobile money: switched off, unread, open and unused, then its first payout", () => {
  assert.equal(mobileMoneyUse(false, null, countryInWords).words, "Switched off on this deployment, so it is offered nowhere.");
  assert.equal(mobileMoneyUse(true, null, countryInWords).words, "Open. The payouts could not be read right now.");
  assert.deepEqual(mobileMoneyUse(true, { count: 0, first: null }, countryInWords), { words: "Open. Nobody has used it yet.", transactions: [] });
  const first = { at, localAmount: 5892.17, localCurrency: "XOF", units: 10_000_000n, country: "SN", network: "ORANGE", depositTx: DEPOSIT, exitTx: EXIT };
  const once = mobileMoneyUse(true, { count: 1, first }, countryInWords);
  assert.equal(once.words, "Open. Used once. The first arrived on 3 Oct 2026, 14:05 UTC: 5 892 F ($10.00) to a number on Orange, in Senegal.");
  assert.deepEqual(once.transactions, [
    { label: "its dollars sent to Switch", hash: DEPOSIT },
    { label: "the exchange that made them", hash: EXIT },
  ]);
  // Before Switch has said which transaction brought it the dollars, only the exchange is shown.
  const more = mobileMoneyUse(true, { count: 3, first: { ...first, depositTx: null, network: "MTN", country: "CI" } }, countryInWords);
  assert.equal(more.words, "Open. Used 3 times. The first arrived on 3 Oct 2026, 14:05 UTC: 5 892 F ($10.00) to a number on MTN, in Côte d’Ivoire.");
  assert.deepEqual(more.transactions, [{ label: "the exchange that made them", hash: EXIT }]);
});

test("Rampnow: switched off, unread, open and unused, then its first conversion", () => {
  assert.equal(conversionUse(false, null).words, "Switched off on this deployment.");
  assert.equal(conversionUse(true, null).words, "Open. The conversions could not be read right now.");
  assert.deepEqual(conversionUse(true, { count: 0, first: null }), { words: "Open. Nobody has used it yet.", transactions: [] });
  const first = conversionUse(true, { count: 1, first: { at, amount: 14_935_075n, minOut: 14_785_724n, txHash: EXIT } });
  assert.equal(first.words, "Open. Used once. The first conversion was sent on 3 Oct 2026, 14:05 UTC: $14.93 of USDC, for at least $14.78 of AUSD.");
  assert.deepEqual(first.transactions, [{ label: "the conversion", hash: EXIT }]);
});
