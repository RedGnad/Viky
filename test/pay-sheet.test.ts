import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { chainMarginEur, eurosNeededOn, roughlyInDollars, serviceChargeDollars, serviceChargeEur, serviceChargeIsCeiling, wayInFor } from "../src/gift-amount";
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
  assert.match(sheet, /wayInFor\(short, waysIn\(\), money\.rates\?\.usdPerEur, railIn\)/, "the euros are the offer's, on the one way chosen for the person");
  assert.match(sheet, /serviceChargeDollars\(euros, way, money\.rates\?\.usdPerEur\)/, "and what the service charges is its own published figure on that way");
  assert.match(sheet, /W\.atTheRate\(rateDateInWords\(money\.rates\.date\)\)/);
  // The source named, and why a Friday's date stands on a Sunday: the line that looked stale says what it is.
  assert.equal(PAY.atTheRate("18 Sep 2026"), "At the European Central Bank's rate of 18 Sep 2026. It sets one each working day.");
});

test("the account is made at the press, and the sheet says so before it happens", () => {
  assert.match(PAY.passkeyMakesTheAccount, /creates your account when you press pay/);
  assert.match(PAY.passkeyMakesTheAccount, /Nothing was asked of you until now/);
  // Said only where it is true: a device that remembers a passkey opens it, and makes nothing.
  assert.match(sheet, /\{address \|\| hasCredential \? W\.signedIn : W\.passkeyMakesTheAccount\}/);
  // The passkey opens inside the press, then the terms are written, then the service's page opens: that order.
  const press = sheet.slice(sheet.indexOf("const pay = async"), sheet.indexOf("const signInFirst ="));
  assert.ok(press.indexOf("await ensureAccount()") > 0 && press.indexOf("await ensureAccount()") < press.indexOf("savePendingGift("), "the account comes before the terms are kept");
  assert.ok(press.indexOf("savePendingGift(") < press.indexOf("window.open(wayInPage(way"), "and the terms before the page that takes the money");
  assert.match(press, /router\.push\("\/fund\?step=paying"\)/, "and the wait takes over");
  assert.doesNotMatch(sheet, /ensureSigner/, "the press never asks for a passkey that may not exist");
});

/**
 * What the sentence above rests on (the audit of 1 Oct 2026, P-01). The press used to call `ensureSigner`, which only
 * opens a passkey that exists: on a new device the system asked for one that was not there, the sheet said "That did
 * not go through", and making the account from the panel under it shut the sheet. Seven presses and two system
 * sheets, where the sheet promised one. test/browser/first-payment.spec.ts walks it; this pins the three cases.
 */
test("ensureAccount opens the key, signs in with a remembered passkey, or makes one, and tells the server each time", () => {
  const provider = readFileSync("src/account/provider.tsx", "utf8");
  const made = provider.slice(provider.indexOf("const ensureAccount = useCallback"), provider.indexOf("const value = useMemo"));
  assert.match(made, /const open = mera\.currentAccount\(\);/, "the key already open is used as it is");
  assert.match(made, /if \(!open\) await withTimeout\(existing \|\| mera\.hasStoredCredential\(\) \? mera\.signIn\(\) : mera\.createAccount\(""\), CEREMONY_TIMEOUT_MS\);/);
  assert.match(made, /if \(!open \|\| account\.address !== serverSessionFor\) await withTimeout\(signInToServer\(account\), SERVER_TIMEOUT_MS\);/);
  assert.match(made, /const failure = toAccountError\(caught\);\s+setError\(failure\);\s+throw failure;/, "a failure is the typed error, thrown again");
  // A key this opened is closed again when the server could not be told: nobody stands signed in on no session.
  assert.match(made, /if \(!open\) \{\s+mera\.signOut\(\);\s+setServerSessionFor\(undefined\);\s+\}/);
  // Somebody whose passkey is on another device: asked for it, never given a second account.
  assert.equal(PAY.alreadyHaveAccount, "I already have an account");
  assert.match(sheet, /\{!address && !hasCredential \? \(\s+<button type="button" className=\{`\$\{INLINE_BUTTON\} self-start`\}[^>]*onClick=\{\(\) => void signInFirst\(\)\}>/);
  assert.match(sheet, /await ensureAccount\(\{ existing: true \}\);/);
});

test("Home keeps the pay sheet across the account being made, and the page it is drawing until the wait", () => {
  const home = readFileSync("app/kit/Home.tsx", "utf8");
  assert.match(home, /const \[paying, setPaying\] = useState\(false\);/);
  assert.match(home, /const address = making \? undefined : account;/);
  assert.equal((home.match(/<OfferCard [^>]*paying=\{paying\} onPaying=\{setPaying\} onMaking=\{setMaking\} \/>/g) ?? []).length, 2, "the card of both pages");
  const press = sheet.slice(sheet.indexOf("const pay = async"), sheet.indexOf("const signInFirst ="));
  assert.ok(press.indexOf("if (!address) onMaking(true);") < press.indexOf("await ensureAccount()"), "said before the passkey opens");
  assert.match(press, /catch \{\s+onMaking\(false\);/, "and taken back when the account was not made");
});

test("one way in, one action, and no button to another (D239)", () => {
  assert.ok(!("another" in PAY), "the second way is not a choice any more");
  assert.doesNotMatch(sheet, /another way|SECONDARY_BUTTON|setChosen/);
  // The footer only, from its opening to its fragment's close: the body's small keys are not actions (D294's copy).
  const footer = sheet.slice(sheet.indexOf("footer={"), sheet.indexOf("</>", sheet.indexOf("footer={")));
  assert.equal((footer.match(/<button/g) ?? []).length, 1, "the one action, and nothing under it but a refusal or the account panel");
  // Every other button of the sheet is a small key (the code's copy, D294; the judge code, D297), never a second action.
  const body = sheet.slice(sheet.indexOf("</>", sheet.indexOf("footer={")), sheet.indexOf("</Sheet>"));
  const buttons = body.match(/<button[^>]*>/g) ?? [];
  assert.ok(buttons.length >= 1);
  for (const button of buttons) assert.match(button, /INLINE_BUTTON/, button);
  // The sentence is the one place the sheet names the two services: which refused, why, and which this goes through.
  assert.equal(PAY.instead.country("Ramp", "Mercuryo"), "Ramp does not serve your country, so this goes through Mercuryo.");
  assert.equal(PAY.instead.paused("Ramp", "Mercuryo"), "Ramp is not selling right now, so this goes through Mercuryo.");
  assert.equal(PAY.instead.floor("Ramp", 6.25, "Mercuryo"), "Ramp takes nothing under 6.25 EUR, so this goes through Mercuryo.");
  // A service that serves the country and does not sell there what a gift holds says that, never "your country" (1 Oct 2026).
  assert.equal(PAY.instead.notSold("Ramp", "Mercuryo"), "Ramp does not sell what a gift holds in your country, so this goes through Mercuryo.");
  assert.match(sheet, /first === WAY_IN_GIFT_COIN && country && RAMP_NO_GIFT_COIN_IN\.includes\(country\.toLowerCase\(\)\)\) return W\.instead\.notSold\(first\.name, offer\.way\.name\);/);
  assert.match(sheet, /\{offer\.insteadOf && byCard \? <p className=\{HELP\}>\{insteadSentence\(offer, card\?\.country \?\? null\)\}<\/p> : null\}/, "said on the sheet, and only while there is something to pay by card");
  // The device's language goes with the call itself; the sheet passes nothing as if it were an answer from the person.
  assert.match(sheet, /whereTheRailsServe\(\)/);
});

/**
 * Which way in stands in front of the action (D239, replacing the ordering of D125). The floors are the services' own
 * published figures: 6.25 EUR at the rail that sells what a gift holds (the coin's own `minPurchaseAmount`, read 1 Oct
 * 2026), 25 EUR at the rail that sells the chain's coin (`fiat_payment_methods.EUR.limits.min`, read 20 Sep 2026). The
 * first way stands unless it refuses by country, by its own asset list or by its floor; then the next one, and the
 * offer says why.
 *
 * The figures below moved on 1 Oct 2026 (the audit): the rail that sells what a gift holds adds the larger of one euro
 * and one part in a hundred, so a payment does not land a little short, and the rail that sells the chain's coin reads
 * the day's rate rather than the measurement of 14 Sep alone.
 */
test("the first way stands unless it refuses; then the next, and the offer says which refused and why", () => {
  const rate = 1.1537; // dollars per euro, as the rates route answers it
  const france = { Ramp: "serves", Mercuryo: "serves" } as const;
  const senegal = { Ramp: "does-not", Mercuryo: "serves" } as const;
  const names = (offer: ReturnType<typeof wayInFor>) => [offer.way.name, offer.euros, offer.atFloor, offer.insteadOf?.because];

  // Ten dollars in France: 13 EUR at the euro rail (8.67 of money, one euro of margin and their 2.49 minimum), above
  // its 6.25 EUR floor.
  assert.deepEqual(names(wayInFor(10_000_000n, WAYS_IN, rate, france)), ["Ramp", 13, false, undefined]);
  // Forty dollars: the same rail (34.67 EUR of money, one of margin and their 2.49 minimum, 39 whole euros), whatever
  // the other would cost; nothing is compared any more.
  assert.deepEqual(names(wayInFor(40_000_000n, WAYS_IN, rate, france)), ["Ramp", 39, false, undefined]);
  // A silence is not a refusal: with nothing read about either, the first stands.
  assert.deepEqual(names(wayInFor(40_000_000n, WAYS_IN, rate, {})), ["Ramp", 39, false, undefined]);

  // The euro rail's own list says it does not sell in Senegal: the chain rail, from its 25 EUR floor, and the sentence.
  assert.deepEqual(names(wayInFor(40_000_000n, WAYS_IN, rate, senegal)), ["Mercuryo", 40, false, "country"]);
  // Ten dollars there: 11 EUR is under the chain rail's floor, so its floor is paid, and both sentences are said.
  assert.equal(eurosNeededOn(10_000_000n, WAY_IN_CHAIN_COIN, rate), 11);
  assert.deepEqual(names(wayInFor(10_000_000n, WAYS_IN, rate, senegal)), ["Mercuryo", 25, true, "country"]);
  // The euro rail's own asset list has switched the coin off: the same fall back, said as a pause.
  assert.deepEqual(names(wayInFor(40_000_000n, WAYS_IN, rate, { Ramp: "paused", Mercuryo: "serves" })), ["Mercuryo", 40, false, "paused"]);
  // Every way shut by the country: a country is a guess, so the first stands and nothing is said.
  assert.deepEqual(names(wayInFor(40_000_000n, WAYS_IN, rate, { Ramp: "does-not", Mercuryo: "does-not" })), ["Ramp", 39, false, undefined]);

  // One dollar: under every floor. The gift's minimum does not move; the lowest floor is what is paid, in whole euros,
  // and said so: 6.25 is the floor and 7 is what is paid.
  assert.deepEqual(names(wayInFor(1_000_000n, WAYS_IN, rate, france)), ["Ramp", 7, true, undefined]);
  assert.equal(eurosNeededOn(1_000_000n, WAY_IN_GIFT_COIN, rate), 5, "what it needs, before the floor");
  assert.equal(PAY.floor(6.25, 7), "The card service takes nothing under 6.25 EUR, so you pay 7 EUR. What is left over stays in your account for your next gift.");
  assert.match(PAY.floor(25, 25), /takes nothing under 25 EUR, so that is what you pay/);
  assert.match(sheet, /\{offer\.atFloor && byCard && euros \? <p className=\{HELP\}>\{W\.floor\(way\.smallestEur, euros\)\}<\/p> : null\}/);
  // A floor can send a gift to the next way too: a register whose first floor is the higher one, for the rule's sake.
  const higherFirst: readonly [WayIn, WayIn] = [WAY_IN_CHAIN_COIN, WAY_IN_GIFT_COIN];
  assert.deepEqual(names(wayInFor(10_000_000n, higherFirst, rate, france)), ["Ramp", 13, false, "floor"]);

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
  assert.equal(PAY.upTo("€3.90"), "up to €3.90");
  assert.equal(PAY.aboutAmount("€2.49"), "about €2.49");
  // Read in the reader's own money, as the gift and the total are (the founder, 29 Sep 2026).
  assert.match(sheet, /const chargeRead = charge === undefined \? undefined : money\.led\(BigInt\(Math\.round\(charge \* 1_000_000\)\)\)\.lead;/);
  assert.match(sheet, /serviceChargeIsCeiling\(euros, way\.fee\) \? W\.upTo\(chargeRead\) : W\.aboutAmount\(chargeRead\)/);
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

test("a card that buys the chain's coin says what it asks beyond the gift and the charge, and the total in the payer's money", () => {
  // The founder, 29 Sep 2026, from the Senegal capture: F CFA 14,995 and F CFA 646 make 23.84 EUR, and the sheet asked 26.
  // Since 1 Oct 2026 the euros are worked out at the day's rate, and it asks 27: the model alone asked a twentieth too little.
  const usdPerEur = 1.1355;
  const short = BigInt(Math.round((14_995 / 655.957) * usdPerEur * 1_000_000));
  const euros = eurosNeededOn(short, WAY_IN_CHAIN_COIN, usdPerEur)!;
  assert.equal(euros, 27);
  const margin = chainMarginEur(euros, short, WAY_IN_CHAIN_COIN, usdPerEur);
  assert.ok(margin > 3 && margin < 3.3, `about 3.11 EUR beyond the gift and the charge (${margin.toFixed(2)})`);
  assert.equal(chainMarginEur(33, 34_000_000n, WAY_IN_GIFT_COIN, usdPerEur), 0, "a card selling what a gift holds asks the day's rate, no margin");
  assert.equal(
    PAY.chainMargin("F CFA 1,414"),
    "That is about F CFA 1,414 more than the gift and the charge: this card buys MON, which is changed into what your gift holds once it arrives, so a margin covers its price moving meanwhile. What is not used stays in your account.",
  );
  assert.equal(PAY.inYourMoney("F CFA 17,055"), "About F CFA 17,055.");
  assert.match(sheet, /const totalRead = byCard && euros && usdPerEur && money\.currency !== "EUR" \? money\.led\(eurosAsUnits\(euros\)\)\.lead : undefined;/);
  assert.match(sheet, /\{marginRead \? <p className=\{HELP\}>\{W\.chainMargin\(marginRead\)\}<\/p> : null\}/);
});
