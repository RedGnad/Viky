import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { AmountError, dollarsToUnits, MAX_GIFT_UNITS, MIN_GIFT_UNITS, PILOT_CAP_SENTENCE } from "../src/money";
import { MILESTONE_MAX_AMOUNT, MILESTONE_MIN_AMOUNT } from "../src/milestone-protocol";
import { FUND } from "../src/sentences";

/**
 * The pilot's ceiling, a thousand dollars a gift (mitigation b, 19 Sep 2026).
 *
 * It is held off chain on purpose: both contracts keep their own hundred thousand and neither is redeployed. What
 * these tests defend is that the bound is real on every path a gift can be made through, and that the sentence a
 * funder reads is the same rule, because a screen that says a thousand while a route takes more is the failure.
 */

const AUSD = 1_000_000n;

test("a thousand dollars passes and a cent more does not", () => {
  assert.equal(MAX_GIFT_UNITS, 1_000n * AUSD);
  assert.equal(dollarsToUnits("1000"), MAX_GIFT_UNITS);
  assert.equal(dollarsToUnits("1000.00"), MAX_GIFT_UNITS);
  assert.throws(() => dollarsToUnits("1000.01"), (error: unknown) => error instanceof AmountError && error.message === PILOT_CAP_SENTENCE);
  assert.throws(() => dollarsToUnits("5000"), (error: unknown) => error instanceof AmountError && error.message === PILOT_CAP_SENTENCE);
  // The floor is untouched, and it is still the contract's own.
  assert.equal(dollarsToUnits("1"), MIN_GIFT_UNITS);
  assert.throws(() => dollarsToUnits("0.99"), AmountError);
});

test("every way of making a gift refuses more than a thousand, including the daily one", () => {
  assert.equal(MILESTONE_MAX_AMOUNT, MAX_GIFT_UNITS, "a climb and a certificate are bounded like everything else");
  assert.equal(MILESTONE_MIN_AMOUNT, MIN_GIFT_UNITS);
  for (const route of ["app/api/gift/milestone/create/route.ts", "app/api/gift/certificate/create/route.ts"]) {
    const source = readFileSync(route, "utf8");
    assert.match(source, /MILESTONE_MAX_AMOUNT/, route);
    assert.match(source, /between \$1\.00 and \$1,000\.00/, `${route} says the bound it enforces`);
    assert.doesNotMatch(source, /\$100,000\.00/, `${route} must not still promise a hundred thousand`);
  }
  // The daily route had a floor and no ceiling until today: only the contract stood above it.
  const daily = readFileSync("app/api/gift/create/route.ts", "utf8");
  assert.match(daily, /amount > MAX_GIFT_UNITS/, "the daily route has a ceiling of its own");
  assert.match(daily, /between \$1\.00 and \$1,000\.00/);
});

test("the contracts keep their own hundred thousand, and nothing here pretends to change it", () => {
  for (const contract of ["contracts/GiftEscrow.sol", "contracts/MilestoneGift.sol"]) {
    const source = readFileSync(contract, "utf8");
    assert.match(source, /uint256 public constant MAX_AMOUNT = 100_000_000_000;/, `${contract} is unchanged`);
  }
  assert.ok(MAX_GIFT_UNITS < 100_000_000_000n, "the product's bound sits under the contract's, so the contract never has to refuse");
});

test("the funder reads the rule where the amount is chosen, in the words the refusal uses", () => {
  assert.equal(PILOT_CAP_SENTENCE, "During the pilot, a gift is at most $1,000.");
  assert.equal(FUND.amount.pilotCap, PILOT_CAP_SENTENCE, "the step and the field say one thing, not two");
  // Said where the amount is typed, when it is typed past the ceiling: the card reads the refusal the money module
  // throws and prints it under the figure (D138). It was a standing notice under the action until then, which spent
  // a line of every card on a rule almost nobody meets.
  const card = readFileSync("app/kit/offer/OfferCard.tsx", "utf8");
  assert.match(card, /amountRefusal = error instanceof AmountError \? error\.message : undefined/);
  assert.match(card, /\{amountRefusal \? <span className=\{`block \$\{HELP\} text-\[var\(--on-surface\)\]`\}>\{amountRefusal\}<\/span> : null\}/);
  assert.doesNotMatch(card, /PILOT_CAP_SENTENCE/, "and never as a line that is always there");
});
