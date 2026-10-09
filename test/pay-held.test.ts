// What pays for a gift on the pay sheet (the founder, 5 Oct 2026). A tester who had the money read "Pay … by card":
// what the account holds counted as zero until it was read, and for ever when the reading failed, and the dollars a
// card had already delivered were not counted at all. The card is the answer to one thing only: an account that was
// read, and is short.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CONVERSION_RESERVE } from "../src/funding-step";
import { heldForTheLines, payWith, unitsHeld, type HeldParts, type HeldReading } from "../src/pay-held";
import { PAY } from "../src/sentences";

const dollars = (amount: number) => BigInt(Math.round(amount * 1_000_000));
const parts = (over: Partial<HeldParts> = {}): HeldParts => ({ ausd: 0n, usdc: 0n, inGifts: 0n, coin: 0n, coinWorth: null, ...over });
const read = (over: Partial<HeldParts> = {}): HeldReading => ({ state: "read", parts: parts(over) });
const WANTED = dollars(19);

test("until the account is read nothing is named, and a reading that failed is never the card", () => {
  assert.equal(payWith({ signedIn: true, held: { state: "reading" }, wanted: WANTED }), "reading");
  assert.equal(payWith({ signedIn: true, held: { state: "unread" }, wanted: WANTED }), "unread");
  // What is not read counts for nothing on the lines either: no "from your account" is said of it.
  assert.equal(heldForTheLines(true, { state: "reading" }), 0n);
  assert.equal(heldForTheLines(true, { state: "unread" }), 0n);
  // Nobody signed in holds nothing here: the card, and the press makes the account.
  assert.equal(payWith({ signedIn: false, held: { state: "reading" }, wanted: WANTED }), "card");
  assert.equal(heldForTheLines(false, read({ ausd: dollars(50) })), 0n);
});

test("an account read and short is the card's; one that holds the gift pays it", () => {
  assert.equal(payWith({ signedIn: true, held: read({ ausd: dollars(10) }), wanted: WANTED }), "card");
  assert.equal(payWith({ signedIn: true, held: read({ ausd: dollars(19) }), wanted: WANTED }), "account");
  assert.equal(payWith({ signedIn: true, held: read({ ausd: dollars(50) }), wanted: WANTED }), "account");
  assert.equal(payWith({ signedIn: true, held: read(), wanted: WANTED }), "card");
  // A gift not filled in has nothing to cover yet.
  assert.equal(payWith({ signedIn: true, held: read({ ausd: dollars(50) }), wanted: undefined }), "card");
});

test("the dollars a card already delivered count, and what the person's gifts hold for them, as on Home", () => {
  // A card payment that arrived and made no gift: its dollars are in the account, in the other dollar coin.
  assert.equal(payWith({ signedIn: true, held: read({ usdc: dollars(21.3) }), wanted: WANTED }), "account");
  assert.equal(payWith({ signedIn: true, held: read({ ausd: dollars(9), usdc: dollars(6), inGifts: dollars(4) }), wanted: WANTED }), "account");
  assert.equal(unitsHeld(parts({ ausd: dollars(9), usdc: dollars(6), inGifts: dollars(4) })), dollars(19));
  // Each coin cut to the cent before they are added, exactly as Home's figure is (D124).
  assert.equal(unitsHeld(parts({ ausd: dollars(10.13), usdc: 9_600n })), dollars(10.13));
  const home = readFileSync("app/kit/money.ts", "utf8");
  assert.match(home, /return dollarsToTheCent\(\(holdings\[AUSD\.symbol\] \?\? 0n\) \+ inGifts, holdings\[USDC\.symbol\] \?\? 0n\);/);
  assert.match(readFileSync("src/pay-held.ts", "utf8"), /dollarsToTheCent\(parts\.ausd \+ parts\.inGifts, parts\.usdc\)/);
  // The other dollar coin is read only where the step that changes it exists, as the screen that waits reads it.
  const reader = readFileSync("src/client/pay-held.ts", "utf8");
  assert.match(reader, /usdcRouterAddress\(\) \? readCoinBalance\(USDC, address\) : Promise\.resolve\(0n\)/);
  assert.match(readFileSync("app/components/PayGift.tsx", "utf8"), /usdcRouterAddress\(\) \? readCoinBalance\(USDC, address\) : undefined/);
});

test("the chain's own coin counts at the exchange's quote; with no quote and a gift that needs it, the account is unread", () => {
  const coin = CONVERSION_RESERVE * 100n;
  assert.equal(payWith({ signedIn: true, held: read({ coin, coinWorth: dollars(25) }), wanted: WANTED }), "account");
  assert.equal(unitsHeld(parts({ ausd: dollars(1), coin, coinWorth: dollars(25.019) })), dollars(26.01));
  // The quote did not answer and the gift needs that coin: not known, and never the card.
  assert.equal(payWith({ signedIn: true, held: read({ ausd: dollars(1), coin, coinWorth: null }), wanted: WANTED }), "unread");
  // The quote did not answer and the dollars alone cover the gift: the account pays.
  assert.equal(payWith({ signedIn: true, held: read({ ausd: dollars(19), coin, coinWorth: null }), wanted: WANTED }), "account");
  // No such coin held: a quote is not asked, and its absence is nothing.
  assert.equal(payWith({ signedIn: true, held: read({ ausd: dollars(1) }), wanted: WANTED }), "card");
});

test("the sheet: one reading that fails whole, a button that does not go while nothing is settled, and what reads again", () => {
  const sheet = readFileSync("app/kit/offer/PaySheet.tsx", "utf8");
  // Not known until read: the state starts as a reading, and a failure is kept as one.
  assert.match(sheet, /useState<HeldReading>\(\{ state: "reading" \}\)/);
  assert.match(sheet, /\.catch\(\(\) => \{\n\s*if \(live\) setHeld\(\{ state: "unread" \}\);\n\s*\}\);/);
  assert.doesNotMatch(sheet, /held \?\? 0n/);
  // The button does not go, and the press does nothing, while what pays is not settled.
  // Nor while the card service is asked its price (9 Oct 2026): no figure is named, so there is none to press on.
  assert.match(sheet, /<Button waiting=\{!ready \|\| !settled \|\| quoteAwaited \|\| status === "busy"\} doing=\{busy \? W\.paying : null\}/);
  assert.match(sheet, /if \(!ready \|\| units === undefined \|\| !settled\) return;/);
  // The card's lines, its figure and its line of terms are drawn for the card alone.
  // And not in the moment a judge's credit, just given, is being read (9 Oct 2026), nor under the card service's
  // smallest payment, where no card is offered.
  assert.match(sheet, /const byCard = pays === "card" && !cardClosed && !creditArriving && !underTheFloor;/);
  assert.match(sheet, /\{pays !== "card" \? null : cardClosed \? \(/);
  // The wait is said under the button, and the failure with what reads again.
  assert.match(sheet, /\{pays === "reading" \? <WaitLine>\{W\.readingAccount\}<\/WaitLine> : null\}/);
  assert.match(sheet, /<FieldRefusal id="account-unread">\{W\.accountUnread\}<\/FieldRefusal>/);
  assert.match(sheet, /onClick=\{\(\) => setBalanceRead\(\(n\) => n \+ 1\)\}>\n\s*\{W\.readAgain\}/);
  assert.equal(PAY.readingAccount, "Reading what your account holds.");
  assert.equal(PAY.accountUnread, "What your account holds could not be read.");
  assert.equal(PAY.readAgain, "Read it again");
  assert.equal(PAY.pay, "Pay");
  // One reading: every part or none. A part that could not be read is not counted as nothing.
  const reader = readFileSync("src/client/pay-held.ts", "utf8");
  assert.match(reader, /await Promise\.all\(\[\n\s*readAusdBalance\(address\),/);
  assert.match(reader, /loadMyGifts\(\),\n\s*\]\);/);
});
