// Rampnow's quote, read with the founder's own public key and never the key of its public page (9 Oct 2026). Its
// answers are stood in for here by a simulator of the rule read that day: a fee of max(1.00, 0.40 + 7 %) euros said
// in the currency paid, a small network fee, its own rate, what arrives rounded down to the cent, and nothing under
// five euros. Nothing is asked of the network.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { beforeEach } from "node:test";
import { GET } from "../app/api/rails/card-quote/route";
import { cardQuoteAsk, forgetQuotes, MOST_READINGS, QUOTE_KEPT_MS, quoteForUsdc, rampnowKey, rampnowQuote, rampnowQuoteAddress, rampnowQuotesOn, readRampnowAnswer, type RampnowQuoteDeps } from "../src/rampnow-quote";

const KEY = "pk_live_made_up_for_this_test";
/** Units of each currency a euro is, as its table said on 9 Oct 2026, and the USDC a euro bought. */
const PER_EURO: Readonly<Record<string, number>> = { EUR: 1, USD: 1.1233044029394987, GBP: 0.848062476068255, JPY: 177.56831929, KRW: 1505.616878 };
const USDC_PER_EURO = 1.1234568828358257;
const DECIMALS: Readonly<Record<string, number>> = { EUR: 2, USD: 2, GBP: 2, JPY: 0, KRW: 0 };

type Rule = Readonly<{ percent?: number; plus?: number; minimum?: number; extraLine?: Record<string, unknown>; inactive?: readonly string[] }>;

/** Rampnow's answer for one ask, by the rule read: what its page would say. */
function answerFor(address: string, rule: Rule = {}): unknown {
  const asked = new URL(address).searchParams;
  const currency = asked.get("srcCurrency") ?? "";
  const amount = Number(asked.get("srcAmount"));
  const perEuro = PER_EURO[currency];
  const assetConfigs: Record<string, unknown> = { "USDC:monad": { asset: "USDC:monad", status: "active", exchangeRate: String(USDC_PER_EURO) }, "NGN:fiat": { asset: "NGN:fiat", status: "active", payinModes: ["ngn_bank_transfer"], exchangeRate: "1700" } };
  for (const [code, rate] of Object.entries(PER_EURO)) assetConfigs[`${code}:fiat`] = { asset: `${code}:fiat`, status: rule.inactive?.includes(code) ? "inactive" : "active", payinModes: ["card", "apple_pay"], exchangeRate: String(rate) };
  const base = { orderType: "buy", paymentMode: "card", srcCurrency: currency, srcChain: "fiat", srcAmount: String(amount), dstCurrency: "USDC", dstChain: "monad" };
  const data = { assetConfigs, paymentModeConfigs: { card: { status: "active", minAmount: "5", maxAmount: "10000" } } };
  if (perEuro === undefined || rule.inactive?.includes(currency) || amount < 5 * perEuro) return { code: 0, message: "success", data: { ...data, initialQuote: { ...base, dstAmount: "0", exchangeRate: "0", feeDetails: [] } } };
  const platform = Math.max((rule.minimum ?? 1) * perEuro, (rule.plus ?? 0.4) * perEuro + (amount * (rule.percent ?? 7)) / 100);
  const network = 0.0034465665610972 * perEuro;
  const arrives = Math.floor(((amount - platform - network) / perEuro) * USDC_PER_EURO * 100 + 1e-9) / 100;
  const feeDetails = [{ type: "platform", fee: String(platform), currency }, { type: "network", fee: String(network), currency }, ...(rule.extraLine ? [rule.extraLine] : [])];
  return { code: 0, message: "success", data: { ...data, initialQuote: { ...base, dstAmount: String(arrives), exchangeRate: String(USDC_PER_EURO / perEuro), feeDetails } } };
}

function rampnow(rule: Rule = {}): RampnowQuoteDeps & { asked: string[] } {
  const asked: string[] = [];
  return { key: KEY, asked, ask: async (address) => (asked.push(address), answerFor(address, rule)) };
}

beforeEach(() => forgetQuotes());

test("the key is the founder's own public one, read from one setting, and a key that does not look public is never used", () => {
  assert.equal(rampnowKey({ RAMPNOW_API_KEY: ` ${KEY} ` }), KEY);
  assert.equal(rampnowQuotesOn({ RAMPNOW_API_KEY: KEY }), true);
  for (const not of [undefined, "", "sk_live_a_secret", "a-secret-with-no-prefix", "pk_live has a space"]) {
    assert.equal(rampnowKey({ RAMPNOW_API_KEY: not }), undefined, String(not));
    assert.equal(rampnowQuotesOn({ RAMPNOW_API_KEY: not }), false);
  }
  // With no key nothing is asked of Rampnow at all: the key its public page sends is never ours to use.
  const source = readFileSync("src/rampnow-quote.ts", "utf8");
  assert.equal((source.match(/RAMPNOW_API_KEY/g) ?? []).length >= 1, true);
  assert.doesNotMatch(source, /searchParams\.get\("apiKey"\)|document\.|chromium/);
  // The same setting the frame's address takes (src/rampnow-frame.ts), named in .env.example.
  assert.match(readFileSync("app/api/fund/rampnow-frame/route.ts", "utf8"), /process\.env\.RAMPNOW_API_KEY/);
  assert.match(readFileSync(".env.example", "utf8"), /^RAMPNOW_API_KEY=$/m);
});

test("one reading is asked as Rampnow's own page asks it", () => {
  const address = new URL(rampnowQuoteAddress({ currency: "USD", amount: 11.35 }, KEY));
  assert.equal(`${address.origin}${address.pathname}`, "https://app.rampnow.io/api/ramp/v1/public/ramp_order/config");
  assert.deepEqual(Object.fromEntries(address.searchParams), { orderType: "buy", srcAmount: "11.35", srcCurrency: "USD", srcChain: "fiat", dstCurrency: "USDC", dstChain: "monad", paymentMode: "card", apiKey: KEY });
});

test("with no key nothing is asked, and the answer says the quotes are off", async () => {
  const off = { key: undefined, ask: async () => assert.fail("nothing is asked without a key") };
  assert.deepEqual(await rampnowQuote({ currency: "USD", usdc: 10.1 }, off), { state: "none", because: "off" });
  assert.deepEqual(await quoteForUsdc({ currency: "EUR", usdc: 10.1 }, off), { state: "none", because: "off" });
});

test("the amount is found by asking: enough USDC arrive, hardly more, in a few readings, in whatever the currency", async () => {
  for (const currency of Object.keys(PER_EURO)) {
    for (const usdc of [6.06, 8.08, 10.1, 20.2, 50.5, 101, 505]) {
      const service = rampnow();
      const said = await rampnowQuote({ currency, usdc }, service);
      assert.equal(said.state, "quoted", `${currency} ${usdc}`);
      if (said.state !== "quoted") continue;
      const { quote } = said;
      assert.equal(quote.currency, currency);
      assert.ok(quote.arrives >= usdc, `${currency} ${usdc}: ${quote.arrives} arrive`);
      // Hardly more than needed: under one part in a hundred and a few of the currency's own units.
      const unitInUsdc = (10 ** -DECIMALS[currency] / PER_EURO[currency]) * USDC_PER_EURO;
      assert.ok(quote.arrives - usdc <= usdc * 0.01 + 3 * unitInUsdc + 0.02, `${currency} ${usdc}: ${quote.arrives - usdc} over`);
      // The amount is written to the currency's own decimals, and it is the last quote read that is said.
      assert.equal(Number(quote.amount.toFixed(DECIMALS[currency])), quote.amount);
      const again = readRampnowAnswer(answerFor(rampnowQuoteAddress({ currency, amount: quote.amount }, KEY)), { currency, amount: quote.amount });
      assert.equal(again?.arrives, quote.arrives);
      assert.equal(again?.fee, quote.fee);
      assert.ok(quote.fee > 0 && quote.fee < quote.amount);
      assert.ok(service.asked.length <= MOST_READINGS, `${currency} ${usdc}: ${service.asked.length} readings`);
      assert.ok(service.asked.every((address) => new URL(address).searchParams.get("apiKey") === KEY));
    }
  }
});

test("a gift of ten dollars, as measured on 9 Oct 2026: about $11.35 by card, of which $1.24 is its fee", async () => {
  const said = await rampnowQuote({ currency: "USD", usdc: 10.1 }, rampnow());
  assert.equal(said.state, "quoted");
  if (said.state !== "quoted") return;
  assert.ok(said.quote.amount >= 11.35 && said.quote.amount <= 11.38, String(said.quote.amount));
  assert.ok(Math.abs(said.quote.fee - 1.25) < 0.01, String(said.quote.fee));
});

test("under its smallest payment: said as under, with the floor in whole units of the currency", async () => {
  // Five euros at its rate, to the unit above: 6 dollars where 5.62 is its own floor, 5 euros, 888 yen.
  assert.deepEqual(await rampnowQuote({ currency: "USD", usdc: 3.03 }, rampnow()), { state: "under", currency: "USD", smallest: 6 });
  assert.deepEqual(await rampnowQuote({ currency: "EUR", usdc: 3.03 }, rampnow()), { state: "under", currency: "EUR", smallest: 5 });
  assert.deepEqual(await rampnowQuote({ currency: "JPY", usdc: 3.03 }, rampnow()), { state: "under", currency: "JPY", smallest: 888 });
  // What six dollars bring, 4.87 USDC, is the smallest need a card is offered for in dollars.
  const atTheFloor = await rampnowQuote({ currency: "USD", usdc: 4.87 }, rampnow());
  assert.deepEqual(atTheFloor.state === "quoted" ? { amount: atTheFloor.quote.amount, arrives: atTheFloor.quote.arrives } : atTheFloor, { amount: 6, arrives: 4.87 });
  assert.equal((await rampnowQuote({ currency: "USD", usdc: 4.8 }, rampnow())).state, "under");
});

test("a currency Rampnow does not take by card is said so by its own answer, never by a list here", async () => {
  // Not in its table, in its table without the card, and switched off that afternoon (the Canadian dollar, 9 Oct 2026).
  assert.deepEqual(await rampnowQuote({ currency: "XOF", usdc: 10.1 }, rampnow()), { state: "none", because: "not-taken" });
  assert.deepEqual(await rampnowQuote({ currency: "NGN", usdc: 10.1 }, rampnow()), { state: "none", because: "not-taken" });
  assert.deepEqual(await rampnowQuote({ currency: "GBP", usdc: 10.1 }, rampnow({ inactive: ["GBP"] })), { state: "none", because: "not-taken" });
  assert.doesNotMatch(readFileSync("src/rampnow-quote.ts", "utf8").replace(/\/\*\*[\s\S]*?\*\//g, ""), /"(AED|AUD|CHF|GBP|JPY|USD|EUR)"/, "no currency is written in its code");
  // Three letters that name no currency are not asked at all.
  const service = rampnow();
  assert.deepEqual(await rampnowQuote({ currency: "usd", usdc: 10.1 }, service), { state: "none", because: "not-understood" });
  assert.equal(service.asked.length, 0);
});

test("a quote that is not understood whole is set aside: another kind of fee, another currency, a discount, another answer", async () => {
  for (const extraLine of [{ type: "partner", fee: "0.25", currency: "USD" }, { type: "platform", fee: "0.25", currency: "EUR" }, { type: "platform", fee: "0", currency: "USD", discount: { type: "pct", value: "10" } }]) {
    assert.deepEqual(await rampnowQuote({ currency: "USD", usdc: 10.1 }, rampnow({ extraLine })), { state: "none", because: "not-understood" }, JSON.stringify(extraLine));
  }
  const ask = { currency: "USD", amount: 20 };
  const good = answerFor(rampnowQuoteAddress(ask, KEY)) as { data: { initialQuote: Record<string, unknown> } };
  assert.equal(readRampnowAnswer(good, ask)?.arrives, 18.14, "as read on 9 Oct 2026: 20 dollars bring 18.14 USDC");
  // The answer to another amount, to another currency, or an error, is no answer to this ask.
  assert.equal(readRampnowAnswer(good, { currency: "USD", amount: 21 }), null);
  assert.equal(readRampnowAnswer({ code: 100008, message: "internal_err" }, ask), null);
  assert.equal(readRampnowAnswer(null, ask), null);
  assert.equal(readRampnowAnswer({ ...good, data: { ...good.data, initialQuote: { ...good.data.initialQuote, dstChain: "base" } } }, ask), null);
  assert.deepEqual(await rampnowQuote({ currency: "USD", usdc: 10.1 }, { key: KEY, ask: async () => ({ code: 100008, message: "internal_err" }) }), { state: "none", because: "not-understood" });
});

test("a Rampnow that does not answer gives no quote, and is asked again at the next press; a quote is said again for a minute", async () => {
  assert.deepEqual(await rampnowQuote({ currency: "USD", usdc: 10.1 }, { key: KEY, ask: async () => Promise.reject(new Error("late")) }), { state: "none", because: "silent" });
  // Kept a minute for the same need, to the cent of USDC, so the screen that waits says what the sheet said.
  const service = rampnow();
  const first = await quoteForUsdc({ currency: "EUR", usdc: 10.1 }, service, 1_000);
  const readings = service.asked.length;
  assert.equal(first.state, "quoted");
  assert.deepEqual(await quoteForUsdc({ currency: "EUR", usdc: 10.1 }, service, 1_000 + QUOTE_KEPT_MS - 1), first);
  assert.equal(service.asked.length, readings, "not asked again within the minute");
  await quoteForUsdc({ currency: "EUR", usdc: 10.1 }, service, 1_000 + QUOTE_KEPT_MS);
  assert.ok(service.asked.length > readings, "asked again after it");
  await quoteForUsdc({ currency: "EUR", usdc: 10.11 }, service, 1_000);
  // A silence is not kept: the next press asks.
  let calls = 0;
  const silent = { key: KEY, ask: async () => ((calls += 1), Promise.reject(new Error("late"))) };
  assert.deepEqual(await quoteForUsdc({ currency: "GBP", usdc: 10.1 }, silent, 5_000), { state: "none", because: "silent" });
  await quoteForUsdc({ currency: "GBP", usdc: 10.1 }, silent, 5_001);
  assert.equal(calls, 2);
});

test("the route reads a currency and an amount of USDC, and nothing of a person; with no key it says the quotes are off", async () => {
  const ask = (query: string) => cardQuoteAsk(new URLSearchParams(query));
  // In millionths, as an account counts them, and said to Rampnow to the cent above.
  assert.deepEqual(ask("currency=USD&units=10100000"), { currency: "USD", usdc: 10.1 });
  assert.deepEqual(ask("currency=EUR&units=10100001"), { currency: "EUR", usdc: 10.11 });
  for (const not of ["", "currency=USD", "units=10100000", "currency=usd&units=10100000", "currency=USD&units=0", "currency=USD&units=-5", "currency=USD&units=1.5", "currency=USD&units=10000000001", "currency=DOLLARS&units=10100000"]) assert.equal(ask(not), null, not);
  const saved = process.env.RAMPNOW_API_KEY;
  delete process.env.RAMPNOW_API_KEY;
  try {
    const off = await GET(new Request("https://viky.cash/api/rails/card-quote?currency=USD&units=10100000"));
    assert.equal(off.status, 200);
    assert.equal(off.headers.get("cache-control"), "no-store");
    assert.deepEqual(await off.json(), { state: "none", because: "off" });
    assert.deepEqual(await (await GET(new Request("https://viky.cash/api/rails/card-quote?currency=USD"))).json(), { state: "none", because: "not-understood" });
  } finally {
    if (saved !== undefined) process.env.RAMPNOW_API_KEY = saved;
  }
  // No session is read, and what leaves for Rampnow is a currency, an amount and the server's key.
  const route = readFileSync("app/api/rails/card-quote/route.ts", "utf8");
  assert.doesNotMatch(route, /readAccountAuthSession|headers\.get\("cookie"\)/);
  assert.match(route, /checkRateLimit\("status", request\)/);
});
