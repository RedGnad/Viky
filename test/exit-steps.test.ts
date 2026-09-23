import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { AUSD, MON, USDC } from "../src/coins";
import { dollarsToChange, dollarsToTheCent, feeApplied, floorToOrder, netOfEverything, orderByWhatReaches, readyFor, toTheCent, twoDecimalsDown, unitsOfTwoDecimals } from "../src/exit-steps";
import { CONVERSION_RESERVE } from "../src/funding-step";
import { WAY_OUT_CARD, WAY_OUT_EURO, WAYS_OUT } from "../src/rails";
import { CASH_OUT } from "../src/sentences";

/**
 * The arithmetic of the three steps of the way out (flows W3 to W9, 17 Sep 2026). A payout service is ordered
 * for a two-decimal number and expects that number, so the person only ever meets such numbers, cut down and
 * never rounded up: the figure that failed the first real order was 9.999586, which no order field takes.
 */

test("a balance is cut to two decimals, never rounded up", () => {
  assert.equal(twoDecimalsDown(9_999_586n, 6), "9.99", "the first real conversion, and what Ramp was ordered for");
  assert.equal(twoDecimalsDown(9_990_000n, 6), "9.99");
  assert.equal(twoDecimalsDown(20_994_751n, 6), "20.99");
  assert.equal(twoDecimalsDown(138_436_143_573_911_778_147n, 18), "138.43");
  assert.equal(twoDecimalsDown(5n, 6), "0.00");
  assert.equal(twoDecimalsDown(0n, 6), "0.00");
});

test("the two-decimal number is exactly what leaves, in the coin's own units", () => {
  assert.equal(unitsOfTwoDecimals("9.99", 6), 9_990_000n);
  assert.equal(unitsOfTwoDecimals("10", 6), 10_000_000n);
  assert.equal(unitsOfTwoDecimals("138.43", 18), 138_430_000_000_000_000_000n);
  for (const units of [9_999_586n, 20_994_751n, 1_000_000n, 123_456_789n]) {
    const cut = unitsOfTwoDecimals(twoDecimalsDown(units, 6), 6);
    assert.ok(cut <= units && units - cut < 10_000n, `${units} cut to ${cut}, dust under a cent`);
  }
});

test("what stays behind is said honestly, and never as a number with nothing to hold on to", () => {
  // The dust is always under a hundredth of what the service buys, because the order is floored to two decimals.
  // On a dollar rail that hundredth is a cent; on the other it is a hundredth of what that service buys, and the
  // sentence says so rather than printing a quantity a person cannot price (D104).
  assert.equal(CASH_OUT.staysDollars, "Less than $0.01 stays in your account.");
  assert.equal(CASH_OUT.staysQuantity("Mercuryo"), "Less than 0.01 of what Mercuryo buys stays in your account.");
  const card = readyFor(WAY_OUT_CARD, MON, CONVERSION_RESERVE + 138_436_143_573_911_778_147n);
  assert.ok(card && card.dust < 10n ** 16n, "the dust is under a hundredth of the coin, which is what the sentence says");
  const bank = readyFor(WAY_OUT_EURO, USDC, 9_999_586n);
  assert.ok(bank && bank.dust < 10_000n, "under a cent, which is what the dollar sentence says");
});

test("what is ready to send comes from the balance of the coin that service buys, above the reserve", () => {
  const euro = readyFor(WAY_OUT_EURO, USDC, 9_999_586n);
  assert.deepEqual(euro, { number: "9.99", units: 9_990_000n, dust: 9_586n });
  assert.equal(readyFor(WAY_OUT_EURO, USDC, 5_000n), undefined, "under a cent is nothing to order");
  assert.equal(readyFor(WAY_OUT_EURO, USDC, 0n), undefined);

  // The chain's own coin keeps the reserve an account cannot spend (D53): only what sits above it is ready.
  const held = CONVERSION_RESERVE + 138_436_143_573_911_778_147n;
  const card = readyFor(WAY_OUT_CARD, MON, held);
  assert.equal(card?.number, "138.43");
  assert.equal(card?.units, 138_430_000_000_000_000_000n);
  assert.equal(readyFor(WAY_OUT_CARD, MON, CONVERSION_RESERVE), undefined, "the reserve alone is not money to send");
  assert.equal(readyFor(WAY_OUT_CARD, MON, CONVERSION_RESERVE - 1n), undefined);
});

test("the amount to get ready is read in dollars and cents, against what a gift holds", () => {
  const refusals = CASH_OUT.refusals;
  assert.deepEqual(dollarsToChange("10", 20_994_751n, refusals), { units: 10_000_000n });
  assert.deepEqual(dollarsToChange("20,99", 20_994_751n, refusals), { units: 20_990_000n }, "a comma is what half the world types");
  assert.deepEqual(dollarsToChange("10.999", 20_994_751n, refusals), { refusal: refusals.shape }, "three decimals are refused, never guessed at");
  assert.deepEqual(dollarsToChange("1e3", 20_994_751n, refusals), { refusal: refusals.shape });
  assert.deepEqual(dollarsToChange("0", 20_994_751n, refusals), { refusal: refusals.shape });
  assert.deepEqual(dollarsToChange("25", 20_994_751n, refusals), { refusal: refusals.tooMuch("20.99") }, "the refusal carries the figure they do have");
  assert.equal(AUSD.decimals, 6);
});

test("the fee on the review is the one that applies, and the net is what reaches the bank", () => {
  // 8.66 EUR: 0.99 % is 0.09, under the 1.99 minimum, so the minimum applies and 6.67 reaches the bank.
  assert.deepEqual(feeApplied(8.66, WAY_OUT_EURO.fee), { fee: 1.99, net: 6.67 });
  // 1,000 EUR: 0.99 % is 9.90, over the minimum, so the share applies.
  assert.deepEqual(feeApplied(1_000, WAY_OUT_EURO.fee), { fee: 9.9, net: 990.1 });
  // Never a negative net.
  assert.deepEqual(feeApplied(1, WAY_OUT_EURO.fee), { fee: 1.99, net: 0 });
});

test("each way out says what would reach the person, and says nothing without a rate", () => {
  const rates = { date: "2026-09-18", eurPerUsd: 0.86 };
  // $20.99 is 18.05 EUR at that rate; Ramp keeps 0.99 % of it, which is 0.18, under its 1.99 minimum.
  const ramp = netOfEverything(20_990_000n, WAY_OUT_EURO.fee, rates);
  assert.deepEqual(ramp, { net: 16.06, currency: "EUR", rateDate: "2026-09-18" });
  // The two ways out can now be compared by what reaches the person, which is the whole point of the figure.
  const card = netOfEverything(20_990_000n, WAY_OUT_CARD.fee, rates);
  assert.ok(card && card.net < ramp!.net, "the card rail keeps more of it, and the cards say so");
  // Without a rate, nothing at all: a figure with no rate behind it is a number nobody read.
  assert.equal(netOfEverything(20_990_000n, WAY_OUT_EURO.fee, undefined), undefined);
  // And nothing on an empty account, where there is nothing to send and no comparison to make.
  assert.equal(netOfEverything(0n, WAY_OUT_EURO.fee, rates), undefined);
});

test("the floor the quote shows is cut to the number that can be ordered", () => {
  assert.equal(floorToOrder("$9.995586"), "9.99");
  assert.equal(floorToOrder("$10"), "10.00");
  assert.equal(floorToOrder("$0.5"), "0.50");
  assert.equal(floorToOrder("$28.56"), "28.56");
});

/**
 * One number for the money on the screen (D124). The two dollar coins are added for the figure at the head, and adding
 * their six decimals first let dust under a cent tip it: 10.13 of what a gift holds and 0.0096 left from a payout read
 * "$10.14" over two cards computed on $10.13 (the founder, 20 Sep 2026). Each coin is cut to the cent first.
 */
test("the dollars an account holds are each coin cut to the cent, then added", () => {
  assert.equal(toTheCent(10_139_586n, 6), 10_130_000n);
  assert.equal(toTheCent(9_586n, 6), 0n, "dust under a cent is nothing a screen can say");
  assert.equal(dollarsToTheCent(10_130_412n, 9_586n), 10_130_000n, "the founder's screen: 10.13, once");
  assert.equal(dollarsToTheCent(10_130_412n, 500_000n), 10_630_000n, "half a dollar of the other coin counts");
  assert.equal(dollarsToTheCent(0n, 0n), 0n);
});

/**
 * The order of the ways out (D124, replacing the arbitration of 19 Sep): the country may send a way to the back and
 * that is all it may do (R1); among the rest, the way that leaves the most goes first; a way with no figure keeps its
 * place after those with one; nothing is removed.
 */
test("the ways out are ordered by what reaches the person, after the country has had its one say", () => {
  const net = (way: { name: string }) => ({ Ramp: 16.06, Mercuryo: 14.05 })[way.name];
  const ways = WAYS_OUT.map((way) => ({ name: way.name }));
  assert.deepEqual(orderByWhatReaches(ways, {}, net).map((way) => way.name), ["Ramp", "Mercuryo"]);
  assert.deepEqual(orderByWhatReaches([...ways].reverse(), {}, net).map((way) => way.name), ["Ramp", "Mercuryo"], "the register's order does not decide");
  assert.deepEqual(orderByWhatReaches(ways, { Ramp: "does-not" }, net).map((way) => way.name), ["Mercuryo", "Ramp"], "the country sends a way back");
  assert.deepEqual(orderByWhatReaches(ways, { Ramp: "unknown", Mercuryo: "serves" }, net).map((way) => way.name), ["Ramp", "Mercuryo"], "a silence is not a refusal");
  assert.deepEqual(orderByWhatReaches(ways, {}, () => undefined).map((way) => way.name), ["Ramp", "Mercuryo"], "no figure, the register's order");
  assert.equal(orderByWhatReaches(ways, { Ramp: "does-not", Mercuryo: "does-not" }, net).length, 2, "nothing is removed");
});

/**
 * Look 2 (D88) gives a screen one accent surface, and it marks the one action the screen is waiting for. On the way
 * out it marks the first card, which is where the order puts the way that leaves the most (D124), and on the screen
 * holding steps 2 and 3 it sits on placing the order until a code can be sent to, then on sending.
 */
test("the way out shows one accent surface at a time, on the action it is waiting for (S4)", () => {
  const screen = readFileSync("app/components/CashOut.tsx", "utf8");
  // The base: the first card carries the accent when it has a figure, and only then; the second never does.
  assert.match(screen, /const leads = index === 0 && net !== undefined;/);
  assert.match(screen, /onClick=\{\(\) => start\(way\)\}[^>]*className=\{leads \? PRIMARY_BUTTON : SECONDARY_BUTTON\}/);
  // The gap is said on that card, and only when both figures exist and this one is the larger.
  assert.match(screen, /const gap = leads && other && otherNet && net\.net > otherNet\.net \? net\.net - otherNet\.net : undefined;/);
  assert.match(screen, /W\.moreThan\(figureIn\(gap, net!\.currency\), other\.title\)/);
  assert.equal(CASH_OUT.moreThan("€2.01", "Your card"), "€2.01 more than to your card.");
  // The figures come from one number: what can be changed, cut to the cent, and the head of the screen adds the other
  // coin cut the same way. Nothing on a card is computed on the six-decimal balance any more. What the gifts hold for
  // the account is part of that number, since the way out takes it first (D208).
  assert.match(screen, /const changeable = toTheCent\(ausd \+ giftsHold, AUSD\.decimals\);/);
  assert.match(screen, /const dollarsHeld = dollarsToTheCent\(ausd \+ giftsHold, held\(USDC\)\);/);
  assert.match(screen, /netOfEverything\(changeable, way\.fee, money\.rates\)/);
  assert.doesNotMatch(screen, /netOfEverything\(ausd,/);
  // The card in the person's words: its title, its one line, and no source on it; the sources are behind the fold.
  assert.match(screen, /<h3 className=\{CARD_TITLE\}>\{way\.title\}<\/h3>/);
  assert.match(screen, /<p className=\{BODY\}>\{way\.line\}<\/p>/);
  const cards = screen.slice(screen.indexOf("{ordered.map((way, index) => {"), screen.indexOf("<details className={HELP}>"));
  assert.doesNotMatch(cards, /sourceLine|feeSentence|way\.conditions|way\.name\}<\/h/, "the card that decides carries no source, no fee sentence, no list");
  for (const way of WAYS_OUT) {
    assert.doesNotMatch(way.title, /Ramp|Mercuryo/, "the title is where the money goes, not who carries it");
    assert.doesNotMatch(way.conditions.join(" "), /United Kingdom|Selling/, "what is off the subject of this withdrawal is off the card");
  }
  // What stops a person at the service is said at step 2, where its page opens.
  const step2 = screen.slice(screen.indexOf("W.step2(chosen.name)"), screen.indexOf("W.step3"));
  assert.match(step2, /chosen\.conditions\.map/);
  // Steps 2 and 3 share a screen: placing the order leads until a code can be sent to, and then sending does.
  assert.match(screen, /const sendable = deposit\.trim\(\) !== "" && problemWithCode === null;/);
  assert.match(screen, /className=\{sendable \? SECONDARY_BUTTON : PRIMARY_BUTTON\}/, "the order button steps back");
  assert.match(screen, /className=\{sendable \? PRIMARY_BUTTON : SECONDARY_BUTTON\}/, "and sending takes the accent");
  // No rail names another on screen: what each serves is its own conditions, and the order is the screen's business.
  for (const way of WAYS_OUT) for (const other of WAYS_OUT) if (other !== way) assert.doesNotMatch(way.where, new RegExp(other.name, "i"));
});
