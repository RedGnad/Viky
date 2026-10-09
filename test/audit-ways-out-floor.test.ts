import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { reachOfWaysOut } from "../src/rail-availability";
import { MERCURYO_CLOSED_IN, RAMP_CLOSED_IN, WAY_OUT_CARD, WAY_OUT_EURO } from "../src/rails";
import { payoutMinimum } from "../src/ramp";
import { CASH_OUT, ME, USE_MONEY } from "../src/sentences";

/**
 * Three points of the audit of 9 Oct 2026 on the ways out (F15, F16, F18).
 *
 * With the three dollars of a judge's credit the card "Your bank" read about "€0.69", said no smallest payout, and the
 * service's refusal came after the press. The bank service was offered in thirty-two countries its own list says it
 * serves nobody in, where a person had their money changed before its page refused them. And the help of "Send to
 * another Viky account of mine" named a title, "Your code", that no screen prints.
 */
const USDC_ON_MONAD = "0x754704Bc059F8C67012fEd69BC8A327a5aafb603";

test("the bank service's smallest payout is read from its own list, and nothing is said when it does not answer", async () => {
  const realFetch = globalThis.fetch;
  try {
    // Silent first: nothing rather than a refusal, and nothing remembered from it.
    globalThis.fetch = (async () => new Response("{}", { status: 503 })) as typeof fetch;
    assert.equal(await payoutMinimum(), null);
    // Its list as read on 9 Oct 2026, cut to the row that matters.
    const assets = { assets: [{ symbol: "USDC", chain: "MONAD", address: USDC_ON_MONAD, decimals: 6, enabled: true, hidden: false, minPurchaseAmount: 6.69, maxPurchaseAmount: 14_738.33, price: { EUR: 0.86 } }] };
    globalThis.fetch = (async () => new Response(JSON.stringify(assets), { status: 200 })) as typeof fetch;
    assert.deepEqual(await payoutMinimum(), { amount: 6.69, currency: "EUR" });
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("the card of the bank's way out says that figure before anything is changed, as the card's and mobile money's do", () => {
  const route = readFileSync("app/api/rails/where/route.ts", "utf8");
  assert.match(route, /cardSellMinimum\(\), payoutMinimum\(\)\]\);/);
  assert.match(route, /const out = \{ bank: payoutMethodFor\(guess\.country, methods\), cardSmallest, bankSmallest \};/);
  const screen = readFileSync("app/components/CashOut.tsx", "utf8");
  assert.match(screen, /const bankSmallest = where\?\.out\?\.bankSmallest \?\? null;/);
  assert.match(screen, /\{use === "bank" && bankSmallest \? <p className=\{HELP\} data-bank-from>\{U\.bankFrom\(figureIn\(bankSmallest\.amount, bankSmallest\.currency\)\)\}<\/p> : null\}/);
  assert.equal(USE_MONEY.bankFrom("€6.69"), "From €6.69 at a time.");
  assert.equal(USE_MONEY.bankFrom("€6.69"), USE_MONEY.cardFrom("€6.69"), "one sentence for the same fact");
  // The press stays: the figure is said, and the service's own refusal still answers an amount under it.
  const card = screen.slice(screen.indexOf("data-bank-from"), screen.indexOf("{W.nothingToSend}"));
  assert.match(card, /<button type="button" onClick=\{act\} disabled=\{holdings === null \|\| changeable === 0n\}/);
});

/** The services' live lists, answered here: the bank service's payout methods name Ghana and France. */
async function reachWith(country: string) {
  const realFetch = globalThis.fetch;
  const payoutMethods = [{ name: "SEPA", currencies: ["EUR"], countries: ["fr"] }, { name: "CARD", currencies: ["EUR"], countries: ["fr", "gh", "th", "ua"] }];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("ramp.network")) return new Response(JSON.stringify(payoutMethods), { status: 200 });
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  try {
    return await reachOfWaysOut(country);
  } finally {
    globalThis.fetch = realFetch;
  }
}

test("the bank is not offered where its service says it serves nobody, whatever its list of payout methods names", async () => {
  // Three of the thirty-two countries that are on both of its lists.
  for (const country of ["gh", "th", "ua"]) {
    assert.ok(RAMP_CLOSED_IN.includes(country), country);
    assert.equal((await reachWith(country))[WAY_OUT_EURO.name], "does-not", country);
  }
  // Where its closed list is silent, its payout methods decide, as before.
  assert.equal((await reachWith("fr"))[WAY_OUT_EURO.name], "serves");
  assert.equal((await reachWith("br"))[WAY_OUT_EURO.name], "does-not");
  // Each service by its own list first, the same rule for both.
  const source = readFileSync("src/rail-availability.ts", "utf8");
  assert.match(source, /reach\[WAY_OUT_EURO\.name\] = RAMP_CLOSED_IN\.includes\(asked\) \? "does-not" : euro === null \? "unknown" : euro\.includes\(asked\) \? "serves" : "does-not";/);
  assert.match(source, /reach\[WAY_OUT_CARD\.name\] = MERCURYO_CLOSED_IN\.includes\(asked\) \? "does-not" :/);
  assert.ok(MERCURYO_CLOSED_IN.length > 0 && WAY_OUT_CARD.name !== WAY_OUT_EURO.name);
});

test("the help of sending to another account names the fold as Me prints it", () => {
  assert.equal(ME.codeQuestion, "Need your code for a payout service?");
  assert.equal(CASH_OUT.own.help, `You will find it on that account's Me page, under "${ME.codeQuestion}".`);
  assert.match(readFileSync("app/kit/Me.tsx", "utf8"), /\{W\.codeQuestion\}/);
  assert.match(readFileSync("app/components/CashOut.tsx", "utf8"), /<p className=\{HELP\}>\{W\.own\.help\}<\/p>/);
});
