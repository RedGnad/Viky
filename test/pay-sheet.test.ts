import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { chainMarginEur, eurosNeededOn, roughlyInDollars, serviceChargeDollars, serviceChargeEur, serviceChargeIsCeiling, wayInFor } from "../src/gift-amount";
import { lastNameGiven } from "../src/gift-names";
import { cardSum, giftTyped, heldIn, moneyIn } from "../src/pay-sum";
import type { Rates } from "../src/rates";
import { PAY } from "../src/sentences";
import { feeInWords, sourceOfIts, WAY_IN_CHAIN_COIN, WAY_IN_GIFT_COIN, WAY_IN_USDC, WAYS_IN, type WayIn } from "../src/rails";

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

test("lines that add up, and the last is that Viky keeps nothing", () => {
  assert.equal(PAY.rows.gift("Léa"), "Léa's gift");
  assert.equal(PAY.rows.gift(""), "The gift");
  assert.equal(PAY.rows.fromAccount, "From your Viky money");
  assert.equal(PAY.rows.fee, "Card fee");
  assert.equal(PAY.rows.stays, "Stays in your Viky money");
  // No company on a line (the founder, 20 Sep 2026): it is named under the button, where the card goes to it.
  assert.doesNotMatch(Object.values(PAY.rows).map((row) => (typeof row === "function" ? row("Léa") : row)).join(" ") + PAY.payByCard("€12.00"), /Ramp|Mercuryo/);
  assert.equal(PAY.payByCard("€12.00"), "Pay €12.00 by card");
  assert.equal(PAY.rows.viky, "Viky takes");
  assert.equal(PAY.nothing, "nothing");
  // True of the code: no rail of ours takes a share, and nothing in the money path adds one.
  for (const way of WAYS_IN) assert.ok(way.fee.percent > 0, `${way.name} publishes its own fee, which is theirs and not ours`);
  assert.doesNotMatch(readFileSync("src/gift-amount.ts", "utf8"), /vikyFee|ourFee|commission/i);
});

test("what this person pays is their own figure, in the money they typed, at a dated rate said in the fold", () => {
  assert.match(sheet, /wayInFor\(short, waysIn\(\), money\.rates\?\.usdPerEur, railIn\)/, "the euros are the offer's, on the one way chosen for the person");
  assert.match(sheet, /cardSum\(\{ code, gift, cardEuros: euros, feeEuros: serviceChargeEur\(euros, way\.fee\), rates: money\.rates \}\)/, "the lines are worked out from them, with the service's own fee");
  assert.match(sheet, /W\.feeAndRate\(feeInWords\(way\), sourceOfIts\(way\), way\.read, rateDay\)/, "and the rate is said in the fold, with the fee");
  assert.equal(
    PAY.feeAndRate(feeInWords(WAY_IN_USDC), sourceOfIts(WAY_IN_USDC), WAY_IN_USDC.read, "2 Oct 2026"),
    "Rampnow keeps 7 % plus €0.40, at least €1.00 (its own quotes, 1 Oct 2026). Euros at the European Central Bank's rate of 2 Oct 2026.",
  );
  assert.equal(PAY.chargedIn("€15.00", "$16.84", "2 Oct 2026"), "Your card is charged €15.00, which is $16.84 at the European Central Bank's rate of 2 Oct 2026.");
  // The rate line in the open is gone from the sheet (the mockup of 3 Oct 2026); the currency sheet keeps its own.
  assert.doesNotMatch(sheet, /W\.atTheRate/);
});

/**
 * The sum of the mockup of 3 Oct 2026, to the cent: a gift of €19.00 typed in euros, $10.00 in the account, Rampnow's
 * 12 EUR and its fee of 7 % plus 0.40. 19.00 less 8.24 plus 1.24 is 12.00. The card pays a whole number of euros and
 * the account the rest, and when the card brings more, what stays is a line of its own: the sum still falls right.
 */
test("the lines add up to what the card pays, in one money, and what stays in the account is said", () => {
  const rates = { date: "2026-10-02", usdPerEur: 1.1225, eurPerUsd: 1 / 1.1225, xofPerUsd: 655.957 / 1.1225, eurPer: { EUR: 1, USD: 1.1225, XOF: 655.957 }, readAtMs: 0 } as Rates;
  const units = 21_320_000n;
  const gift = giftTyped({ typedAmount: "19", typedIn: "EUR", units, code: "EUR", rates })!;
  assert.equal(gift, 19, "what was typed, never the dollars brought back as €18.99");
  const euros = eurosNeededOn(units - 10_000_000n, WAY_IN_USDC, rates.usdPerEur)!;
  assert.equal(euros, 12);
  const sum = cardSum({ code: "EUR", gift, cardEuros: euros, feeEuros: serviceChargeEur(euros, WAY_IN_USDC.fee), rates })!;
  assert.deepEqual(sum, { code: "EUR", gift: 19, card: 12, fee: 1.24, cardEuros: 12, fromAccount: 8.24, stays: 0 });
  assert.equal(moneyIn(sum.card, "EUR"), "€12.00");
  // A card that brings more than the gift and its fee, at a floor: what is left over stays, on its own line.
  const floor = cardSum({ code: "EUR", gift: 2, cardEuros: 5, feeEuros: serviceChargeEur(5, WAY_IN_USDC.fee), rates })!;
  assert.deepEqual([floor.fromAccount, floor.fee, floor.stays], [0, 1, 2]);
  assert.equal(floor.gift - floor.fromAccount + floor.fee + floor.stays, floor.card);
  // Typed in dollars: the card's euros said in dollars at the day's rate, and the fold says what the card is charged.
  const dollars = cardSum({ code: "USD", gift: 23, cardEuros: 15, feeEuros: serviceChargeEur(15, WAY_IN_USDC.fee), rates })!;
  assert.deepEqual([dollars.card, dollars.fee, dollars.fromAccount], [16.84, 1.63, 7.79]);
  assert.equal(Math.round((dollars.gift - dollars.fromAccount + dollars.fee) * 100), Math.round(dollars.card * 100));
  // Not typed in this money: the dollars signed, in it, to its decimals; and what the account holds the same way.
  assert.equal(giftTyped({ units, code: "EUR", rates }), 18.99);
  assert.equal(heldIn(10_000_000n, "EUR", rates), 8.91);
  assert.match(moneyIn(12000, "XOF"), /^F\s?CFA\s?12,000$/, "a currency without cents, whole");
  // No rate for the money: no sum, and the sheet says only "Pay".
  assert.equal(cardSum({ code: "GBP", gift: 19, cardEuros: 12, feeEuros: 1.24, rates }), undefined);
});

test("the name comes first, as the recipient knows the giver, filled with the last one this account gave", () => {
  assert.equal(PAY.nameLabel("Boo"), "Your name, as Boo knows you");
  assert.equal(PAY.nameLabel(""), "Your name, as they know you");
  assert.equal(PAY.namePlaceholder, "Mum");
  assert.equal(
    lastNameGiven([
      { role: "funder", funderName: "Mum", fundedAt: 10 },
      { role: "recipient", funderName: "Dad", fundedAt: 30 },
      { role: "funder", funderName: "  ", fundedAt: 40 },
      { role: "funder", funderName: "Mama", fundedAt: 20 },
    ]),
    "Mama",
  );
  assert.equal(lastNameGiven([]), undefined, "never given: the field stays empty, a gift from nobody");
  // Empty, no sentence breaks (it read "Boo and show on the gift").
  assert.equal(PAY.namesSeen("Boo", false), "Boo's name shows on the gift, to whoever opens its link.");
  assert.equal(PAY.namesSeen("Boo", true), "Boo's name and yours show on the gift, to whoever opens its link.");
  assert.equal(PAY.missedBy("Boo", "9:00"), "A day Boo misses can be caught up the next day. If not, it comes back to you the morning after, at about 9:00 your time.");
  assert.ok(sheet.indexOf('id="funder-name"') < sheet.indexOf("data-pay-lines"), "the field before the lines");
  assert.match(sheet, /if \(!live\) return;[\s\S]{0,300}?if \(last && now\.draft\.funderName\.trim\(\) === ""\) now\.onChange\(\{ \.\.\.now\.draft, funderName: last \}\);/, "only into an empty field");
});

test("the account is made at the press, and the sheet says so before it happens", () => {
  assert.match(PAY.passkeyMakesTheAccount, /creates your account when you press pay/);
  assert.match(PAY.passkeyMakesTheAccount, /Nothing was asked of you until now/);
  // Said only where it is true: a device that remembers a passkey opens it, and makes nothing.
  // And only where it can happen: on another address of the app an account is not made, and the sheet says where it is.
  // Signed in, the phone's own prompt says it, and the sheet says nothing more (the mockup of 3 Oct 2026).
  assert.match(sheet, /\{address \|\| hasCredential \? null : <p className=\{HELP\}>\{madeHere \? W\.passkeyMakesTheAccount : ACCOUNT_DOOR\.madeOnTheMainSite\}<\/p>\}/);
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
  assert.equal(PAY.alreadyHaveAccount, "Sign in");
  assert.match(sheet, /\{!address && !hasCredential \? \(\s+<button type="button" className=\{`\$\{SMALL_BUTTON\} self-start`\}[^>]*onClick=\{\(\) => void signInFirst\(\)\}>/);
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
  // One action in the sun, and every other button of the sheet a small key (the code's copy, D294), never a second one.
  const body = sheet.slice(sheet.indexOf("<Sheet "), sheet.indexOf("</Sheet>"));
  const buttons = body.match(/<button[^>]*>/g) ?? [];
  assert.equal(buttons.filter((button) => /PRIMARY_BUTTON/.test(button)).length, 1, "the one action");
  for (const button of buttons.filter((button) => !/PRIMARY_BUTTON/.test(button))) assert.match(button, /SMALL_BUTTON/, button);
  // "Have a code?" stays (D297), last and folded (the mockup of 3 Oct 2026).
  assert.ok(body.lastIndexOf("<JudgeCode") > body.indexOf("data-what-happens"), "the code after the fold");
  assert.match(body, /<JudgeCode\s+folded/);
  // The sentence is the one place the sheet names the two services: which refused, why, and which this goes through.
  assert.equal(PAY.instead.country("Ramp", "Mercuryo"), "Ramp does not serve your country, so this goes through Mercuryo.");
  assert.equal(PAY.instead.paused("Ramp", "Mercuryo"), "Ramp is not selling right now, so this goes through Mercuryo.");
  assert.equal(PAY.instead.floor("Ramp", "€6.25", "Mercuryo"), "Ramp takes nothing under €6.25, so this goes through Mercuryo.");
  // A service that serves the country and does not sell there what a gift holds says that, never "your country" (1 Oct 2026).
  assert.equal(PAY.instead.notSold("Ramp", "Mercuryo"), "Ramp does not sell what a gift holds in your country, so this goes through Mercuryo.");
  assert.match(sheet, /first === WAY_IN_GIFT_COIN && country && RAMP_NO_GIFT_COIN_IN\.includes\(country\.toLowerCase\(\)\)\) return W\.instead\.notSold\(first\.name, offer\.way\.name\);/);
  assert.match(sheet, /\{offer\.insteadOf \? <p className=\{BODY\}>\{insteadSentence\(offer, card\?\.country \?\? null\)\}<\/p> : null\}/, "said in the fold, among what is said when the card pays");
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
  assert.equal(PAY.floor("€6.25", "€7.00"), "The card service takes nothing under €6.25, so you pay €7.00. What is left over stays in your account for your next gift.");
  assert.match(PAY.floor("€25.00", "€25.00"), /takes nothing under €25\.00, so that is what you pay/);
  assert.match(sheet, /\{offer\.atFloor && euros \? <p className=\{BODY\}>\{W\.floor\(moneyIn\(way\.smallestEur, "EUR"\), moneyIn\(euros, "EUR"\)\)\}<\/p> : null\}/);
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
  // In the sheet's one money, exact, and "up to" only where the service publishes a ceiling (the mockup of 3 Oct 2026).
  assert.match(sheet, /line\(W\.rows\.fee, feeCeiling \? W\.upTo\(say\(sum\.fee\)\) : say\(sum\.fee\)\)/);
  assert.equal(serviceChargeDollars(29, WAY_IN_CHAIN_COIN, undefined), undefined, "no rate, no figure, never a guess");
  assert.equal(serviceChargeEur(0, WAY_IN_GIFT_COIN.fee), 0, "nothing paid, nothing charged");
});

test("the sheet stands where the mockup stands it, and the wait is the whole screen", () => {
  assert.match(css, /dialog\.sheet-tall \{\s*\n\s*max-height: 82dvh;/, "a sheet with more to say stops at 82 per cent");
  assert.match(sheet, /<Sheet [^>]*\btall>/, "and this is that sheet");
  // The wait: the ring at the size paying.html draws it, what is being done in the title face, and the gift under it.
  assert.match(css, /\.working-ring-large \{[\s\S]*?width: 54px;/);
  assert.match(pay, /<Working says=\{phase === "taking" \? C\.gathering : phase === "converting" \? W\.arrived\.gettingReady : P\.putting\(gift, recipient\)\} and=\{P\.takesSeconds\} then=\{P\.mayClose\} large \/>/);
  assert.match(pay, /<MiniGift recipient=\{recipient\}/);
  assert.equal(PAY.putting("$30.00", "Noah"), "Putting $30.00 in Noah's name.");
  assert.equal(PAY.takesSeconds, "It takes a few seconds.");
  assert.match(PAY.mayClose, /^You can close this page/);
});

test("paying starts on the card, and the old way in to it is gone", () => {
  // The check screen with its two cards of figures, the separate account step and the review rows are all gone:
  // one surface asks for the money now, and it is the sheet over the card.
  for (const said of ["W.check.payingWith", "W.check.payWithFor", "W.account.title", "orderRails"]) {
    assert.ok(!pay.includes(said), `the paying screen still carries ${said}`);
  }
  assert.match(pay, /O\.nothingToPay\.title/, "somebody who lands there with nothing running is sent back to the card");
});

test("a card that buys the chain's coin says what stays in the account, and why it brings more", () => {
  // The founder, 29 Sep 2026, from the Senegal capture: F CFA 14,995 and F CFA 646 make 23.84 EUR, and the sheet asked 26.
  // Since 1 Oct 2026 the euros are worked out at the day's rate, and it asks 27: the model alone asked a twentieth too little.
  const usdPerEur = 1.1355;
  const short = BigInt(Math.round((14_995 / 655.957) * usdPerEur * 1_000_000));
  const euros = eurosNeededOn(short, WAY_IN_CHAIN_COIN, usdPerEur)!;
  assert.equal(euros, 27);
  const margin = chainMarginEur(euros, short, WAY_IN_CHAIN_COIN, usdPerEur);
  assert.ok(margin > 3 && margin < 3.3, `about 3.11 EUR beyond the gift and the charge (${margin.toFixed(2)})`);
  assert.equal(chainMarginEur(33, 34_000_000n, WAY_IN_GIFT_COIN, usdPerEur), 0, "a card selling what a gift holds asks the day's rate, no margin");
  // What stays is the sheet's own line; the fold says why a card that buys the chain's coin brings more.
  assert.equal(
    PAY.chainMargin,
    "This card buys MON, which is changed into what your gift holds once it arrives, so a margin covers its price moving meanwhile. What is not used stays in your account.",
  );
  assert.match(sheet, /\{sum && sum\.stays > 0 && way\.arrives === "chain" \? <p className=\{BODY\}>\{W\.chainMargin\}<\/p> : null\}/);
  assert.match(sheet, /\{sum\.stays > 0 \? line\(W\.rows\.stays, say\(sum\.stays\)\) : null\}/);
});
