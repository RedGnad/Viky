import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { cardReach } from "../src/card-rail";
import { arrivesInDollars, DOLLAR_COIN_ALLOWANCE, eurosNeededOn, serviceChargeEur, wayInFor } from "../src/gift-amount";
import { feeInALine, feeSentence, RAMPNOW_OPEN_IN, rampnowPage, rampnowWayIn, WAY_IN_CHAIN_COIN, WAY_IN_GIFT_COIN, WAY_IN_USDC, wayInAsksNothing, wayInFillsIn, wayInPage, WAYS_IN, waysIn } from "../src/rails";
import { FUND, PAY } from "../src/sentences";

/**
 * Paying by card through Rampnow's own public page (the founder, 1 Oct 2026), built and kept off: the link arrives
 * filled in and locked, the sheet says what the person meets, the amount covers the fee so the gift is paid whole, and
 * it is offered only where Rampnow says it fully serves. Nothing is turned on before a real payment has run.
 */

const SWITCH = "NEXT_PUBLIC_RAMPNOW_WAY_IN";
const ROUTER = "NEXT_PUBLIC_USDC_ROUTER_ADDRESS";
function withSettings<T>(settings: Readonly<Record<string, string | undefined>>, run: () => T): T {
  const before = Object.fromEntries(Object.keys(settings).map((name) => [name, process.env[name]]));
  for (const [name, value] of Object.entries(settings)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  try {
    return run();
  } finally {
    for (const [name, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}
const ON = { [SWITCH]: "on", [ROUTER]: "0x00000000000000000000000000000000000000Aa" };
const ACCOUNT = "0xb12e0C72209Bd4BECFDaFA96a8F3e7eBc93b8376";
/** What Rampnow's page answered on 1 Oct 2026, for a card payment in euros: its fee, its rate, two decimals kept. */
const rampnowDelivers = (euros: number) => Math.floor((euros - Math.max(1, 0.4 + 0.07 * euros) - 0.0038) * 1.1323 * 100) / 100;

test("it is off unless the switch is on and the step that changes USDC has an address", () => {
  withSettings({ [SWITCH]: undefined, [ROUTER]: undefined }, () => {
    assert.equal(rampnowWayIn(), false);
    assert.equal(waysIn(), WAYS_IN, "the very list there was");
  });
  withSettings({ [SWITCH]: "on", [ROUTER]: undefined }, () => assert.equal(rampnowWayIn(), false, "the switch alone would leave USDC nobody can change"));
  withSettings({ [SWITCH]: "on", [ROUTER]: "not an address" }, () => assert.equal(rampnowWayIn(), false));
  withSettings({ [SWITCH]: "1", [ROUTER]: ON[ROUTER] }, () => assert.equal(rampnowWayIn(), false, "on is the word"));
  withSettings(ON, () => {
    assert.equal(rampnowWayIn(), true);
    assert.deepEqual(waysIn().map((way) => way.name), ["Rampnow", "Ramp", "Mercuryo"], "Rampnow first, the two others behind");
  });
  assert.deepEqual(waysIn({ rampnow: true, swapper: "an-id" }).map((way) => way.name), ["Rampnow", "Swapper", "Ramp", "Mercuryo"]);
});

test("the page arrives filled in and locked: the amount, the euro, the card, USDC on Monad, the payer's account", () => {
  assert.equal(
    rampnowPage({ account: ACCOUNT, euros: 30 }),
    `https://app.rampnow.io/order/quote?orderType=buy&srcChain=fiat&srcCurrency=EUR&srcAmount=30&paymentMode=card&dstCurrency=USDC&dstChain=monad&walletAddress=${ACCOUNT}&lockFields=srcAsset,srcAmount,dstAsset,paymentMode,walletAddress&prefill=true`,
  );
  assert.equal(wayInPage(WAY_IN_USDC, { account: ACCOUNT, euros: 29.2 }), rampnowPage({ account: ACCOUNT, euros: 30 }), "a whole euro, rounded up");
  // Nothing is locked empty: without an account or an amount, that field stays the person's.
  assert.match(rampnowPage({}), /lockFields=srcAsset,dstAsset,paymentMode&prefill=true$/);
  assert.doesNotMatch(rampnowPage({}), /walletAddress=|srcAmount=|apiKey/);
  assert.equal(wayInFillsIn(WAY_IN_USDC), true);
  assert.equal(wayInAsksNothing(WAY_IN_USDC), true);
  assert.equal(wayInAsksNothing(WAY_IN_GIFT_COIN), false);
});

test("the fee is the one measured, and the amount asked covers it so the gift is paid whole", () => {
  assert.deepEqual(WAY_IN_USDC.fee, { percent: 7, upTo: false, plus: 0.4, minimum: 1, currency: "EUR" });
  // The fourteen amounts read on 1 Oct 2026: 7 % plus 0.40 EUR, never under 1.00 EUR.
  for (const [euros, fee] of [[5, 1], [8, 1], [10, 1.1], [20, 1.8], [30, 2.5], [100, 7.4], [500, 35.4]] as const) {
    assert.equal(Math.round(serviceChargeEur(euros, WAY_IN_USDC.fee) * 100) / 100, fee, `${euros} EUR`);
  }
  assert.equal(feeSentence(WAY_IN_USDC), "Rampnow keeps 7 % plus 0.40 EUR with a minimum of 1.00 EUR");
  assert.equal(DOLLAR_COIN_ALLOWANCE, 0.01);
  // Thirty dollars at the European Central Bank's 1.1355: 26.42 EUR, 26.69 with the allowance, 29.13 with the fee, so 30.
  assert.equal(eurosNeededOn(30_000_000n, WAY_IN_USDC, 1.1355), 30);
  // Every whole gift from 5 to 1,000 dollars: what Rampnow delivered that day for the euros asked covers the gift.
  for (let dollars = 5; dollars <= 1_000; dollars += 1) {
    const euros = eurosNeededOn(BigInt(dollars) * 1_000_000n, WAY_IN_USDC, 1.1355)!;
    assert.ok(rampnowDelivers(euros) >= dollars, `${dollars} dollars: ${euros} EUR delivered ${rampnowDelivers(euros)}`);
    assert.ok(arrivesInDollars(euros, WAY_IN_USDC, 1.1355)! >= dollars, `${dollars} dollars: the sheet's own figure`);
    assert.ok(rampnowDelivers(euros) - dollars < Math.max(2.5, dollars * 0.04), `${dollars} dollars: and not far over (${rampnowDelivers(euros)})`);
  }
  assert.equal(eurosNeededOn(30_000_000n, WAY_IN_USDC, undefined), undefined, "no rate, no figure");
});

test("it is offered where Rampnow says it fully serves, and gives way by one sentence elsewhere", () => {
  assert.equal(RAMPNOW_OPEN_IN.length, 103);
  assert.equal(new Set(RAMPNOW_OPEN_IN).size, 103);
  for (const code of RAMPNOW_OPEN_IN) assert.match(code, /^[a-z]{2}$/);
  for (const served of ["fr", "gb", "us", "be", "de", "ke", "za"]) assert.ok(RAMPNOW_OPEN_IN.includes(served), served);
  for (const not of ["sn", "ci", "ca", "ma", "ng", "ml", "ru", "ir"]) assert.ok(!RAMPNOW_OPEN_IN.includes(not), not);
  withSettings(ON, () => {
    const ways = waysIn();
    const france = wayInFor(30_000_000n, ways, 1.1355, cardReach("fr"));
    assert.equal(france.way, WAY_IN_USDC);
    assert.equal(france.euros, 30);
    assert.equal(cardReach("sn").Rampnow, "does-not");
    const dakar = wayInFor(30_000_000n, ways, 1.1355, cardReach("sn"));
    assert.equal(dakar.way, WAY_IN_CHAIN_COIN, "Senegal is under Restricted at Rampnow, and Ramp does not sell there");
    assert.deepEqual(dakar.insteadOf, { way: WAY_IN_USDC, because: "country" });
    assert.equal(cardReach(null).Rampnow, "unknown", "no country known: offered, and its own check decides");
    // A gift under its smallest card payment is paid at that payment, the rest staying in the account.
    const small = wayInFor(2_000_000n, ways, 1.1355, cardReach("fr"));
    assert.deepEqual([small.way, small.euros, small.atFloor], [WAY_IN_USDC, 5, true]);
  });
});

test("the sheet says what the person meets, in the founder's words, and the terms line carries its name and link", () => {
  // Under the pay sheet's button, one line: who takes the card, its ID the first time, and its terms (the mockup of 3 Oct 2026).
  assert.equal(
    `${PAY.cardLine.before(WAY_IN_USDC.name)}${PAY.cardLine.link(WAY_IN_USDC.name)}${PAY.cardLine.after}`,
    "Rampnow takes your card, with your ID the first time. By paying you are 18 or older and accept Rampnow's terms.",
  );
  assert.equal(`${PAY.cardTerms.before}${PAY.cardTerms.link(WAY_IN_USDC.name)}${PAY.cardTerms.after}`, "By paying by card, you confirm you are 18 or older and accept Rampnow's terms.");
  assert.equal(WAY_IN_USDC.terms, "https://rampnow.io/terms-and-conditions");
  // The pay sheet's fold says the fee in a short line (the founder, 4 Oct 2026), true of the payment on the sheet:
  // the published share, or the service's floor where the floor is what that payment pays.
  assert.equal(feeInALine(WAY_IN_USDC, 50), "Rampnow, 7 % + €0.40");
  assert.equal(feeInALine(WAY_IN_USDC), "Rampnow, 7 % + €0.40");
  assert.equal(feeInALine(WAY_IN_USDC, 5), "Rampnow, €1.00", "7 % of 5 EUR and 0.40 is under its floor of one euro");
  // The wait: two short steps, in the frame or on Rampnow's page beside.
  assert.equal(FUND.waiting.steps.pay, "Pay by card.");
  assert.equal(FUND.waiting.steps.keepOpen, "Keep the window open until the money lands: your gift starts by itself.");
  assert.equal(FUND.waiting.steps.payBeside("Rampnow"), "Pay by card on Rampnow's page.");
  assert.equal(FUND.waiting.steps.comeBack, "Come back here: your gift starts by itself.");
  const wait = readFileSync("app/components/PayGift.tsx", "utf8");
  assert.match(wait, /<Step says=\{W\.waiting\.steps\.payBeside\(wayIn\.name\)\}>/);
  assert.match(wait, /<Step says=\{W\.waiting\.steps\.comeBack\} \/>/);
  assert.match(wait, /<Step says=\{W\.waiting\.steps\.keepOpen\} \/>/);
});
