import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { eurosNeededOn, roughlyInDollars, serviceChargeDollars, serviceChargeEur, serviceChargeIsCeiling, wayInFor } from "../src/gift-amount";
import { PAY } from "../src/sentences";
import { WAY_IN_CHAIN_COIN, WAY_IN_GIFT_COIN, WAYS_IN, type WayIn } from "../src/rails";

/**
 * Paying for the gift on the card, and the wait while it is made (the rendered mockups pay.html and paying.html of
 * 19 Sep 2026, which are the specification for these two surfaces).
 *
 * What is defended here is what the sheet promises: three lines and no fourth, a figure this person actually pays,
 * the account made at the press and not before, the terms written to the device before the service's page opens,
 * and one way in, chosen for the person, with a sentence when it is not the first (D239). The old assistant's check
 * screen made the same promises on a page; these tests follow them to where they are said now.
 */

const sheet = readFileSync("app/kit/offer/PaySheet.tsx", "utf8");
const pay = readFileSync("app/components/PayGift.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");

test("three lines, and the third is that Viky keeps nothing", () => {
  assert.equal(PAY.rows.gift("Léa"), "The gift, in Léa's name");
  // No company on the line (the founder, 20 Sep 2026): the person pays by card, and the service is named where it is met.
  assert.equal(PAY.rows.service, "What the card service charges");
  assert.doesNotMatch(PAY.rows.service + PAY.pay + PAY.payEuros(29), /Ramp|Mercuryo/);
  assert.equal(PAY.rows.viky, "Viky takes");
  assert.equal(PAY.nothing, "nothing");
  // True of the code: no rail of ours takes a share, and nothing in the money path adds one.
  for (const way of WAYS_IN) assert.ok(way.fee.percent > 0, `${way.name} publishes its own fee, which is theirs and not ours`);
  assert.doesNotMatch(readFileSync("src/gift-amount.ts", "utf8"), /vikyFee|ourFee|commission/i);
});

test("what this person pays is their own figure, at a dated rate", () => {
  assert.match(sheet, /wayInFor\(short, WAYS_IN, money\.rates\?\.usdPerEur, railIn\)/, "the euros are the offer's, on the one way chosen for the person");
  assert.match(sheet, /serviceChargeDollars\(euros, way, money\.rates\?\.usdPerEur\)/, "and what the service charges is its own published figure on that way");
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
  assert.ok(press.indexOf("savePendingGift(") < press.indexOf("window.open(wayInPage(way"), "and the terms before the page that takes the money");
  assert.match(press, /router\.push\("\/fund\?step=paying"\)/, "and the wait takes over");
});

test("one way in, one action, and no button to another (D239)", () => {
  assert.ok(!("another" in PAY), "the second way is not a choice any more");
  assert.doesNotMatch(sheet, /another way|SECONDARY_BUTTON|setChosen/);
  // The footer only, from its opening to its fragment's close: the body's small keys are not actions (D294's copy).
  const footer = sheet.slice(sheet.indexOf("footer={"), sheet.indexOf("</>", sheet.indexOf("footer={")));
  assert.equal((footer.match(/<button/g) ?? []).length, 1, "the one action, and nothing under it but a refusal or the account panel");
  // The one other button of the sheet copies the code, as a small key (D294), never a second action.
  const body = sheet.slice(sheet.indexOf("</>", sheet.indexOf("footer={")), sheet.indexOf("</Sheet>"));
  assert.equal((body.match(/<button/g) ?? []).length, 1);
  assert.match(body, /className=\{`\$\{INLINE_BUTTON\} self-start`\}/);
  // The sentence is the one place the sheet names the two services: which refused, why, and which this goes through.
  assert.equal(PAY.instead.country("Ramp", "Mercuryo"), "Ramp does not serve your country, so this goes through Mercuryo.");
  assert.equal(PAY.instead.paused("Ramp", "Mercuryo"), "Ramp is not selling right now, so this goes through Mercuryo.");
  assert.equal(PAY.instead.floor("Ramp", 6, "Mercuryo"), "Ramp takes nothing under 6 EUR, so this goes through Mercuryo.");
  assert.match(sheet, /\{offer\.insteadOf && !enough \? <p className=\{HELP\}>\{insteadSentence\(offer\)\}<\/p> : null\}/, "said on the sheet, and only while there is something to pay");
  // The device's language goes with the call itself; the sheet passes nothing as if it were an answer from the person.
  assert.match(sheet, /whereTheRailsServe\(\)/);
});

/**
 * Which way in stands in front of the action (D239, replacing the ordering of D125). The floors are the services' own
 * published figures: 6 EUR at the rail that sells what a gift holds (`minPurchaseAmountEur`), 25 EUR at the rail that
 * sells the chain's coin (`fiat_payment_methods.EUR.limits.min`), both read again on 20 Sep 2026. The first way stands
 * unless it refuses by country, by its own asset list or by its floor; then the next one, and the offer says why.
 */
test("the first way stands unless it refuses; then the next, and the offer says which refused and why", () => {
  const rate = 1.1537; // dollars per euro, as the rates route answers it
  const france = { Ramp: "serves", Mercuryo: "serves" } as const;
  const senegal = { Ramp: "does-not", Mercuryo: "serves" } as const;
  const names = (offer: ReturnType<typeof wayInFor>) => [offer.way.name, offer.euros, offer.atFloor, offer.insteadOf?.because];

  // Ten dollars in France: 12 EUR at the euro rail (8.67 of money plus their 2.49 minimum), above its 6 EUR floor.
  assert.deepEqual(names(wayInFor(10_000_000n, WAYS_IN, rate, france)), ["Ramp", 12, false, undefined]);
  // Forty dollars: the same rail (34.67 EUR of money and their 2.49 minimum, 38 whole euros), whatever the other
  // would cost; nothing is compared any more.
  assert.deepEqual(names(wayInFor(40_000_000n, WAYS_IN, rate, france)), ["Ramp", 38, false, undefined]);
  // A silence is not a refusal: with nothing read about either, the first stands.
  assert.deepEqual(names(wayInFor(40_000_000n, WAYS_IN, rate, {})), ["Ramp", 38, false, undefined]);

  // The euro rail's own list says it does not sell in Senegal: the chain rail, from its 25 EUR floor, and the sentence.
  assert.deepEqual(names(wayInFor(40_000_000n, WAYS_IN, rate, senegal)), ["Mercuryo", 39, false, "country"]);
  // Ten dollars there: 10 EUR is under the chain rail's floor, so its floor is paid, and both sentences are said.
  assert.equal(eurosNeededOn(10_000_000n, WAY_IN_CHAIN_COIN, rate), 10);
  assert.deepEqual(names(wayInFor(10_000_000n, WAYS_IN, rate, senegal)), ["Mercuryo", 25, true, "country"]);
  // The euro rail's own asset list has switched the coin off: the same fall back, said as a pause.
  assert.deepEqual(names(wayInFor(40_000_000n, WAYS_IN, rate, { Ramp: "paused", Mercuryo: "serves" })), ["Mercuryo", 39, false, "paused"]);
  // Every way shut by the country: a country is a guess, so the first stands and nothing is said.
  assert.deepEqual(names(wayInFor(40_000_000n, WAYS_IN, rate, { Ramp: "does-not", Mercuryo: "does-not" })), ["Ramp", 38, false, undefined]);

  // One dollar: under every floor. The gift's minimum does not move; the lowest floor is what is paid, and said so.
  assert.deepEqual(names(wayInFor(1_000_000n, WAYS_IN, rate, france)), ["Ramp", 6, true, undefined]);
  assert.equal(eurosNeededOn(1_000_000n, WAY_IN_GIFT_COIN, rate), 4, "what it needs, before the floor");
  assert.match(PAY.floor(6), /takes nothing under 6 EUR, so that is what you pay/);
  // A floor can send a gift to the next way too: a register whose first floor is the higher one, for the rule's sake.
  const higherFirst: readonly [WayIn, WayIn] = [WAY_IN_CHAIN_COIN, WAY_IN_GIFT_COIN];
  assert.deepEqual(names(wayInFor(10_000_000n, higherFirst, rate, france)), ["Ramp", 12, false, "floor"]);

  // No rate read: the euro rail's figure needs one, so it stands without a figure rather than giving way.
  assert.deepEqual(names(wayInFor(40_000_000n, WAYS_IN, undefined, france)), ["Ramp", undefined, false, undefined]);
  // Nothing short: the first, at nothing.
  assert.deepEqual(names(wayInFor(0n, WAYS_IN, rate, france)), ["Ramp", 0, false, undefined]);
});

/**
 * "What the card service charges" is that service's own published figure at this amount (D239). The line used to print
 * what the euros were worth at the day's rate less what the chain-coin measurement of 14 Sep 2026 said would arrive:
 * two days' prices subtracted, negative as often as not, and `Math.max(0, ...)` printed "about $0.00" on a rail that
 * keeps 3.8 %. At the ECB's rate of 24 Sep 2026 the old figure for 29 EUR is below zero, which is the case the
 * founder saw.
 */
test("the charge line prints the way's own published fee, and never zero on a rail that keeps a share", () => {
  const rate = 1.1367; // the ECB's of 24 Sep 2026
  assert.ok(29 * rate - roughlyInDollars(29) < 0, "the old formula: two measurements subtracted, under zero that day");
  assert.doesNotMatch(sheet, /usdPerEur - arrives|Math\.max\(0/, "and it is gone from the sheet");
  for (const way of WAYS_IN) {
    assert.ok(way.fee.percent > 0, `${way.name} publishes a share`);
    for (const euros of [way.smallestEur, 29, 100]) {
      assert.ok(serviceChargeEur(euros, way.fee) > 0, `${way.name} at ${euros} EUR keeps something`);
      assert.ok(serviceChargeDollars(euros, way, rate)! > 0, `${way.name} at ${euros} EUR is never printed as nothing`);
    }
  }
  // The chain rail: 3.8 % of 29 EUR is 1.10 EUR, $1.25 at that rate. The euro rail: its 2.49 EUR minimum, $2.83.
  assert.equal(serviceChargeDollars(29, WAY_IN_CHAIN_COIN, rate), 1.25);
  assert.equal(serviceChargeDollars(29, WAY_IN_GIFT_COIN, rate), 2.83);
  // At 100 EUR the euro rail's share, published as "up to 3.9 %", is larger than its minimum: the ceiling, and said so.
  assert.equal(serviceChargeDollars(100, WAY_IN_GIFT_COIN, rate), 4.43);
  assert.equal(serviceChargeIsCeiling(100, WAY_IN_GIFT_COIN.fee), true);
  assert.equal(serviceChargeIsCeiling(29, WAY_IN_GIFT_COIN.fee), false, "the minimum is exact, so 'about'");
  assert.equal(serviceChargeIsCeiling(100, WAY_IN_CHAIN_COIN.fee), false, "a rate published as the rate itself");
  assert.equal(PAY.upToDollars(4.43), "up to $4.43");
  assert.match(sheet, /serviceChargeIsCeiling\(euros, way\.fee\) \? W\.upToDollars\(charge\) : W\.aboutDollars\(charge\)/);
  assert.equal(serviceChargeDollars(29, WAY_IN_CHAIN_COIN, undefined), undefined, "no rate, no figure, never a guess");
  assert.equal(serviceChargeEur(0, WAY_IN_GIFT_COIN.fee), 0, "nothing paid, nothing charged");
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
