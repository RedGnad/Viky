import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { announcedAccount, sessionReach, sessionRemaining } from "../src/account/session-gate";
import { formatAusdExact, theirsSoFar } from "../src/gift-reader";
import { catchUpDay, deadlineInWords } from "../src/catch-up";
import { ARRIVAL_FLOOR, CONVERSION_RESERVE, fundingStageShown, nextFundingStep, paymentArrived } from "../src/funding-step";
import { AmountError, dollarsToUnits, MIN_GIFT_UNITS } from "../src/money";
import { exampleGift } from "../app/kit/example-gift.js";
import { amountsInWords, whoInWords } from "../app/kit/GiftCard.js";
import { CASH_OUT, GIFT_CARD } from "../src/sentences";

/**
 * Tests for the sentences the screens show about money and about the state of a gift
 * (docs/SCREEN-CLAIMS.md). Each one fails if the promise stops being kept, not merely if a function
 * changes shape.
 */

const A = "0x350aF869ABa6ff26AB33517ECd3E38ACaF107761" as const;
const B = "0x91C964e745ffd6265c75df33cA9137D81c3c454d" as const;

test('"You are signed in" follows the server, and never announces a disagreement', () => {
  // The first defect this pins: the account was announced as soon as the passkey opened, so the gift list asked
  // the server with no session, was refused, and kept "Account authentication is required" on screen. The server
  // is still the one that decides.
  assert.equal(announcedAccount(A, undefined), undefined, "the passkey alone must not announce an account");
  assert.equal(announcedAccount(A, A), A, "both agreeing is what lets the app act");
  assert.equal(announcedAccount(A, B), undefined, "two different accounts must never be treated as one");
  assert.equal(announcedAccount(undefined, undefined), undefined);
  // The second defect, found in production on 18 Sep 2026: a page load lost the account although the twelve hour
  // cookie was there and the server answered every request with it. The passkey's key dies with the page; the
  // session does not, so the server naming an account is enough to be signed in, and signing asks for the passkey.
  assert.equal(announcedAccount(undefined, A), A, "the cookie alone is a session, and a reload keeps it");
  assert.equal(sessionReach(undefined, undefined), "signed-out");
  assert.equal(sessionReach(undefined, A), "reading", "after a load: known, and nothing can be signed yet");
  assert.equal(sessionReach(A, A), "signing");
  assert.equal(sessionReach(A, B), "signed-out", "a disagreement is nobody, not a half-open session");
});

test('"Theirs so far" counts what was earned, not what is left to take', () => {
  // The trap: `earnedBalance` is the withdrawable balance and drops to zero the moment the recipient takes
  // it. Showing that as "theirs so far" would tell a funder the gift had earned nothing.
  const perDay = 2_857_142n;
  assert.equal(theirsSoFar({ creditedDays: 0, perDay }), 0n);
  assert.equal(theirsSoFar({ creditedDays: 1, perDay }), perDay);
  assert.equal(theirsSoFar({ creditedDays: 7, perDay }), 7n * perDay);

  // A withdrawal empties the withdrawable balance; what they earned is unchanged.
  const afterThreeDays = { creditedDays: 3, perDay };
  const earnedBalanceAfterTakingItAll = 0n;
  assert.equal(theirsSoFar(afterThreeDays), 3n * perDay);
  assert.notEqual(theirsSoFar(afterThreeDays), earnedBalanceAfterTakingItAll);
});

test("the amount taken is exactly the amount typed", () => {
  // Two defects this pins, both found by reading the screen against the code on 12 Sep 2026:
  // "20.999" became $21.00 and took a dollar more than the person wrote, and "1e3" was read as $1,000.
  assert.equal(dollarsToUnits("20"), 20_000_000n);
  assert.equal(dollarsToUnits("20.50"), 20_500_000n);
  assert.equal(dollarsToUnits("20.5"), 20_500_000n);
  assert.equal(dollarsToUnits(" 1 "), 1_000_000n);
  assert.equal(dollarsToUnits("1,50"), 1_500_000n, "a comma is what half the world types");

  for (const typed of ["20.999", "1e3", "0x14", "-3", "abc", "", "  ", "20.", ".5", "1 000", "Infinity", "20.5.1"]) {
    assert.throws(() => dollarsToUnits(typed), AmountError, `"${typed}" must be refused, never guessed at`);
  }

  // Never silently below the contract's own floor: the person is told, not refused by the chain later.
  assert.throws(() => dollarsToUnits("0"), /smallest gift is \$1\.00/);
  assert.throws(() => dollarsToUnits("0.99"), /smallest gift is \$1\.00/);
  assert.equal(dollarsToUnits("1.00"), MIN_GIFT_UNITS);
});

test("the session countdown never shows a negative or a stale number", () => {
  assert.equal(sessionRemaining(undefined, 1_000), undefined, "a closed session shows no countdown");
  assert.deepEqual(sessionRemaining(1_000 + 61_000, 1_000), { minutes: 1, seconds: 1 });
  assert.deepEqual(sessionRemaining(1_000, 1_000), { minutes: 0, seconds: 0 }, "at the deadline it is zero");
  assert.deepEqual(sessionRemaining(1_000, 999_999), { minutes: 0, seconds: 0 }, "past the deadline it stays zero");
  assert.deepEqual(sessionRemaining(1_000 + 10 * 60_000, 1_000), { minutes: 10, seconds: 0 }, "a fresh session shows its full length");
});


test("the funder screen converts a payment that arrived, and never one that did not", () => {
  const wanted = 20_000_000n;

  // Enough already: make the gift, convert nothing.
  assert.deepEqual(nextFundingStep({ held: wanted, arriving: 10n ** 18n, wanted }), { do: "give" });
  assert.deepEqual(nextFundingStep({ held: wanted + 1n, arriving: 0n, wanted }), { do: "give" });

  // Nothing there, or not enough above the reserve: keep waiting. Converting below Monad's 10 MON reserve
  // is refused by the chain, so a small arrival is not something to act on (D56).
  assert.deepEqual(nextFundingStep({ held: 0n, arriving: 0n, wanted }), { do: "wait", sawSomething: false });
  assert.deepEqual(nextFundingStep({ held: 0n, arriving: ARRIVAL_FLOOR, wanted }), { do: "wait", sawSomething: true });
  assert.deepEqual(nextFundingStep({ held: 0n, arriving: ARRIVAL_FLOOR + CONVERSION_RESERVE, wanted }), {
    do: "wait",
    sawSomething: true,
  });
  // Whatever it decides to convert, what stays behind clears the reserve.
  assert.ok(CONVERSION_RESERVE > 10n * 10n ** 18n, "more than the 10 MON the chain reserves");

  // A real payment: 25 EUR buys roughly 1,163 MON, so this is the ordinary case.
  const payment = 1_163n * 10n ** 18n;
  assert.deepEqual(nextFundingStep({ held: 0n, arriving: payment, wanted }), {
    do: "convert",
    amount: payment - CONVERSION_RESERVE,
  });

  // Half the gift already there and a payment arriving: the payment is still converted, never skipped.
  assert.deepEqual(nextFundingStep({ held: wanted / 2n, arriving: payment, wanted }), {
    do: "convert",
    amount: payment - CONVERSION_RESERVE,
  });

  // What is converted is never more than what arrived.
  for (const arriving of [payment, payment * 25n, ARRIVAL_FLOOR + CONVERSION_RESERVE + 1n]) {
    const step = nextFundingStep({ held: 0n, arriving, wanted });
    if (step.do === "convert") assert.ok(step.amount < arriving, `converted ${step.amount} of ${arriving}`);
  }
});

test("once there is an account, the account step gives way to the check and its button to pay", () => {
  // The defect of 15 Sep: the funder made their account on this step and was left with nothing to press but Back.
  assert.equal(fundingStageShown("account", true), "check");
  assert.equal(fundingStageShown("account", false), "account");
  for (const stage of ["who", "howMuch", "check"] as const) {
    assert.equal(fundingStageShown(stage, true), stage);
    assert.equal(fundingStageShown(stage, false), stage);
  }
});

test("a payment that outlasts the session is used where it sits, and the waiting page never reads a closed account", () => {
  // The defect of 15 Sep: the payment took twelve minutes, the session closed after ten, and nothing was made of it.
  // The same test decides what the waiting page converts and what the check offers to use.
  assert.equal(paymentArrived(ARRIVAL_FLOOR + CONVERSION_RESERVE), false);
  assert.equal(paymentArrived(ARRIVAL_FLOOR + CONVERSION_RESERVE + 1n), true);
  for (const arriving of [0n, ARRIVAL_FLOOR, 1_231n * 10n ** 18n]) {
    const converts = nextFundingStep({ held: 0n, arriving, wanted: 25_000_000n }).do === "convert";
    assert.equal(converts, paymentArrived(arriving), `${arriving}`);
  }
  const pay = readFileSync("app/components/PayGift.tsx", "utf8");
  assert.doesNotMatch(pay, /address!/, "a closed session leaves no account to read");
  // The terms are written down before the service's page opens, which since the mockups of 19 Sep 2026 both happen
  // inside the sheet that pays, in that order and in the same press.
  const sheet = readFileSync("app/kit/offer/PaySheet.tsx", "utf8");
  assert.ok(sheet.indexOf("savePendingGift(") > 0 && sheet.indexOf("savePendingGift(") < sheet.indexOf("window.open(way.page"));
  const give = pay.slice(pay.indexOf("const give = useCallback"), pay.indexOf("// While paying: watch the account"));
  assert.match(give, /forgetPendingGift\(\)/);
});

test("the amount written before sending all of it is exactly the amount that leaves", () => {
  // The defect of 15 Sep: the balance read to the cent while the signature moved all six decimals.
  assert.equal(formatAusdExact(28_564_213n), "$28.564213");
  assert.equal(formatAusdExact(28_560_000n), "$28.56");
  assert.equal(formatAusdExact(28_500_000n), "$28.50");
  assert.equal(formatAusdExact(28_560_010n), "$28.56001");
  assert.equal(formatAusdExact(0n), "$0.00");
  for (const units of [1n, 999_999n, 2_857_142n, 28_564_213n, 123_456_789_012n]) {
    const [whole, fraction] = formatAusdExact(units).slice(1).split(".");
    assert.equal(BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0")), units, `nothing of ${units} rounded away`);
  }
  // And what leaves is exactly the two-decimal number that was ordered at the payout service, on both branches:
  // relayed for the stablecoin, sent by the person's own account for the chain's own coin (D75, D77, flows W7 to W9).
  const cashOut = readFileSync("app/components/CashOut.tsx", "utf8");
  assert.match(cashOut, /const leaving = ready\.units;/);
  assert.match(cashOut, /sendOwnMoney\(\{ account, to, amount: leaving, coin \}\)/);
  assert.match(cashOut, /sendMon\(account, to, leaving\)/);
  // To another account of the person's own, the amount typed leaves, read to the last decimal that coin has.
  assert.match(cashOut, /dollarsToChange\(ownAmount, held\(ownCoin\), W\.refusals\)/, "two decimals, as on step 1 (flows W13)");
  assert.match(cashOut, /const leaving = ownSending\.units;/);
});

/**
 * The defect of 16 Sep: the first real attempt at the way out failed with "Something went wrong. Nothing was
 * changed.", which said neither what had happened nor whether the money had moved. The cause was a table that
 * had never been migrated, three steps away from anything the person did (D80).
 *
 * On a screen about money, no failure may arrive as a shrug.
 */
test("no failure about money arrives as a shrug, and a closed session says so", () => {
  const cashOut = readFileSync("app/components/CashOut.tsx", "utf8");
  const sentences = readFileSync("src/sentences.ts", "utf8");

  assert.doesNotMatch(cashOut, /Something went wrong/, "the catch-all has no place on a screen about money");
  assert.doesNotMatch(sentences, /Something went wrong/);

  // Branched on the typed code rather than on the server's prose, which can change without anybody noticing.
  assert.match(cashOut, /case "NOT_CONFIGURED":/);
  assert.match(cashOut, /case "FAILED":/);
  assert.match(cashOut, /error\.code === "SIGN_IN_REQUIRED"/);

  // A closed session is a door to reopen, not a failure to report: it is expected here, because the journey
  // takes longer than the session lasts. Signing in is the only thing offered, since a second account would
  // strand the money (flows W11).
  assert.equal(CASH_OUT.closedTitle, "Your session closed while you were away");
  assert.match(CASH_OUT.closedBody, /Nothing moved and nothing was taken\./);
  assert.match(cashOut, /setClosed\(true\)/);
  assert.match(cashOut, /<AccountPanel returning signInOnly \/>/, "Sign in alone, whichever way the session went");

  // The moment in the sentence on Me is the timer's own deadline, never a number typed into prose.
  const me = readFileSync("app/kit/Me.tsx", "utf8");
  assert.match(me, /mera\.sessionExpiresAtMs\(\)/);

  // And every failure that ends a gesture still says the one thing that is always true: the router keeps nothing.
  for (const promise of [CASH_OUT.failures.notConfigured, CASH_OUT.failures.rateMoved, CASH_OUT.failures.keptChanging, CASH_OUT.failures.other, CASH_OUT.failures.notSent("Ramp")]) {
    assert.match(promise, /[Nn]othing was taken|nothing left your account/);
  }
});

/**
 * The blocking defect of the first real exit, 16 Sep (D82). The payout service asks where the money is sent from
 * before it gives its own identifier to send to, and this screen had no answer at that step: the funder had to find
 * their identifier somewhere else. So after a change, in the order the service asks: the account's identifier with
 * a copy button, then a field for theirs.
 */
test("on the second step the account's code comes first with a copy button, then the field for the service's", () => {
  // The blocking defect of the first real exit (D82): the payout service asks where the money is sent from before it
  // gives its own code to send to, and the screen had no answer. Now, in the order the service asks: the code, whole and
  // copyable, then the field for theirs, whose button stays shut until what is pasted is a code and not the person's own.
  const cashOut = readFileSync("app/components/CashOut.tsx", "utf8");
  const give = cashOut.indexOf("W.giveThisCode(");
  const copy = cashOut.indexOf("onClick={copyCode}");
  const paste = cashOut.indexOf("W.pasteTheCode(");
  assert.ok(give > 0 && copy > give, "the code is offered where the service asks for it, and copied whole");
  assert.ok(paste > copy, "and only then the field for the code they give back");
  // Since S4 the same condition is named once, as `sendable`, because the accent follows it too.
  assert.match(cashOut, /const sendable = deposit\.trim\(\) !== "" && problemWithCode === null;/);
  assert.match(cashOut, /disabled=\{!sendable \|\| busy\}/);
  assert.match(CASH_OUT.codeRefusals.own("Ramp"), /your own code/);
});

test("money screens keep the session open thirty minutes, everything else ten (decision 2)", () => {
  const mera = readFileSync("src/account/mera.ts", "utf8");
  assert.match(mera, /DEFAULT_IDLE_MINUTES = 10;/);
  assert.match(mera, /MONEY_SCREEN_IDLE_MINUTES = 30;/);
  for (const screen of ["app/components/CashOut.tsx", "app/components/PayGift.tsx", "app/components/GiftPage.tsx"]) {
    assert.match(readFileSync(screen, "utf8"), /useMoneySession\(\);/, `${screen} is a money screen`);
  }
});

test("a day that is neither counted nor lost is named, with the moment it stops being catchable", () => {
  const DAY = 86_400_000;
  const window = { startDay: 20_708, endDay: 20_714, creditedDays: 1, missedDays: 0 };
  const catchUp = 86_400 + 6 * 3_600; // the newer contract: 30 hours

  // Day 20709 is open, and catchable until 30 hours after the end of it.
  const onDayThree = 20_710 * DAY + 3_600_000;
  const open = catchUpDay(window, catchUp, onDayThree);
  assert.equal(open?.day, 20_709);
  assert.equal(open?.deadlineMs, 20_710 * DAY + catchUp * 1_000);

  // Today is never "catchable": it is simply not over.
  assert.equal(catchUpDay(window, catchUp, 20_709 * DAY + 3_600_000), undefined);
  // Nothing open once everything so far is settled.
  assert.equal(catchUpDay({ ...window, creditedDays: 2 }, catchUp, onDayThree), undefined);
  // Nor once the deadline has passed: by then it is a missed day, and the screen says that instead.
  assert.equal(catchUpDay(window, catchUp, open!.deadlineMs + 1), undefined);
  // Nor beyond the end of the window.
  assert.equal(catchUpDay({ ...window, creditedDays: 7 }, catchUp, onDayThree), undefined);
  // Nor before anything has started.
  assert.equal(catchUpDay({ ...window, startDay: 0 }, catchUp, onDayThree), undefined);

  // The two live contracts disagree, which is D50's third point; both are expressible.
  assert.equal(catchUpDay(window, 86_400, onDayThree)?.deadlineMs, 20_710 * DAY + 86_400_000);
});

test("the deadline is said in words, never as a day number", () => {
  const base = Date.UTC(2026, 8, 14, 12, 0);
  assert.match(deadlineInWords(base + 3_600_000, base, "en-GB"), /^today at /);
  assert.match(deadlineInWords(base + 20 * 3_600_000, base, "en-GB"), /^tomorrow at /);
  assert.match(deadlineInWords(base + 72 * 3_600_000, base, "en-GB"), /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) at /);
});

/**
 * The one example in the product, on the page without an account. The rule of integrity: data that is not real is
 * labelled, never passed off as somebody's. And it has to read as a gift in progress, or it shows nothing.
 */
test("the example gift says it is an example, and reads as a gift under way", () => {
  assert.equal(GIFT_CARD.example, "Example");
  const now = Date.UTC(2026, 8, 17, 10, 0, 0);
  const example = exampleGift(now);
  assert.equal(example.giftId, "example", "it can never be mistaken for a gift number");
  const today = Math.floor(now / 86_400_000);
  assert.ok(example.startDay < today && example.endDay > today, "it is neither finished nor waiting to start");
  assert.equal(example.creditedDays + example.missedDays, 3);
  assert.equal(example.durationDays, 7);
  assert.ok(example.opened && example.counting && !example.finished && !example.cancelled);
  // It belongs to nobody, so it is read in the third voice: a stranger invited to offer a gift is not the person a
  // gift is for, and the card said "yours" to them until the relecture of 18 Sep (D99).
  assert.equal(example.role, "reader");
  assert.equal(amountsInWords(example, true), "$4.00 of $14.00 theirs, $2.00 gone back");
  assert.equal(whoInWords(example), "From Mum");
});

/**
 * The accent marks the one action a screen is waiting for (the review list of the product structure, item 5). After
 * the money has been taken, the gesture that carried it is done: what the screen is now waiting for is the way out,
 * and the relecture of 18 Sep found it offered in the plain shape.
 */
test("once what was earned has been taken, the way out carries the accent", () => {
  const page = readFileSync("app/components/GiftPage.tsx", "utf8");
  const block = page.slice(page.indexOf("const takenBlock"), page.indexOf("const countingBlock"));
  assert.match(block, /href="\/cash-out" className=\{PRIMARY_BUTTON\}/, "the next step is offered in the plain shape again");
  // And the gesture that had the accent is gone by then: taking is offered only while something is left to take.
  assert.match(page, /const takeOffered = may\.takeTheMoney && earned > 0n;/);
});

/**
 * What the legal notice says about the people who run Viky (mitigation C). Every sentence of it is a claim about the
 * program's own access control, so each one is read back from `contracts/GiftEscrow.sol` here: a paragraph that drifts
 * from the contract would be a promise nobody keeps, on the page where a promise counts most.
 */
test("the legal notice says exactly what the program lets the operator do, and no more", () => {
  const legal = readFileSync("app/legal/page.tsx", "utf8");
  const contract = readFileSync("contracts/GiftEscrow.sol", "utf8");

  // The four things, and the fact that there is no fifth: every function the owner alone may call.
  const ownerOnly = [...contract.matchAll(/function (\w+)\([^)]*\)[^{]*onlyOwner/g)].map((m) => m[1]).sort();
  assert.deepEqual(ownerOnly, ["registerGoal", "setCheckInPaused", "setCreationPaused", "setEvidenceSigner"]);
  assert.match(legal, /stop new\s+gifts being offered, stop the daily readings, change the key that signs what a reading found,\s+and add a goal a gift can be made on/);

  // Moving money is not among them: the two ways out of the program check who is asking, not who owns it.
  assert.match(contract, /function withdrawEarned\(uint256 giftId, address to, uint256 amount\) external nonReentrant \{[\s\S]*?if \(msg\.sender != g\.recipient\) revert NotRecipient\(\);/);
  assert.match(contract, /function refundUnearned\(uint256 giftId\) external nonReentrant \{/, "the refund is anybody's to call");
  assert.doesNotMatch(
    contract.slice(contract.indexOf("function refundUnearned"), contract.indexOf("function cancel")),
    /onlyOwner|msg\.sender/,
    "the refund now asks who is calling, and the legal notice says it does not",
  );
  assert.match(contract, /_push\(g\.refundTo, amount\);/, "the refund pays the destination the funder signed, and nothing else");
  assert.match(legal, /anyone at\s+all can ask for that: the program will send it nowhere else/);
  assert.match(legal, /What is earned leaves only when\s+the person the gift is for asks for it, signed by them/);

  // The countries are the rails' own words, not a claim of our own.
  const rails = readFileSync("src/rails.ts", "utf8");
  for (const said of ["It does not serve Senegal or Ivory Coast.", "No card payout in France, the rest of the EEA, or the United States.", "Selling is shut in the United Kingdom."]) {
    assert.ok(rails.includes(said), `the way out no longer publishes "${said}"`);
  }
  assert.match(legal, /does not serve Senegal or Ivory Coast/);
  assert.match(legal, /makes no payout in France, the rest of the\s+European Economic Area or the United States/);
  assert.match(legal, /cannot sell at all in the United Kingdom/);
});

/**
 * The simplest-journey pass, 19 Sep 2026: what only some readers need went behind a disclosure, and what changes
 * what a person does next stayed in front of everybody (GOV.UK Details: "make a page easier to scan when it contains
 * information that only some users will need", never for what the majority must read).
 */
test("on the sheet that pays, the link warning is in the body and the rest is one press away", () => {
  const sheet = readFileSync("app/kit/offer/PaySheet.tsx", "utf8");
  // The sentence that changes what a person does next is read without pressing anything.
  assert.match(sheet, /\{FUND\.check\.linkRisk\(recipient\)\}<\/p>\s*<details>/);
  // What only some readers need is inside the disclosure the mockup draws as a second, quiet button, and all of it
  // is still there: what this condition promises, the two names, the fourteen days, the fee and where it was read.
  const inside = sheet.slice(sheet.indexOf("<details>"), sheet.indexOf("</details>"));
  assert.match(inside, /FUND\.check\.namesSeen/);
  assert.match(inside, /fourteenDays/);
  assert.match(inside, /feeSentence\(way\)/);
  assert.match(inside, /CASH_OUT\.sourceLine/);
  assert.match(inside, /mustShow|howItWorks|check\.missed/);
  // And what the sheet says in the open is what the mockup says in the open: three lines, the total, the passkey.
  for (const said of ["W.rows.gift(recipient)", "W.rows.viky", "W.youPay", "W.passkeyMakesTheAccount"]) {
    assert.ok(sheet.includes(said), `the sheet says ${said}`);
  }
});
