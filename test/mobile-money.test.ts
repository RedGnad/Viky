import assert from "node:assert/strict";
import test from "node:test";
import { localInWords, mobileMoneyOn, numberEnd, operatorInWords, operatorsInWords, phaseOf, settled } from "../src/mobile-money";
import { orderUses, usesFor, usesSentence } from "../src/use-money";

test("the way is off unless it is switched on and the key is there", () => {
  assert.equal(mobileMoneyOn({}), false);
  assert.equal(mobileMoneyOn({ MOBILE_MONEY_OUT: "on" }), false, "no key");
  assert.equal(mobileMoneyOn({ SWITCH_SERVICE_KEY: "k" }), false, "off at the merge");
  assert.equal(mobileMoneyOn({ MOBILE_MONEY_OUT: "1", SWITCH_SERVICE_KEY: "k" }), false, "only the word on");
  assert.equal(mobileMoneyOn({ MOBILE_MONEY_OUT: "on", SWITCH_SERVICE_KEY: "k" }), true);
});

test("an operator is said as Switch names it, an acronym kept, a name capitalised, nothing added", () => {
  assert.equal(operatorInWords("ORANGE"), "Orange");
  assert.equal(operatorInWords("WAVE"), "Wave");
  assert.equal(operatorInWords("MTN"), "MTN");
  assert.equal(operatorInWords("MOOV"), "Moov");
  assert.equal(operatorsInWords(["ORANGE", "WAVE"]), "Orange or Wave");
  assert.equal(operatorsInWords(["ORANGE", "MTN", "MOOV"]), "Orange, MTN or Moov");
  assert.equal(operatorsInWords(["MPESA"]), "Mpesa");
});

test("a CFA franc amount is written as it is said there, cut down to the franc; another currency keeps its code", () => {
  assert.equal(localInWords(6540.92, "XOF"), "6 540 F");
  assert.equal(localInWords(587.13, "XAF"), "587 F");
  assert.equal(localInWords(1_234_567, "XOF"), "1 234 567 F");
  assert.equal(localInWords(120.567, "GHS"), "120.56 GHS");
  assert.equal(numberEnd("+221 77 123 45 67"), "4567");
});

test("Switch's states become the four a person is told, and a state it may add is never arrived", () => {
  const sent = { depositSent: true, expired: false };
  assert.equal(phaseOf("COMPLETED", sent), "arrived");
  for (const status of ["FAILED", "REVERSED", "BLOCKED"]) assert.equal(phaseOf(status, sent), "failed");
  for (const status of ["PROCESSING", "SCHEDULED", "SOMETHING_NEW"]) assert.equal(phaseOf(status, sent), "waiting");
  assert.equal(phaseOf("AWAITING_DEPOSIT", { depositSent: false, expired: true }), "expired");
  assert.equal(phaseOf("AWAITING_DEPOSIT", { depositSent: true, expired: true }), "waiting", "sent, Switch has not seen it yet");
  assert.equal(settled("waiting"), false);
  assert.equal(settled("arrived"), true);
});

test("mobile money is offered only where its coverage says, and then it comes first", () => {
  assert.deepEqual(usesFor("sn", {}, true, true, true), ["mobile", "phone", "giftcard", "bank", "card"]);
  assert.deepEqual(usesFor("sn", {}, true, true, false).includes("mobile"), false);
  assert.deepEqual(usesFor(null, {}, true, true, true).includes("mobile"), false, "no country, no corridor");
  const ordered = orderUses(["mobile", "phone", "giftcard"], 20, () => undefined);
  assert.equal(ordered[0], "mobile");
  assert.equal(usesSentence(["mobile", "phone"]), "Cash on your mobile money or credit for your phone.");
});

test("Switch's time is said in words that never break at a hyphen", async () => {
  const { delayInWords } = await import("../src/mobile-money");
  assert.equal(delayInWords("5-10 minutes"), "5 to 10 minutes");
  assert.equal(delayInWords("30 - 120 seconds"), "30 to 120 seconds");
  assert.equal(delayInWords("Same day"), "Same day");
});

test("the two ceilings: $200 a payout, $500 a day per account, each refused by its sentence, and the most one payout may be now", async () => {
  const { ceilingProblem, mostNow, MOBILE_CEILINGS, MOBILE_REFUSALS } = await import("../src/mobile-money");
  assert.deepEqual(MOBILE_CEILINGS, { usdPerPayout: 200, usdPerAccountPerDay: 500 });
  assert.equal(ceilingProblem(200_000_000n, 0n), null);
  assert.equal(ceilingProblem(200_000_001n, 0n), "One payout can be $200.00 at most for now. Nothing was taken.");
  assert.equal(ceilingProblem(150_000_000n, 400_000_000n), "Up to $500.00 a day can go to mobile money for now, and $400.00 already went today. Nothing was taken.");
  assert.equal(ceilingProblem(100_000_000n, 400_000_000n), null);
  assert.equal(mostNow(0n), 200_000_000n);
  assert.equal(mostNow(420_000_000n), 80_000_000n);
  assert.equal(mostNow(520_000_000n), 0n);
  assert.equal(MOBILE_REFUSALS.dayReached(), "You have sent $500.00 to mobile money today, the most for a day. It opens again tomorrow.");
});
