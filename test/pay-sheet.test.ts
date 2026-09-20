import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { eurosNeededOn, waysInFor } from "../src/gift-amount";
import { PAY } from "../src/sentences";
import { WAY_IN_CHAIN_COIN, WAY_IN_GIFT_COIN, WAYS_IN } from "../src/rails";

/**
 * Paying for the gift on the card, and the wait while it is made (the rendered mockups pay.html and paying.html of
 * 19 Sep 2026, which are the specification for these two surfaces).
 *
 * What is defended here is what the sheet promises: three lines and no fourth, a figure this person actually pays,
 * the account made at the press and not before, the terms written to the device before the service's page opens,
 * and the second way in still reachable. The old assistant's check screen made the same promises on a page; these
 * tests follow them to where they are said now.
 */

const sheet = readFileSync("app/kit/offer/PaySheet.tsx", "utf8");
const pay = readFileSync("app/components/PayGift.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");

test("three lines, and the third is that Viky keeps nothing", () => {
  assert.equal(PAY.rows.gift("Léa"), "The gift, in Léa's name");
  // No company on the line (the founder, 20 Sep 2026): the person pays by card, and the service is named where it is met.
  assert.equal(PAY.rows.service, "What the card service charges");
  assert.doesNotMatch(PAY.rows.service + PAY.another, /Ramp|Mercuryo/);
  assert.equal(PAY.rows.viky, "Viky takes");
  assert.equal(PAY.nothing, "nothing");
  // True of the code: no rail of ours takes a share, and nothing in the money path adds one.
  for (const way of WAYS_IN) assert.ok(way.fee.percent > 0, `${way.name} publishes its own fee, which is theirs and not ours`);
  assert.doesNotMatch(readFileSync("src/gift-amount.ts", "utf8"), /vikyFee|ourFee|commission/i);
});

test("what this person pays is their own figure, at a dated rate", () => {
  assert.match(sheet, /waysInFor\(short, WAYS_IN, money\.rates\?\.usdPerEur, railIn\)/, "the euros are the offer's, on the way the cost put first");
  assert.match(sheet, /arrivesInDollars\(euros, way, money\.rates\?\.usdPerEur\)/);
  // What the service keeps is measured rather than quoted: what the euros are worth, less what lands.
  assert.match(sheet, /euros \* money\.rates\.usdPerEur - arrives/);
  assert.match(sheet, /W\.atTheRate\(rateDateInWords\(money\.rates\.date\)\)/);
  // The source named, and why a Friday's date stands on a Sunday: the line that looked stale says what it is.
  assert.equal(PAY.atTheRate("18 Sep 2026"), "At the European Central Bank's rate of 18 Sep 2026. It sets one each working day.");
});

test("the account is made at the press, and the sheet says so before it happens", () => {
  assert.match(PAY.passkeyMakesTheAccount, /creates your account when you press pay/);
  assert.match(PAY.passkeyMakesTheAccount, /Nothing was asked of you until now/);
  assert.match(sheet, /W\.passkeyMakesTheAccount/);
  // The passkey opens inside the press, then the terms are written, then the service's page opens: that order.
  const press = sheet.slice(sheet.indexOf("const pay = async"), sheet.indexOf("const line ="));
  assert.ok(press.indexOf("await ensureSigner()") < press.indexOf("savePendingGift("), "the account comes before the terms are kept");
  assert.ok(press.indexOf("savePendingGift(") < press.indexOf("window.open(way.page"), "and the terms before the page that takes the money");
  assert.match(press, /router\.push\("\/fund\?step=paying"\)/, "and the wait takes over");
});

test("the second way in is reachable, and never in front of the action", () => {
  assert.match(sheet, /\{W\.another\}/);
  assert.equal(PAY.another, "Pay by card another way");
  const footer = sheet.slice(sheet.indexOf("footer={"), sheet.indexOf("</Sheet>"));
  assert.ok(footer.indexOf("PRIMARY_BUTTON") < footer.indexOf("W.another"), "the one action comes first");
});

/**
 * Which way in stands in front of the action (D125). The floors are the services' own published figures: 6 EUR at
 * the rail that sells what a gift holds (`minPurchaseAmountEur`), 25 EUR at the rail that sells the chain's coin
 * (`fiat_payment_methods.EUR.limits.min`), both read again on 20 Sep 2026. A published floor above what the gift
 * needs takes that way off the sheet for that gift; the cost orders what is left; a country only ever sends one to
 * the back; and the gift's own minimum never moves.
 */
test("a way in is offered by what this gift needs against its published floor, and the cheapest goes first", () => {
  const rate = 1.1537; // dollars per euro, as the rates route answers it
  const serves = { Ramp: "unknown", Mercuryo: "serves" } as const;

  // Ten dollars: 12 EUR at the euro rail (8.67 of money plus their 2.49 minimum), above its 6 EUR floor; the chain
  // rail would need 10 EUR, under its 25 EUR floor, so it is not offered for this gift.
  const ten = waysInFor(10_000_000n, WAYS_IN, rate, serves);
  assert.deepEqual(ten.map((offer) => [offer.way.name, offer.euros, offer.atFloor]), [["Ramp", 12, false]]);
  assert.equal(eurosNeededOn(10_000_000n, WAY_IN_CHAIN_COIN, rate), 10);

  // Forty dollars: both floors are met, and the one that asks fewer euros for the same gift goes first.
  const forty = waysInFor(40_000_000n, WAYS_IN, rate, serves);
  assert.deepEqual(forty.map((offer) => offer.way.name), ["Ramp", "Mercuryo"]);
  assert.ok(forty[0].euros! < forty[1].euros!, `${forty[0].euros} against ${forty[1].euros}`);

  // A country never hides a way: the euro rail saying it does not serve there sends it to the back, and no further.
  const senegal = waysInFor(40_000_000n, WAYS_IN, rate, { Ramp: "does-not", Mercuryo: "serves" });
  assert.deepEqual(senegal.map((offer) => offer.way.name), ["Mercuryo", "Ramp"]);

  // One dollar: under every floor. The gift's minimum does not move; the lowest floor is what is paid, and said so.
  const one = waysInFor(1_000_000n, WAYS_IN, rate, serves);
  assert.deepEqual(one.map((offer) => [offer.way.name, offer.euros, offer.atFloor]), [["Ramp", 6, true]]);
  assert.equal(eurosNeededOn(1_000_000n, WAY_IN_GIFT_COIN, rate), 4, "what it needs, before the floor");
  assert.match(PAY.floor(6), /takes nothing under 6 EUR, so that is what you pay/);

  // No rate read: the euro rail's figure needs one, so it is kept without a figure, after the way that has one.
  const noRate = waysInFor(40_000_000n, WAYS_IN, undefined, serves);
  assert.deepEqual(noRate.map((offer) => [offer.way.name, offer.euros]), [["Mercuryo", 39], ["Ramp", undefined]]);

  // Nothing short: every way, at nothing, in the register's order.
  assert.deepEqual(waysInFor(0n, WAYS_IN, rate, serves).map((offer) => [offer.way.name, offer.euros]), [["Ramp", 0], ["Mercuryo", 0]]);
});

test("the sheet stands where the mockup stands it, and the wait is the whole screen", () => {
  assert.match(css, /dialog\.sheet-tall \{\s*\n\s*max-height: 82dvh;/, "a sheet with more to say stops at 82 per cent");
  assert.match(sheet, /tall\n/, "and this is that sheet");
  // The wait: the ring at the size paying.html draws it, what is being done in the title face, and the gift under it.
  assert.match(css, /\.working-ring-large \{[\s\S]*?width: 54px;/);
  assert.match(pay, /<Working says=\{phase === "converting" \? W\.arrived\.gettingReady : P\.putting\(gift, recipient\)\} and=\{P\.takesSeconds\} large \/>/);
  assert.match(pay, /<MiniGift recipient=\{recipient\}/);
  assert.equal(PAY.putting("$30.00", "Noah"), "Putting $30.00 in Noah's name.");
  assert.match(PAY.takesSeconds, /You can close this page/);
});

test("paying starts on the card, and the old way in to it is gone", () => {
  // The check screen with its two cards of figures, the separate account step and the review rows are all gone:
  // one surface asks for the money now, and it is the sheet over the card.
  for (const said of ["W.check.payingWith", "W.check.payWithFor", "W.account.title", "orderRails"]) {
    assert.ok(!pay.includes(said), `the paying screen still carries ${said}`);
  }
  assert.match(pay, /O\.nothingToPay\.title/, "somebody who lands there with nothing running is sent back to the card");
});
