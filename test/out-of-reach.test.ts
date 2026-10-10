// An amount is marked "More than you have" only when its face value alone surely is (the founder, 28 Sep 2026).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { surelyOutOfReach } from "../src/out-of-reach";
import type { Rates } from "../src/rates";

// 1 EUR = 655.957 XOF (the CFA peg), 1 USD = 0.87 EUR: 1 USD is about 570.68 XOF.
const rates = { date: "2026-09-28", usdPerEur: 1 / 0.87, eurPerUsd: 0.87, eurPer: { XOF: 655.957, EUR: 1 } } as unknown as Rates;

test("a face value above what the person holds is out of reach; one below or near it is left to its exact price", () => {
  const held = 3_000_000n; // $3.00
  assert.equal(surelyOutOfReach(2000, "XOF", held, rates), true, "2,000 XOF is about $3.50");
  assert.equal(surelyOutOfReach(1000, "XOF", held, rates), false, "about $1.75");
  assert.equal(surelyOutOfReach(1700, "XOF", held, rates), false, "about $2.98, near: its price decides");
  assert.equal(surelyOutOfReach(5, "USD", held, rates), true);
  assert.equal(surelyOutOfReach(3, "usd", held, rates), false);
});

test("without a rate for the currency nothing is marked, and nothing is hidden", () => {
  assert.equal(surelyOutOfReach(99999, "NGN", 1n, rates), false);
  assert.equal(surelyOutOfReach(10, "XOF", 1n, undefined), false);
  // The amounts of both screens are the kit's own since 10 Oct 2026 (app/kit/SpendChoice.tsx).
  const amounts = readFileSync("app/kit/SpendChoice.tsx", "utf8");
  assert.match(amounts, /disabled=\{busy \|\| beyond\}/, "the package is shown and disabled, not filtered out");
  assert.match(amounts, /\{beyond \? <span className="block text-\[length:var\(--type-help\)\]">\{words\.outOfReach\}<\/span> : null\}/);
  for (const file of ["app/components/GiftCardOut.tsx", "app/components/PhoneTopUp.tsx"]) {
    const screen = readFileSync(file, "utf8");
    assert.match(screen, /<SpendChoice/, file);
    assert.match(screen, /outOfReach: W\.outOfReach/, file);
  }
});

test("the country is chosen in a sheet with Viky's own list, no longer a native select", () => {
  const picker = readFileSync("app/kit/CountryPicker.tsx", "utf8");
  assert.doesNotMatch(picker, /<select/);
  assert.match(picker, /<Sheet /);
  assert.match(picker, /<ChoiceList/);
  assert.match(picker, /type="search"/);
});
