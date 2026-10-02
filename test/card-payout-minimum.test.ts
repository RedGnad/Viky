import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { exactly, MON, USDC } from "../src/coins";
import { netOfEverything } from "../src/exit-steps";
import { CONVERSION_RESERVE } from "../src/funding-step";
import { afterTheReserve, dollarsForTheMinimum, sellLimitsFrom } from "../src/mercuryo";
import { payoutMethodFor, reachOfWaysOut, type PayoutMethod } from "../src/rail-availability";
import { MERCURYO_CLOSED_IN, WAY_OUT_CARD, WAY_OUT_EURO } from "../src/rails";
import { CASH_OUT, USE_MONEY } from "../src/sentences";
import { usesFor } from "../src/use-money";

/**
 * The card way out (the audit of 1 Oct 2026, finding F-16, and D60 before it).
 *
 * Three things were wrong at once. The service's smallest sale was no longer checked, so ten dollars became a coin its
 * page then refused, and nothing else here takes that coin. The figure of the review was the dollar formatter on a
 * number with eighteen decimals, a million million times too large. And the part an account must keep to be able to
 * send was taken out of nothing and said nowhere.
 */

/** Their answer as read on 1 Oct 2026, cut to the rows that matter. */
const ANSWER = {
  status: 200,
  data: [
    { network: "SOLANA", crypto: "SOL", fiat: "EUR", fiat_limits: { min: "15.00", max: "10000.00" }, crypto_limits: { min: "0.172498000", max: "99.622821000" } },
    { network: "MONAD", crypto: "MON", fiat: "EUR", fiat_limits: { min: "15.00", max: "10000.00" }, crypto_limits: { min: "636.492220650636492600", max: "369948.268080764989308000" } },
    { network: "MONAD", crypto: "MON", fiat: "USD", fiat_limits: { min: "16.91", max: "11273.20" }, crypto_limits: { min: "633.928158473465622561", max: "369948.835968692699913100" } },
  ],
};
const ONE = 1_000_000_000_000_000_000n;

test("the card service's smallest sale is read from its own answer, in euros and in the coin's units", () => {
  const limits = sellLimitsFrom(ANSWER)!;
  assert.equal(limits.fiatMin, 15);
  assert.equal(limits.currency, "EUR");
  assert.equal(limits.coinMin, 636_492_220_650_636_492_600n);
  // Anything that is not their answer is nothing, never a guess.
  assert.equal(sellLimitsFrom({ data: [] }), null);
  assert.equal(sellLimitsFrom({ data: [{ network: "MONAD", crypto: "MON", fiat: "EUR", fiat_limits: { min: "0", max: "0" }, crypto_limits: { min: "0", max: "1" } }] }), null);
  assert.equal(sellLimitsFrom(null), null);
});

test("the reserve is kept the first time and never twice, and the dollars to send for the minimum count it", () => {
  const floor = 375n * ONE;
  assert.deepEqual(afterTheReserve(floor, 0n, CONVERSION_RESERVE), { kept: CONVERSION_RESERVE, sendable: floor - CONVERSION_RESERVE });
  assert.deepEqual(afterTheReserve(floor, CONVERSION_RESERVE, CONVERSION_RESERVE), { kept: 0n, sendable: floor });
  assert.deepEqual(afterTheReserve(floor, 4n * ONE, CONVERSION_RESERVE), { kept: 7n * ONE, sendable: 368n * ONE });
  assert.deepEqual(afterTheReserve(5n * ONE, 0n, CONVERSION_RESERVE), { kept: CONVERSION_RESERVE, sendable: 0n }, "never under nothing");
  // Ten dollars gave 375 of the coin: the minimum of 636.49 and the 11 kept need about 17.44 dollars, a hundredth more.
  const least = dollarsForTheMinimum({ amount: 10_000_000n, floor, kept: CONVERSION_RESERVE, coinMin: 636_492_220_650_636_492_600n });
  assert.equal(least, 17_440_000n);
  assert.equal(least % 10_000n, 0n, "cut up to the cent");
});

test("the quote refuses under the minimum in dollars, writes the figure with the coin's decimals, and says what stays", () => {
  const route = readFileSync("app/api/exit/quote/route.ts", "utf8");
  assert.match(route, /if \(reserve\.sendable < limits\.coinMin\) \{/);
  assert.match(route, /"BELOW_PAYOUT_MINIMUM",\s+`\$\{way\.name\} pays a card from \$\{limits\.fiatMin\.toFixed\(2\)\} \$\{limits\.currency\}, about \$\{formatAusd\(least\)\} today\. Send at least that\.`/);
  assert.match(route, /const shown = exactly\(sendable, coin\);/);
  assert.doesNotMatch(route, /formatAusdExact/, "the dollar formatter never meets a figure with eighteen decimals again");
  // What that formatter did to 375 of the coin, and what is written now.
  assert.equal(exactly(375n * ONE, MON), "375.00 MON");
  assert.equal(exactly(9_995_586n, USDC), "$9.995586");
  // The ticket still carries the exchange's own floor: what is kept changes what is shown, never what is signed.
  assert.match(route, /issueExitTicket\(\{ account, amount, tokenOut: way\.coin, floor, shown \}\)/);
  assert.match(route, /if \(reserve\.kept > 0n\) kept = formatAusd\(\(reserve\.kept \* amount\) \/ floor\);/);
  assert.equal(CASH_OUT.reviewKept("$0.29"), "About $0.29 of it stays in your account, which it needs to be able to send.");
  assert.doesNotMatch(CASH_OUT.reviewKept("$0.29"), /MON|coin/i, "in dollars, without naming what it is counted in");
  const screen = readFileSync("app/components/CashOut.tsx", "utf8");
  assert.match(screen, /\{quote\.kept \? <p className=\{HELP\}>\{W\.reviewKept\(quote\.kept\)\}<\/p> : null\}/);
  assert.match(screen, /\{use === "card" && cardSmallest \? <p className=\{HELP\}>\{U\.cardFrom\(figureIn\(cardSmallest\.amount, cardSmallest\.currency\)\)\}<\/p> : null\}/);
  assert.equal(USE_MONEY.cardFrom("€15.00"), "From €15.00 at a time.");
});

async function reachFor(country: string) {
  const realFetch = globalThis.fetch;
  // The services' live answers are silent here: what is measured is the card service's own published list.
  globalThis.fetch = (async () => new Response("{}", { status: 404 })) as typeof fetch;
  try {
    return await reachOfWaysOut(country);
  } finally {
    globalThis.fetch = realFetch;
  }
}

test("the card is not offered where its service says it serves nobody, and a country nothing reaches is told so", async () => {
  for (const country of ["ml", "ma", "hu", "is"]) {
    assert.ok(MERCURYO_CLOSED_IN.includes(country));
    assert.equal((await reachFor(country))[WAY_OUT_CARD.name], "does-not", country);
  }
  // Where its list is silent, a live answer that could not be read stays a silence, never a refusal.
  assert.equal((await reachFor("sn"))[WAY_OUT_CARD.name], "unknown");
  // Mali: the bank service lists no payout, the card service serves nobody: neither is among the uses.
  const uses = usesFor("ml", { [WAY_OUT_EURO.name]: "does-not", [WAY_OUT_CARD.name]: "does-not" }, true, true);
  assert.ok(!uses.includes("bank") && !uses.includes("card"));
  assert.equal(USE_MONEY.noWayOutThere("Mali"), "No way to take money out reaches Mali yet. It stays yours here.");
  const screen = readFileSync("app/components/CashOut.tsx", "utf8");
  // Mobile money is a way out too: a country it reaches is not told that nothing does (2 Oct 2026).
  assert.match(screen, /where !== null && countryNow && !uses\.includes\("bank"\) && !uses\.includes\("card"\) && !uses\.includes\("mobile"\) \? <p className=\{BODY\}>\{U\.noWayOutThere\(/);
});

test("how the bank service pays in a country is its own published method, a bank account before a card", () => {
  const methods: PayoutMethod[] = [
    { name: "AMERICAN_BANK_TRANSFER", currencies: ["USD"], countries: ["us"] },
    { name: "SEPA", currencies: ["EUR"], countries: ["fr", "de"] },
    { name: "CARD", currencies: ["EUR", "GBP", "PLN"], countries: ["fr", "gb", "pl"] },
  ];
  assert.deepEqual(payoutMethodFor("us", methods), { method: "AMERICAN_BANK_TRANSFER", currency: "USD" });
  assert.deepEqual(payoutMethodFor("FR", methods), { method: "SEPA", currency: "EUR" }, "a bank account before a card");
  assert.deepEqual(payoutMethodFor("gb", methods), { method: "CARD", currency: "EUR" }, "several currencies name none for one country");
  assert.equal(payoutMethodFor("sn", methods), null);
  assert.equal(payoutMethodFor("us", null), null, "a list that could not be read says nothing");
  // The figure on the card follows: dollars for an account paid in dollars, the same fee counted back at the same rate.
  const rates = { date: "2026-09-30", eurPerUsd: 1 / 1.1355 };
  assert.deepEqual(netOfEverything(100_000_000n, WAY_OUT_EURO.fee, rates), { net: 86.08, currency: "EUR", rateDate: "2026-09-30" });
  assert.deepEqual(netOfEverything(100_000_000n, WAY_OUT_EURO.fee, rates, "USD"), { net: 97.74, currency: "USD", rateDate: "2026-09-30" });
});
