import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { chainMarginEur, eurosNeededOn, roughlyInDollars, serviceChargeDollars, serviceChargeEur, serviceChargeIsCeiling, wayInFor } from "../src/gift-amount";
import { lastNameGiven } from "../src/gift-names";
import { upToTheCent } from "../src/euro-cents";
import { cardSum, dollarsSaidIn, giftAsTyped, giftTyped, heldIn, moneyIn, moneyTypedIn, smallestGiftByCard } from "../src/pay-sum";
import type { Rates } from "../src/rates";
import { FUND, PAY } from "../src/sentences";
import { feeInALine, rampnowPage, WAY_IN_CHAIN_COIN, WAY_IN_GIFT_COIN, WAY_IN_USDC, WAYS_IN, type WayIn } from "../src/rails";

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
  // "Change, kept in your account" read as a cost (the founder, 9 Oct 2026): what stays is said in the one line
  // under the card's button, with the gift and the fee, and the three add up to what the button says.
  assert.ok(!("stays" in PAY.rows));
  assert.equal(PAY.cardSum({ gift: "€8.00", part: false, fee: "€1.04", stays: "€0.08" }), "€8.00 gift, €1.04 card fee, €0.08 stays yours.");
  assert.equal(PAY.cardSum({ gift: "€10.19", part: true, fee: "€1.20", stays: null }), "€10.19 of the gift, €1.20 card fee.");
  // No company on a line (the founder, 20 Sep 2026): it is named under the button, where the card goes to it.
  assert.doesNotMatch(Object.values(PAY.rows).map((row) => (typeof row === "function" ? row("Léa") : row)).join(" ") + PAY.payByCard("€12.00"), /Ramp|Mercuryo/);
  assert.equal(PAY.payByCard("€12.00"), "Pay €12.00 by card");
  assert.equal(PAY.rows.viky, "Viky takes");
  assert.equal(PAY.nothing, "nothing");
  // True of the code: no rail of ours takes a share, and nothing in the money path adds one.
  for (const way of WAYS_IN) assert.ok(way.fee.percent > 0, `${way.name} publishes its own fee, which is theirs and not ours`);
  assert.doesNotMatch(readFileSync("src/gift-amount.ts", "utf8"), /vikyFee|ourFee|commission/i);
});

test("what this person pays is their own figure, in the money they typed, and the fold says the fee in a short line", () => {
  assert.match(sheet, /wayInFor\(short, waysIn\(\), money\.rates\?\.usdPerEur, railIn\)/, "the euros are the offer's, on the one way chosen for the person");
  assert.match(sheet, /cardSum\(\{ code, gift, cardEuros: euros, feeEuros: serviceChargeEur\(euros, way\.fee\), rates: money\.rates \}\)/, "the lines are worked out from them, with the service's own fee");
  // The fold says the fee in a short line, with the service's name (the founder, 4 Oct 2026). The rate's day and what
  // the card is charged in euros were sentences of that fold, and a fold holds no sentence any more.
  assert.equal(feeInALine(WAY_IN_USDC, 12), "Rampnow, 7 % + €0.40");
  assert.deepEqual([PAY.fold.missedDay, PAY.fold.notOpened], [["A missed day", "back to you"], ["Not opened in 14 days", "back to you"]]);
  assert.deepEqual([PAY.fold.notReached, PAY.fold.notShown], [["Not reached in time", "back to you"], ["Not shown in time", "back to you"]]);
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
  // To the cent since 9 Oct 2026, where the service's page takes cents: it asked 12, and 0.61 of it was a whole euro's rest.
  const euros = eurosNeededOn(units - 10_000_000n, WAY_IN_USDC, rates.usdPerEur)!;
  assert.equal(euros, 11.39);
  const sum = cardSum({ code: "EUR", gift, cardEuros: euros, feeEuros: serviceChargeEur(euros, WAY_IN_USDC.fee), rates })!;
  assert.deepEqual(sum, { code: "EUR", gift: 19, card: 11.39, fee: 1.2, cardEuros: 11.39, fromAccount: 8.81, stays: 0 });
  assert.equal(moneyIn(sum.card, "EUR"), "€11.39");
  // The part of the gift the card pays, and its fee: the card's figure, to the cent.
  assert.equal(Math.round((sum.gift - sum.fromAccount + sum.fee + sum.stays) * 100), Math.round(sum.card * 100));
  // The founder's own example: a gift of 8 euros and nothing in the account. 9.12 by card: 8.00, 1.04 and 0.08.
  const eight = BigInt(Math.round(8 * rates.usdPerEur * 1_000_000));
  const asked = eurosNeededOn(eight, WAY_IN_USDC, rates.usdPerEur)!;
  assert.equal(asked, 9.12);
  const said = cardSum({ code: "EUR", gift: 8, cardEuros: asked, feeEuros: serviceChargeEur(asked, WAY_IN_USDC.fee), rates })!;
  assert.deepEqual([said.card, said.fee, said.stays, said.fromAccount], [9.12, 1.04, 0.08, 0]);
  assert.equal(
    PAY.cardSum({ gift: moneyIn(said.gift - said.fromAccount, "EUR"), part: said.fromAccount > 0, fee: moneyIn(said.fee, "EUR"), stays: said.stays > 0 ? moneyIn(said.stays, "EUR") : null }),
    "€8.00 gift, €1.04 card fee, €0.08 stays yours.",
  );
  // The arithmetic holds as well for a card that brings far more than the gift and its fee: what is left over stays.
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
  assert.match(moneyIn(12000, "XOF"), /^12\s000\sFCFA$/, "a currency without cents, whole");
  // No rate for the money: no sum, and the sheet says only "Pay".
  assert.equal(cardSum({ code: "GBP", gift: 19, cardEuros: 12, feeEuros: 1.24, rates }), undefined);
});

test("the name comes first, as the recipient knows the giver, filled with the last one this account gave", () => {
  assert.equal(PAY.nameLabel("Boo"), "Your name, as Boo knows you");
  assert.equal(PAY.nameLabel(""), "Your name, as they know you");
  // An example of a giver's name, never a parent's (the founder, 4 Oct 2026).
  assert.equal(PAY.namePlaceholder, "Sam");
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
  assert.ok(sheet.indexOf('id="funder-name"') < sheet.indexOf("data-pay-lines"), "the field before the lines");
  assert.match(sheet, /if \(!live\) return;[\s\S]{0,300}?if \(last && now\.draft\.funderName\.trim\(\) === ""\) now\.onChange\(\{ \.\.\.now\.draft, funderName: last \}\);/, "only into an empty field");
});

test("the account is made at the press, and the sheet says so before it happens", () => {
  assert.match(PAY.passkeyMakesTheAccount, /creates your account when you press pay/);
  assert.match(PAY.passkeyMakesTheAccount, /Nothing was asked of you until now/);
  // Said only where it is true: a device that remembers a passkey opens it, and makes nothing.
  // And only where it can happen: on another address of the app an account is not made, and the sheet says where it is.
  // Signed in, the phone's own prompt says it, and the sheet says nothing more (the mockup of 3 Oct 2026).
  // Where a code can be used on the sheet as well (9 Oct 2026), either press makes the account, and both are named.
  assert.match(sheet, /\{address \|\| hasCredential \? null : <p className=\{HELP\}>\{madeHere \? \(codeInReach \? W\.passkeyMakesTheAccountEitherWay : W\.passkeyMakesTheAccount\) : ACCOUNT_DOOR\.madeOnTheMainSite\}<\/p>\}/);
  assert.equal(PAY.passkeyMakesTheAccountEitherWay, "Your face or your fingerprint creates your account when you press pay or use the code.");
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

/**
 * A judge's code on the sheet (the founder, 9 Oct 2026): visible, and never put forward in the card's place. The card
 * stays the one action. test/browser/pay-sheet.spec.ts walks it; this pins what decides where the code stands.
 */
test("a code is small beside the card, which stays the one action: its field above the total when the link carried it, a small key right above the card's button otherwise", () => {
  // A link that carried a code shows its field, from the sheet's first image.
  assert.match(sheet, /const linkCode = open \? judgeCodeFromTheLink\(\) : "";/);
  assert.match(sheet, /const codeFromLink = codeGiven === "link" \|\| \(codeGiven === null && linkCode !== ""\);/);
  // Offered while credits are open and the account has had none, as the server says, to an account that cannot pay;
  // a code the link carried is shown before the server has said, and kept while it is being used.
  assert.match(sheet, /const codeOffered = credits === null \|\| credits === "unread" \? null : credits\.open && !credits\.credited;/);
  assert.match(sheet, /const codeInReach = !enough && \(pays === "card" \|\| codeStarted\) && \(codeFromLink \? codeOffered !== false : codeOffered === true\);/);
  assert.match(sheet, /setCredits\(\{ open: answer\.open === true, credited: answer\.credited === true \}\);/);
  const body = sheet.slice(sheet.indexOf("<Sheet "), sheet.indexOf("</Sheet>"));
  // The key's place (the founder, 9 Oct 2026, who had it under the card's button, then above the price): under the
  // price and right above the card's button. A code the link carried keeps its field first, above the total. The
  // sheet's order without a link: the lines, the total, the key, the button, the card service's line, the passkey's.
  const fromLink = '{codeFromLink ? theCode("link") : null}';
  const key = '{codeFromLink ? null : theCode("key")}';
  assert.ok(body.indexOf(fromLink) > body.indexOf("data-pay-lines"));
  assert.ok(body.indexOf(fromLink) < body.indexOf("data-pay-total"), "from the link: above the total");
  assert.ok(body.indexOf(key) > body.indexOf("data-pay-total"), "the key: under the price");
  assert.ok(body.indexOf(key) < body.indexOf("data-pays="), "and above the card's button");
  assert.ok(body.indexOf("data-pays=") < body.indexOf("<CardLine way={way} />"), "then the card service's line");
  assert.ok(body.indexOf("<CardLine way={way} />") < body.indexOf("W.passkeyMakesTheAccountEitherWay"), "then the passkey's");
  // A shape is its own instance, so the field a link opens starts with the link's code in it.
  assert.match(sheet, /<JudgeCode\s+key=\{shape\}/);
  // While the key waits for the server's answer its place is kept, so the button does not move when it is drawn; an
  // answer that never came gives the place back.
  assert.match(sheet, /const codeAwaited = !codeFromLink && !enough && pays === "card" && credits === null;/);
  assert.match(sheet, /setCredits\(\(was\) => was \?\? "unread"\);/);
  assert.doesNotMatch(sheet, /onTheCode|codeWay|codeChosen/, "nothing stands in the card's place any more");
  // Small, in both places: the kit's small key, a field, and a small button. The sheet has one button in the sun.
  const code = readFileSync("app/kit/offer/JudgeCode.tsx", "utf8");
  assert.equal((code.match(/<Button /g) ?? []).length, 1);
  assert.match(code, /<Button look="small" className="self-start"/);
  assert.match(code, /const \[shown, setShown\] = useState\(shownFromTheStart\);/);
  assert.match(code, /const \[code, setCode\] = useState\(startWith\);/, "what the link carried is already in it");
  assert.match(code, /if \(awaited && !shown\) return <div className="invisible h-\[40px\] shrink-0" aria-hidden="true" data-code-place="" \/>;/);
  assert.match(readFileSync("app/components/ui.ts", "utf8"), /export const SMALL_BUTTON = `[^`]*\bh-\[40px\]/, "the place is as tall as the key");
  // From the link, its field is named by the question; otherwise the question is the key, and the field "Code".
  assert.match(code, /<Field id="gift-code" label=\{label\} value=\{code\} onChange=\{setCode\}/);
  assert.match(sheet, /label=\{shape === "link" \? W\.code\.have : undefined\}/);
  assert.equal(PAY.code.have, "Have a code?");
});

test("the code's press makes the account of somebody who has none, and the credit then pays, said on the button", () => {
  const made = sheet.slice(sheet.indexOf("const accountForTheCode = async"), sheet.indexOf("const close = () =>"));
  assert.match(made, /if \(address\) return true;/);
  assert.ok(made.indexOf("onMaking(true);") < made.indexOf("await ensureAccount();"), "Home is told before the passkey opens, as for pay");
  assert.match(made, /catch \{\s+madeForTheCode\.current = false;\s+onMaking\(false\);\s+setProblem\(W\.notMade\);\s+return false;/);
  // Closed without paying, Home draws that account's page again; and the next opening starts from what is true then.
  const close = sheet.slice(sheet.indexOf("const close = () =>"), sheet.indexOf("const signInFirst ="));
  assert.match(close, /if \(madeForTheCode\.current\) \{\s+madeForTheCode\.current = false;\s+onMaking\(false\);\s+\}/);
  assert.match(close, /setCodeGiven\(null\);\s+setCodeStarted\(false\);\s+onClose\(\);/);
  assert.match(sheet, /<Sheet open=\{open\} title=\{W\.title\(recipient\)\} onClose=\{close\} tall>/);
  // Once the credit is in, no card is named while the account is read again, and the reading is asked again until it
  // shows the credit: the sheet said "by card" for a second to somebody who had just been given the money.
  assert.match(sheet, /const creditArriving = codeGiven !== null && pays === "card";/);
  assert.match(sheet, /\{creditArriving \? \(\s+<WaitLine>\{W\.readingAccount\}<\/WaitLine>/);
  assert.match(sheet, /if \(!creditArriving\) return;\s+const again = setTimeout\(\(\) => setBalanceRead\(\(n\) => n \+ 1\), 3000\);\s+return \(\) => clearTimeout\(again\);/);
  // The card under the sheet reads the gift again when the sheet changed its amount: it kept the figure typed.
  const offer = readFileSync("app/kit/offer/OfferCard.tsx", "utf8");
  assert.match(offer, /const changeFromTheSheet = \(next: typeof draft\) => \{\s+if \(next\.dollars !== draft\.dollars\) setTypedAmount\(null\);\s+change\(next\);/);
  assert.match(offer, /onChange=\{changeFromTheSheet\} onClose=\{\(\) => setPaying\(false\)\}/);
  // Then the button says what pays, when the credit is all the account holds (D295), and what it pays.
  assert.equal(PAY.code.payWithCredit("$3.00"), "Pay $3.00 with your credit");
  assert.match(sheet, /enough \? \(paidFromCredit \? W\.code\.payWithCredit\(giftRead\) : W\.payFromAccount\(giftRead, recipient\)\) : sum \? W\.payByCard\(say\(sum\.card\)\) : W\.pay\}/);
});

/**
 * The third case, the card (the founder, 9 Oct 2026): asked to the cent, said in one line that adds up, and not
 * offered under the card service's smallest payment.
 */
test("the card is asked to the cent and said in one line under its button, which adds up to what the button says", () => {
  // Only where the service's page was read taking cents; the others are asked whole euros, as they were.
  assert.equal(WAY_IN_USDC.cents, true);
  assert.equal(WAY_IN_GIFT_COIN.cents, undefined);
  assert.equal(WAY_IN_CHAIN_COIN.cents, undefined);
  assert.equal(eurosNeededOn(8_948_800n, WAY_IN_GIFT_COIN, 1.1186)! % 1, 0);
  // Up to the cent and never down: a cent short is a gift that cannot be made.
  assert.deepEqual([9.1151, 9.12, 5.04, 5.0401, 23].map(upToTheCent), [9.12, 9.12, 5.04, 5.05, 23]);
  // What a division leaves behind the sixth decimal is not a cent more: 5.04 worked out as 5.0400000001 is 5.04.
  assert.equal(upToTheCent(4.04 + 1), 5.04);
  assert.match(rampnowPage({ euros: 9.1151 }), /srcAmount=9\.12&/);
  assert.match(rampnowPage({ euros: 23 }), /srcAmount=23&/);
  // On the sheet: no line of the sum for the fee or for what stays, and the one line under the button, before the
  // line that says who takes the card.
  const body = sheet.slice(sheet.indexOf("<Sheet "), sheet.indexOf("</Sheet>"));
  assert.doesNotMatch(body, /line\(W\.rows\.fee|rows\.stays/);
  assert.match(body, /\) : sum && sum\.fromAccount > 0 \? \(\s+\/\/[^\n]+\n\s+line\(W\.rows\.fromAccount, less\(sum\.fromAccount\)\)/);
  assert.match(sheet, /const cardSaid = sum\s+\? W\.cardSum\(\{ gift: say\(toDecimals\(sum\.gift - sum\.fromAccount, code\)\), part: sum\.fromAccount > 0, fee: feeCeiling \? W\.upTo\(say\(sum\.fee\)\) : say\(sum\.fee\), stays: sum\.stays > 0 \? say\(sum\.stays\) : null \}\)\s+: null;/);
  assert.ok(body.indexOf("data-card-sum") > body.indexOf("data-pays="), "under the button");
  assert.ok(body.indexOf("data-card-sum") < body.indexOf('{codeFirst ? null : theCode("under")}'), "before the code's key");
  assert.ok(body.indexOf("data-card-sum") < body.indexOf("<CardLine way={way} />"), "and before the line of terms");
});

test("where the sheet is not in euros, the total is said about, and the euros the card is charged are said under the button", () => {
  // Rampnow and Ramp are opened in euros for everybody (the audit of 9 Oct 2026, F19): a sheet in dollars or francs
  // shows the euros at the day's rate, which is not what the bank will take.
  assert.equal(PAY.cardCharged("€34.00"), "Your card is charged €34.00.");
  assert.equal(PAY.about, "about");
  assert.match(sheet, /const converted = code !== "EUR";/);
  assert.match(sheet, /sum \? \{ label: W\.youPay, amount: say\(sum\.card\), about: converted \}/);
  // "about" stands before the figure in the size of a sentence, never in the figure's own.
  assert.match(sheet, /\{total\.about \? <span className=\{`\$\{BODY\} font-normal`\}>\{W\.about\} <\/span> : null\}\s+\{total\.amount\}/);
  assert.match(sheet, /\{sum && converted \? \(\s+<p className=\{HELP\} data-card-charged="">\s+\{W\.cardCharged\(moneyIn\(sum\.cardEuros, "EUR"\)\)\}/);
  const body = sheet.slice(sheet.indexOf("<Sheet "), sheet.indexOf("</Sheet>"));
  // Under the button and the line that adds up, and before the code's key and the card service's own line.
  assert.ok(body.indexOf("data-card-sum") < body.indexOf("data-card-charged"));
  assert.ok(body.indexOf("data-card-charged") < body.indexOf('{codeFirst ? null : theCode("under")}'));
  assert.ok(body.indexOf('{codeFirst ? null : theCode("under")}') < body.indexOf("<CardLine way={way} />"));
  // The euros are the card page's own: what the link asks of it, to the cent.
  assert.match(readFileSync("src/rails.ts", "utf8"), /set\("srcCurrency", "EUR"\);/);
});

test("under the card service's smallest payment no card is offered: the floor is said, and the action is a gift a card can pay for", () => {
  const rates = { date: "2026-10-08", usdPerEur: 1.1186, eurPerUsd: 1 / 1.1186, xofPerUsd: 655.957 / 1.1186, eurPer: { EUR: 1, USD: 1.1186, XOF: 655.957 }, readAtMs: 0 } as Rates;
  const unitsOf = (euros: number) => BigInt(Math.round(euros * rates.usdPerEur * 1_000_000));
  // A gift of 3 euros needs 4.04 of the card, under Rampnow's 5: it used to be asked 5, and 0.96 left in the account.
  assert.equal(eurosNeededOn(unitsOf(3), WAY_IN_USDC, rates.usdPerEur), 4.04);
  assert.equal(wayInFor(unitsOf(3), [WAY_IN_USDC], rates.usdPerEur, {}).atFloor, true);
  // With Rampnow first, that gift is not sent to the next service, which takes it only because its own fee is larger
  // and asks seven: a way that refuses on its floor gives its place only to one that asks less than that floor.
  const three = wayInFor(unitsOf(3), [WAY_IN_USDC, WAY_IN_GIFT_COIN, WAY_IN_CHAIN_COIN], rates.usdPerEur, {});
  assert.equal(eurosNeededOn(unitsOf(3), WAY_IN_GIFT_COIN, rates.usdPerEur), 7);
  assert.deepEqual([three.way.name, three.atFloor, three.insteadOf], ["Rampnow", true, undefined]);
  const dear: WayIn = { ...WAY_IN_USDC, name: "A dearer floor", smallestEur: 25 };
  const eight = wayInFor(unitsOf(8), [dear, WAY_IN_USDC], rates.usdPerEur, {});
  assert.deepEqual([eight.way.name, eight.euros, eight.atFloor, eight.insteadOf?.because], ["Rampnow", 9.12, false, "floor"]);
  // The smallest round gift a card can pay for: 4 euros, whose card payment is 5.05.
  assert.equal(smallestGiftByCard({ way: WAY_IN_USDC, code: "EUR", gift: 3, heldUnits: 0n, rates }), 4);
  assert.equal(smallestGiftByCard({ way: WAY_IN_USDC, code: "EUR", gift: 3.5, heldUnits: 0n, rates }), 4);
  assert.equal(eurosNeededOn(unitsOf(4), WAY_IN_USDC, rates.usdPerEur), 5.05);
  assert.equal(wayInFor(unitsOf(4), [WAY_IN_USDC], rates.usdPerEur, {}).atFloor, false);
  // Round in the sheet's own money: a dollar, a thousand francs.
  assert.equal(smallestGiftByCard({ way: WAY_IN_USDC, code: "USD", gift: 3, heldUnits: 0n, rates }), 5);
  assert.equal(smallestGiftByCard({ way: WAY_IN_USDC, code: "XOF", gift: 2000, heldUnits: 0n, rates }), 3000);
  // With money in the account, the card pays what the account does not: the gift that reaches the floor is larger.
  assert.equal(smallestGiftByCard({ way: WAY_IN_USDC, code: "EUR", gift: 8, heldUnits: unitsOf(6), rates }), 10);
  assert.equal(smallestGiftByCard({ way: WAY_IN_USDC, code: "EUR", gift: 3, heldUnits: 0n, rates: undefined }), undefined, "no rate, no figure");
  assert.equal(PAY.cardStartsAt("€5.00"), "Card payments start at €5.00.");
  assert.equal(PAY.makeTheGift("€4.00"), "Make the gift €4.00");
  // On the sheet: one button still, whose words and press are the gift's when the card is under its floor.
  assert.match(sheet, /const underTheFloor = pays === "card" && !cardClosed && !creditArriving && offer\.atFloor;/);
  assert.match(sheet, /onPress=\{\(\) => \(underTheFloor \? raiseTheGift\(\) : void pay\(\)\)\} data-pays=\{underTheFloor \? "floor" : pays\}>\s+\{underTheFloor \? \(floorGift === undefined \? W\.pay : W\.makeTheGift\(say\(floorGift\)\)\) : enough \?/);
  assert.match(sheet, /\{floorSaid \? \(\s+<p className=\{BODY\} data-card-floor="">\s+\{W\.cardStartsAt\(floorSaid\)\}/);
  // The gift is changed as if it had been typed, in the sheet's own money, and the card under the sheet follows.
  assert.match(sheet, /const typed = String\(floorGift\);\s+onChange\(\{ \.\.\.draft, dollars: formatAusd\(unitsFromTyped\(typed, code, money\.rates\)\)\.slice\(1\), typedAmount: typed, typedIn: code \}\);/);
});

test("one way in, one action, and no button to another (D239)", () => {
  assert.ok(!("another" in PAY), "the second way is not a choice any more");
  assert.doesNotMatch(sheet, /another way|SECONDARY_BUTTON|setChosen/);
  // One action in the sun, and every other button of the sheet a small key (the code's copy, D294), never a second one.
  const body = sheet.slice(sheet.indexOf("<Sheet "), sheet.indexOf("</Sheet>"));
  // The action is the one button (app/kit/Button.tsx), whose look is the sun unless it names another.
  assert.equal((body.match(/<Button [^>]*>/g) ?? []).filter((button) => !/look="/.test(button)).length, 1, "the one action");
  assert.doesNotMatch(body, /PRIMARY_BUTTON/);
  for (const button of body.match(/<button[^>]*>/g) ?? []) assert.match(button, /SMALL_BUTTON/, button);
  // "Have a code?" stays (D297): since 9 Oct 2026 a small key above the card's button, where it was last and folded.
  assert.ok(body.indexOf('theCode("key")') < body.indexOf("data-what-happens"), "the key before the fold");
  assert.equal((sheet.match(/<JudgeCode/g) ?? []).length, 1, "one writing of it, for its two shapes");
  // Which way refused and why is no longer said: the fold holds short lines, and the way that stands is named under the button.
  assert.doesNotMatch(sheet, /insteadSentence|W\.instead/);
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
  // What a floor leaves over is a line of the sheet, "Change, kept in your account": no sentence says it any more.
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
  assert.match(sheet, /fee: feeCeiling \? W\.upTo\(say\(sum\.fee\)\) : say\(sum\.fee\)/);
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
  // What stays is said in the one line under the card's button, and nothing else is said of it.
  assert.match(sheet, /stays: sum\.stays > 0 \? say\(sum\.stays\) : null/);
});

test("one writing of money: what the person typed is what they read, on the sheet and on every screen after it", () => {
  const rates = { date: "2026-10-02", usdPerEur: 1.1225, eurPerUsd: 1 / 1.1225, xofPerUsd: 655.957 / 1.1225, eurPer: { EUR: 1, USD: 1.1225, XOF: 655.957 }, readAtMs: 0 } as Rates;
  // 45 euros typed: the wait, the gift being made and the card that says it is not made yet said "$50.51".
  assert.equal(giftAsTyped({ typedAmount: "45", typedIn: "EUR" }, "$50.51"), "€45.00");
  assert.equal(giftAsTyped({ typedAmount: "45,5", typedIn: "EUR" }, "$51.07"), "€45.50");
  // A money without cents is written without them.
  assert.match(giftAsTyped({ typedAmount: "20000", typedIn: "XOF" }, "$34.22"), /^20\s000\sFCFA$/);
  // A gift kept without the figure typed, or with one that cannot be read, is said in dollars: what it holds.
  assert.equal(giftAsTyped({}, "$30.00"), "$30.00");
  assert.equal(giftAsTyped({ typedAmount: "abc", typedIn: "EUR" }, "$30.00"), "$30.00");
  assert.equal(giftAsTyped({ typedAmount: "30", typedIn: "USD" }, "$30.00"), "$30.00");

  // Everything else on those screens is dollars said in the money typed, when the day's rate for it was read.
  assert.equal(moneyTypedIn({ typedAmount: "45", typedIn: "EUR" }, rates), "EUR");
  assert.equal(moneyTypedIn({ typedAmount: "45", typedIn: "EUR" }, undefined), "USD", "no rate, no conversion: the dollars");
  assert.equal(moneyTypedIn({ typedAmount: "30", typedIn: "USD" }, rates), "USD");
  assert.equal(moneyTypedIn({}, rates), "USD");
  assert.equal(dollarsSaidIn(0n, "EUR", rates, "$0.00"), "€0.00");
  assert.equal(dollarsSaidIn(10_000_000n, "EUR", rates, "$10.00"), "€8.91");
  assert.equal(dollarsSaidIn(10_000_000n, "USD", rates, "$10.00"), "$10.00");
  assert.equal(dollarsSaidIn(10_000_000n, "EUR", undefined, "$10.00"), "$10.00");

  // The sheet: the figure the card started on, which nobody typed, is given to it as the figure typed, so a round
  // 20,000 francs is not read back from its dollars as 19,997.
  const xofUnits = 34_220_000n;
  assert.notEqual(giftTyped({ units: xofUnits, code: "XOF", rates }), 20_000, "read back from the dollars, the round figure is lost");
  assert.equal(giftTyped({ typedAmount: "20000", typedIn: "XOF", units: xofUnits, code: "XOF", rates }), 20_000);
  const card = readFileSync("app/kit/offer/OfferCard.tsx", "utf8");
  assert.match(card, /<PaySheet open=\{paying\} draft=\{starting \? \{ \.\.\.draft, typedAmount: starting\.typed, typedIn: money\.currency \} : draft\}/);
  // The press keeps what the sheet said, on the card and with the payment started.
  const sheet = readFileSync("app/kit/offer/PaySheet.tsx", "utf8");
  assert.match(sheet, /const said: GiftDraft = gift === undefined \? draft : \{ \.\.\.draft, typedAmount: String\(gift\), typedIn: code \};\n\s*onChange\(said\);\n\s*savePendingGift\(\{ \.\.\.draftToTerms\(said, account\), wayIn: way\.name \}\);/);

  // The wait, the gift being made, a payment that fell short: the gift as typed, the account in the same money.
  const wait = readFileSync("app/components/PayGift.tsx", "utf8");
  assert.match(wait, /const gift = giftAsTyped\(typed, formatAusd\(units\)\);/);
  assert.match(wait, /const said = \(amount: bigint\) => dollarsSaidIn\(amount, typedMoney, money\.rates, formatAusd\(amount\)\);/);
  assert.match(wait, /\[W\.waiting\.lines\.gift, W\.waiting\.giftSaid\(gift, recipient, milestone \? undefined : days\)\],\n\s*\[W\.waiting\.lines\.account, balance === null \? "…" : said\(held\)\],/);
  assert.match(wait, /P\.putting\(gift, recipient\)/);
  assert.match(wait, /W\.arrived\.short\(said\(arrived\), gift, moneyIn\(more, "EUR"\), makeItSaid\)/);
  assert.doesNotMatch(wait.slice(wait.indexOf("const gift = giftAsTyped")), /\{W\.arrived\.makeIt\(`\$\$\{makeIt\}`\)\}/);
  assert.deepEqual([FUND.waiting.lines.gift, FUND.waiting.giftSaid("€45.00", "Boo", 30)], ["Your gift", "€45.00 for Boo, 30 days"]);
  assert.equal(FUND.waiting.lines.account, "In your account");
  assert.equal(PAY.putting("€45.00", "Boo"), "Putting €45.00 in Boo's name.");
  // The card on Home and Gifts that says a gift is not made yet.
  const finish = readFileSync("app/kit/FinishTheGift.tsx", "utf8");
  assert.match(finish, /amount: giftAsTyped\(kept, formatAusd\(dollarsToUnits\(kept\.dollars\)\)\)/);
});

test("the judge credit line says how a funder really pays by card here, with the frame's limit", () => {
  assert.equal(PAY.fromJudgeCredit("frame", "Rampnow"), "Paid from your judge credit. A funder pays by card through Rampnow, in a frame inside Viky that has to stay open until the money arrives.");
  assert.equal(PAY.fromJudgeCredit("tab", "Rampnow"), "Paid from your judge credit. A funder pays by card on Rampnow's page, in a tab of its own.");
  assert.equal(PAY.fromJudgeCredit("sheet", "Swapper"), "Paid from your judge credit. A funder pays by card through Swapper, in a sheet inside Viky.");
  assert.doesNotMatch(readFileSync("src/sentences.ts", "utf8"), /once our payment partner is embedded/, "it said so after the frame was switched on");
  // The same test the pay press makes: the frame where it is on and this browser can keep a sign-in in it.
  const sheet = readFileSync("app/kit/offer/PaySheet.tsx", "utf8");
  assert.match(sheet, /const cardPaidHow = \(\): "frame" \| "sheet" \| "tab" => \(way\.embedded \? "sheet" : way === WAY_IN_USDC && rampnowFrameOn\(\) && frameKeepsSignIn\(navigator\.userAgent\) \? "frame" : "tab"\);/);
});
