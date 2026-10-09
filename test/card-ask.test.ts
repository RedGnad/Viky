// What a screen knows of what the card is asked (the founder, 9 Oct 2026): Rampnow's own quote in the money the
// screen is read in when it gives one, the rule in dollars otherwise, and nothing named while the quote is asked.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { askOfTheQuote, askOfTheRule, askToPay, usdcToAsk, type CardAskState } from "../src/card-ask";
import { ASK_KEPT_MS, cardAskKept, keepCardAsk, QUOTE_WAIT_MS } from "../src/client/card-ask";
import { eurosToBuyOn, wayInFor } from "../src/gift-amount";
import { WAY_IN_GIFT_COIN, WAY_IN_USDC } from "../src/rails";
import { PAY } from "../src/sentences";

const RATE = 1.1186;

test("Rampnow's page is opened in dollars by the rule, and the quote is asked for the gift and its one part in a hundred", () => {
  assert.equal(WAY_IN_USDC.paidIn, "USD");
  assert.equal(WAY_IN_GIFT_COIN.paidIn, undefined, "Ramp's page stays in euros");
  // Ten dollars short: 10.10101 USDC to ask for, in millionths, rounded up; nothing when nothing is short.
  assert.equal(usdcToAsk(10_000_000n), 10_101_011n);
  assert.equal(usdcToAsk(1n), 2n);
  assert.equal(usdcToAsk(0n), 0n);
  assert.equal(usdcToAsk(-5n), 0n);
});

test("by the rule: dollars to the cent, or the floor of six dollars when the gift is under it; nothing without a rate", () => {
  const ten = wayInFor(10_000_000n, [WAY_IN_USDC], RATE, {});
  const rule = askOfTheRule(ten, RATE);
  assert.equal(rule.state, "ask");
  if (rule.state !== "ask") return;
  assert.deepEqual([rule.ask.currency, rule.ask.amount, Math.round(rule.ask.fee * 100) / 100, rule.quoted], ["USD", 11.35, 1.24, false]);
  assert.deepEqual(askOfTheRule(wayInFor(3_000_000n, [WAY_IN_USDC], RATE, {}), RATE), { state: "under", floor: { currency: "USD", amount: 6 } });
  assert.deepEqual(askOfTheRule({ way: WAY_IN_USDC, euros: undefined, atFloor: false }, undefined), { state: "none" });
  assert.deepEqual(askOfTheRule({ way: WAY_IN_USDC, euros: 5, atFloor: true }, undefined), { state: "none" });
  // A way opened in euros is asked in euros, as it always was.
  const ramp = askOfTheRule(wayInFor(30_000_000n, [WAY_IN_GIFT_COIN], RATE, {}), RATE);
  assert.equal(ramp.state === "ask" ? ramp.ask.currency : ramp.state, "EUR");
});

test("from Rampnow's answer: its quote in the money asked, its floor, and the rule whenever it gives no quote", () => {
  const rule: CardAskState = { state: "ask", ask: { currency: "USD", amount: 11.35, fee: 1.24 }, quoted: false };
  assert.deepEqual(askOfTheQuote({ state: "quoted", quote: { currency: "EUR", amount: 10.14, fee: 1.11, arrives: 10.11 } }, rule), { state: "ask", ask: { currency: "EUR", amount: 10.14, fee: 1.11 }, quoted: true });
  assert.deepEqual(askOfTheQuote({ state: "under", currency: "EUR", smallest: 5 }, rule), { state: "under", floor: { currency: "EUR", amount: 5 } });
  for (const none of [{ state: "none", because: "off" }, { state: "none", because: "not-taken" }, { state: "none", because: "silent" }, { state: "none", because: "not-understood" }, "late"] as const) {
    assert.deepEqual(askOfTheQuote(none, rule), rule, JSON.stringify(none));
  }
  // What a screen that must be paid asks of the card: the amount, or the smallest payment when the gift is under it.
  assert.deepEqual(askToPay(rule), { currency: "USD", amount: 11.35 });
  assert.deepEqual(askToPay({ state: "under", floor: { currency: "USD", amount: 6 } }), { currency: "USD", amount: 6 });
  assert.equal(askToPay({ state: "asking" }), undefined);
  assert.equal(askToPay({ state: "none" }), undefined);
  // The wait is always payable: its rule never goes under the floor.
  assert.equal(Math.round(eurosToBuyOn(3_000_000n, WAY_IN_USDC, RATE)! * RATE * 100), 600);
});

test("the ask a pay press was made on is kept for the wait that follows: ten minutes, for that amount left and that money", () => {
  const kept = new Map<string, string>();
  const saved = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = { sessionStorage: { getItem: (key: string) => kept.get(key) ?? null, setItem: (key: string, value: string) => void kept.set(key, value) } };
  try {
    const ask = { currency: "EUR", amount: 9.12, fee: 1.04 };
    keepCardAsk({ ask, quoted: true, forUnits: "8948800", code: "EUR" }, 1_000);
    assert.deepEqual(cardAskKept(8_948_800n, "EUR", 1_000 + ASK_KEPT_MS - 1), { ask, quoted: true });
    assert.equal(cardAskKept(8_948_800n, "EUR", 1_000 + ASK_KEPT_MS), null, "past ten minutes it is asked again");
    assert.equal(cardAskKept(8_948_801n, "EUR", 2_000), null, "another amount left to pay");
    assert.equal(cardAskKept(8_948_800n, "USD", 2_000), null, "another money");
    kept.set("viky.card-ask", "not json");
    assert.equal(cardAskKept(8_948_800n, "EUR", 2_000), null);
    kept.set("viky.card-ask", JSON.stringify({ ask: { currency: "EUR", amount: -1, fee: 0 }, quoted: true, forUnits: "8948800", code: "EUR", at: 2_000 }));
    assert.equal(cardAskKept(8_948_800n, "EUR", 2_000), null, "an amount of nothing is no ask");
  } finally {
    (globalThis as { window?: unknown }).window = saved;
  }
  // A browser that keeps nothing asks again, and breaks nothing.
  assert.equal(cardAskKept(1n, "EUR"), null);
  keepCardAsk({ ask: { currency: "EUR", amount: 1, fee: 0 }, quoted: false, forUnits: "1", code: "EUR" });
});

test("the screens: the server says on the page whether quotes are asked, the quote is waited for three seconds and no more, and no figure is named meanwhile", () => {
  assert.equal(QUOTE_WAIT_MS, 3_000);
  assert.equal(PAY.readingCardPrice, "Reading the card's price.");
  assert.equal(PAY.cardCharged("$11.35"), "Your card is charged $11.35.");
  // Said by the server, from the one setting, on the page itself: no request is spent to learn it.
  assert.match(readFileSync("app/layout.tsx", "utf8"), /<body className="antialiased" data-card-quotes=\{rampnowQuotesOn\(\) \? "on" : undefined\}>/);
  const hook = readFileSync("src/client/card-ask.ts", "utf8");
  assert.match(hook, /return document\.body\.dataset\.cardQuotes === "on";/);
  assert.match(hook, /const asks = on && quotes && offer\.way === WAY_IN_USDC && need > 0n;/, "asked for Rampnow alone, when this deployment asks");
  // The first of the two says: the answer, or three seconds. What comes after changes nothing.
  assert.match(hook, /const say = \(said: QuoteSaid\) => \{\s+if \(!waited\) return;\s+waited = false;\s+setAnswer\(\{ name, said \}\);\s+\};\s+const cut = setTimeout\(\(\) => say\("late"\), QUOTE_WAIT_MS\);/);
  assert.match(hook, /if \(answer\?\.name !== name\) return \{ state: "asking" \};/);
  assert.match(hook, /getJson<QuoteSaid>\(`\/api\/rails\/card-quote\?currency=\$\{encodeURIComponent\(code\)\}&units=\$\{need\}`\)/);
  const sheet = readFileSync("app/kit/offer/PaySheet.tsx", "utf8");
  assert.match(sheet, /const quoteAwaited = cardInPlay && asked\.state === "asking";/);
  assert.match(sheet, /<Button waiting=\{!ready \|\| !settled \|\| quoteAwaited \|\| status === "busy"\}/, "the button does not go while the price is asked");
  assert.match(sheet, /\{quoteAwaited \? <WaitLine>\{W\.readingCardPrice\}<\/WaitLine> : null\}/);
  assert.match(sheet, /\) : quoteAwaited \? \(\s+\/\/[^\n]+\n\s+\/\/[^\n]+\n\s+<div aria-hidden="true" data-pay-total-awaited="">/, "the total's place is kept, with nothing in it");
  // A card charged in the sheet's own money is said exactly; in another, about, with what it is charged under the line.
  assert.match(sheet, /const converted = sum !== undefined && sum\.charged\.currency !== code;/);
  assert.match(sheet, /if \(!enough && asked\.state === "ask"\) keepCardAsk\(\{ ask: asked\.ask, quoted: asked\.quoted, forUnits: short\.toString\(\), code \}\);/);
  // The wait says and opens the same amount, and opens no page of Rampnow's while its price is asked.
  const wait = readFileSync("app/components/PayGift.tsx", "utf8");
  assert.match(wait, /const cardAsked = useCardAsk\(\{ on: step === "paying" && Boolean\(address\) && cardShort > 0n, offer: \{ way: wayIn, euros: ruleEuros, atFloor: false \}, short: cardShort, code: askMoney, usdPerEur: money\.rates\?\.usdPerEur, kept: true \}\);/);
  assert.match(wait, /ask=\{toPay\}\s+asking=\{askAwaited\}/);
  assert.match(readFileSync("app/kit/offer/RampnowSheet.tsx", "utf8"), /if \(!open \|\| !account \|\| finishing \|\| asking\) return;/);
  // The judges page says the currency as this deployment does it, and that no payment was made in dollars yet.
  const judges = readFileSync("app/judges/page.tsx", "utf8");
  assert.match(judges, /<span data-rampnow-currency>\s+\{rampnowQuotesOn\(\)/);
  assert.match(judges, /Every card payment made\s+through it so far was made in euros, which was the only currency until that day: none has been made in dollars or\s+in another currency\./);
});
