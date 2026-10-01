import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CASH_OUT, USE_MONEY } from "../src/sentences";
import { RAMP_BARE_PAGE, RAMP_SELL_PAGE, WAY_OUT_CARD, WAY_OUT_EURO, wayOutFillsIn, wayOutPage } from "../src/rails";

/**
 * The page a way out opens, the twin of test/way-in-page.test.ts (the audit of 1 Oct 2026).
 *
 * The bank's step opened Ramp's widget with `swapAsset` and `flow` and no partner key, and Ramp answered "Integration
 * issue detected" to somebody whose money had just been changed for it. Without the key, Ramp's own selling page opens,
 * with nothing in its address (opened 1 Oct 2026: it lands on selling, and USDC marked Monad is listed there). With the
 * key, the widget opens told what is sold, how much and from which account.
 */

const ACCOUNT = "0x000000000000000000000000000000000000dEaD";
const screen = readFileSync("app/components/CashOut.tsx", "utf8");

test("without Ramp's key, the bank's step opens Ramp's own selling page, with nothing in its address", () => {
  assert.equal(wayOutPage(WAY_OUT_EURO, { account: ACCOUNT, units: 9_990_000n }, undefined), RAMP_SELL_PAGE);
  assert.equal(RAMP_SELL_PAGE, "https://rampnetwork.com/sell");
  assert.notEqual(RAMP_SELL_PAGE, RAMP_BARE_PAGE, "never the bare page, which lands on its home page open on buying");
  assert.equal(new URL(RAMP_SELL_PAGE).search, "", "no parameter: its widget refuses any without a key");
  assert.equal(wayOutFillsIn(WAY_OUT_EURO, undefined), false);
});

test("with the key, the page carries the flow, the coin, its quantity in the coin's own units and the account it leaves", () => {
  const page = new URL(wayOutPage(WAY_OUT_EURO, { account: ACCOUNT, units: 9_990_000n }, "pk_test"));
  assert.equal(page.origin, "https://app.ramp.network");
  assert.equal(page.searchParams.get("hostApiKey"), "pk_test");
  assert.equal(page.searchParams.get("enabledFlows"), "OFFRAMP");
  assert.equal(page.searchParams.get("defaultFlow"), "OFFRAMP");
  assert.equal(page.searchParams.get("swapAsset"), "MONAD_USDC");
  assert.equal(page.searchParams.get("swapAmount"), "9990000");
  assert.equal(page.searchParams.get("userAddress"), ACCOUNT);
  assert.equal(page.searchParams.get("flow"), null, "the word its address used to carry is not one its configuration documents");
  assert.equal(wayOutFillsIn(WAY_OUT_EURO, "pk_test"), true);
});

test("Mercuryo keeps its own page, which opens on buying, so the step says to press Sell there", () => {
  assert.equal(wayOutPage(WAY_OUT_CARD, { account: ACCOUNT, units: 1n }, "pk_test"), WAY_OUT_CARD.page);
  assert.equal(wayOutFillsIn(WAY_OUT_CARD, "pk_test"), false);
  assert.equal(CASH_OUT.onTheirPage("Mercuryo", WAY_OUT_CARD.sells, "138.43", false), "On Mercuryo's page, tap Sell. Pick MON, the one marked Monad, and type 138.43.");
  // Ramp's selling page opens on selling: nothing to press first.
  assert.equal(CASH_OUT.onTheirPage("Ramp", WAY_OUT_EURO.sells, "9.99", true), "On Ramp's page, pick USDC, the one marked Monad, and type 9.99.");
  assert.match(screen, /\{wayOutFillsIn\(chosen\) \? null : <p className=\{BODY\}>\{W\.onTheirPage\(chosen\.name, chosen\.sells, ready\.number, chosen === WAY_OUT_EURO\)\}<\/p>\}/);
});

test("every link of the screen opens the page this builds, and one gesture copies the code and opens it", () => {
  assert.doesNotMatch(screen, /chosen\.page/, "never the way's bare address");
  assert.match(screen, /<a href=\{wayOutPage\(chosen, \{ account: address, units: ready\.units \}\)\} target="_blank" rel="noopener noreferrer" onClick=\{copyCode\}/);
  assert.equal(CASH_OUT.copyAndOpen("Ramp"), "Copy my code and open Ramp");
  assert.equal(CASH_OUT.comeBack("Ramp"), "Ramp opens in a new tab and uses its own words. Come back to this tab with the code it gives you.");
  assert.ok(!("order" in CASH_OUT), "the separate button that opened the page is gone");
  // The code is still shown whole, above the gesture, so it can be compared with what was pasted (decision 9).
  const step = screen.slice(screen.indexOf("W.step2(chosen.name)"), screen.indexOf("W.itIsYours(chosen.name)"));
  assert.ok(step.indexOf("{address}</p>") < step.indexOf("W.copyAndOpen(chosen.name)"));
  assert.equal((step.match(/<button/g) ?? []).length, 0, "no second button to copy");
});

test("nothing opens on step 2 by itself any more: the first screen says what is ready and offers the way back", () => {
  assert.doesNotMatch(screen, /resumed/, "the forced resume is gone");
  const refresh = screen.slice(screen.indexOf("const refresh = useCallback"), screen.indexOf("const held = (coin: Coin)"));
  assert.doesNotMatch(refresh, /setStage\(/, "reading the balances moves the person nowhere");
  assert.equal(CASH_OUT.continueReady("Ramp"), "Continue with Ramp");
  assert.equal((screen.match(/onClick=\{\(\) => continueWith\(firstReady\)\}/g) ?? []).length, 2, "on the balance, and on the card that leads when only that is held");
});

test("a person taking their money out reads 'amount', never 'price', and the cost of sending in dollars", () => {
  // Every sentence of the way out, whatever it is called in the code: the plain ones, and each one that takes figures.
  const said: string[] = [];
  const gather = (value: unknown): void => {
    if (typeof value === "string") said.push(value);
    else if (typeof value === "function") said.push(String((value as (...given: string[]) => unknown)("a", "b on c", "d", "e")));
    else if (value && typeof value === "object") Object.values(value).forEach(gather);
  };
  gather(CASH_OUT);
  assert.ok(said.length > 80);
  for (const sentence of said) assert.doesNotMatch(sentence, /price/i, sentence);
  assert.equal(CASH_OUT.priceHolds, "This amount holds for 4 minutes.");
  assert.equal(CASH_OUT.failures.seeTheNewPrice, "See the new amount");
  assert.equal(CASH_OUT.sendingCost("$0.03", false), "Sending cost about $0.03.");
  assert.equal(CASH_OUT.sendingCost("$0.00", true), "Sending cost less than $0.01.");
  assert.doesNotMatch(screen, /cost = exactly\(/, "never in the coin it was paid in");
  assert.match(screen, /cost = \{ dollars: formatAusd\(inDollars\), underACent: inDollars < 10_000n \};/);
});

test("the bank's card says how its service pays in the person's country, by that service's own method", () => {
  assert.equal(USE_MONEY.bankBy("SEPA", "EUR"), USE_MONEY.bank.body);
  assert.equal(USE_MONEY.bankBy("AMERICAN_BANK_TRANSFER", "USD"), "A transfer in dollars to your bank account. Our partner Ramp asks for your ID, once.");
  assert.equal(USE_MONEY.bankBy("PIX", "BRL"), "A transfer in reais to your bank account. Our partner Ramp asks for your ID, once.");
  assert.equal(USE_MONEY.bankBy("CARD", "EUR"), "Onto your card. Our partner Ramp asks for your ID, once.");
  assert.doesNotMatch(USE_MONEY.bankBy("AMERICAN_BANK_TRANSFER", "USD"), /IBAN|euros|two working days/, "nothing of the euro transfer is said to an account in the United States");
});
