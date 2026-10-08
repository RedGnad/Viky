import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  amountOf,
  dollarsOfLimit,
  mobileMoneyCoverage,
  mobileMoneyInCoverage,
  mobileMoneyOperators,
  openPayout,
  payInRates,
  payoutFields,
  payoutRates,
  payoutStateOf,
  quotePayIn,
  quotePayout,
  signedBySwitch,
  SwitchError,
  switchCall,
  unitsOf,
  type FetchLike,
} from "../src/switch";

/**
 * Switch, the mobile money way out (the founder, 2 Oct 2026). The answers below are the shapes Switch gave live on
 * 2 Oct 2026 (coverage, requirements) or documents (quote, initiate, status, webhook), trimmed to what is read.
 */

const ENV = { SWITCH_SERVICE_KEY: "test-key-not-a-real-one" };

function answering(body: unknown, status = 200) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchLike: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  };
  return { fetchLike, calls };
}

const COVERAGE = {
  success: true,
  message: "Coverage fetched successfully",
  data: [
    { country: "NG", currency: ["NGN"], channel: ["BANK"], direction: ["ONRAMP", "OFFRAMP"], settlement_time: { BANK: "30-120 seconds" }, payout_limit: { BANK: { min: "$0.5", max: "$100,000" } } },
    { country: "SN", currency: ["XOF"], channel: ["MOBILEMONEY"], direction: ["OFFRAMP", "ONRAMP"], settlement_time: { MOBILEMONEY: "5-10 minutes" }, payout_limit: { MOBILEMONEY: { min: "$10", max: "$100,000" }, note: "USD" } },
    { country: "CI", currency: ["XOF"], channel: ["MOBILEMONEY"], direction: ["OFFRAMP"], settlement_time: { MOBILEMONEY: "5-10 minutes" }, payout_limit: { MOBILEMONEY: { min: "$1", max: "$100,000" } } },
  ],
};

const REQUIREMENT_SN = {
  success: true,
  message: "Requirement fetched successfully",
  data: [
    { path: "holder_type", regex: "^INDIVIDUAL|BUSINESS$", example: "INDIVIDUAL", option: [] },
    { path: "holder_name", regex: "^(?=.*[A-Za-z])[A-Za-z0-9\\s\\-'&().,;]{2,100}$", example: "John Doe", option: [] },
    { path: "mobile_number", regex: "^[0-9]{9,40}$", example: "08123456789", option: [] },
    { path: "mobile_network", regex: "^ORANGE|WAVE$", example: "ORANGE", option: [{ code: "ORANGE", name: "ORANGE" }, { code: "WAVE", name: "WAVE" }] },
  ],
};

test("every call carries the key in its own header, and only there", async () => {
  const { fetchLike, calls } = answering(COVERAGE);
  await mobileMoneyCoverage({ fetchLike, env: ENV });
  assert.equal(calls[0].url, "https://api.onswitch.xyz/coverage?direction=OFFRAMP");
  assert.equal((calls[0].init?.headers as Record<string, string>)["x-service-key"], ENV.SWITCH_SERVICE_KEY);
  assert.ok(!calls[0].url.includes(ENV.SWITCH_SERVICE_KEY));
  await assert.rejects(switchCall("/asset", { fetchLike, env: {} }), (error: unknown) => error instanceof SwitchError && error.code === "NOT_CONFIGURED");
});

test("the coverage keeps the countries paid to mobile money, with their published time and their limits in dollars", async () => {
  const rows = await mobileMoneyCoverage({ fetchLike: answering(COVERAGE).fetchLike, env: ENV });
  assert.deepEqual(rows, [
    { country: "SN", currency: "XOF", settlement: "5-10 minutes", minimumUnits: 10_000_000n, maximumUnits: 100_000_000_000n },
    { country: "CI", currency: "XOF", settlement: "5-10 minutes", minimumUnits: 1_000_000n, maximumUnits: 100_000_000_000n },
  ]);
  assert.equal(dollarsOfLimit("$0.5"), 500_000n);
  assert.throws(() => dollarsOfLimit("ten dollars"), SwitchError);
});

test("the fields of a country give its operators and the rules of the number and of the name", async () => {
  const fields = await payoutFields("SN", { fetchLike: answering(REQUIREMENT_SN).fetchLike, env: ENV });
  assert.deepEqual(fields.networks, [{ code: "ORANGE", name: "ORANGE" }, { code: "WAVE", name: "WAVE" }]);
  assert.ok(new RegExp(fields.numberRule).test("771234567"));
  assert.ok(!new RegExp(fields.numberRule).test("77 12"));
  assert.ok(new RegExp(fields.nameRule).test("Awa Ndiaye"));
});

test("a key not opened to payouts, a pause asked, a failure and a refusal are each their own typed answer", async () => {
  const refusal = (body: unknown, status: number) => switchCall("/offramp/quote", { body: {}, fetchLike: answering(body, status).fetchLike, env: ENV });
  // Measured live on 2 Oct 2026, word for word.
  await assert.rejects(refusal({ success: false, message: "Access key not enabled for REMITTANCE", data: null }, 400), (error: unknown) => error instanceof SwitchError && error.code === "NOT_ENABLED");
  await assert.rejects(refusal({ success: false, message: "Too many requests" }, 429), (error: unknown) => error instanceof SwitchError && error.code === "RATE_LIMITED");
  await assert.rejects(refusal({}, 502), (error: unknown) => error instanceof SwitchError && error.code === "UNAVAILABLE");
  await assert.rejects(refusal({ success: false, message: "Invalid beneficiary" }, 400), (error: unknown) => error instanceof SwitchError && error.code === "REFUSED");
  const silent: FetchLike = async () => Promise.reject(new Error("timed out"));
  await assert.rejects(switchCall("/asset", { fetchLike: silent, env: ENV }), (error: unknown) => error instanceof SwitchError && error.code === "UNAVAILABLE");
});

test("dollars go to Switch and come back by their digits, never through a float that loses a cent", () => {
  assert.equal(amountOf(10_123_456n), 10.123456);
  assert.equal(amountOf(10_000_000n), 10);
  assert.equal(unitsOf(10.123456), 10_123_456n);
  assert.equal(unitsOf(0.1 + 0.2), 300_000n);
  assert.equal(unitsOf(15.02), 15_020_000n);
});

test("a quote moves nothing and says what the dollars give, and what Switch keeps when it says", async () => {
  const { fetchLike, calls } = answering({ success: true, data: { rate: 587.13, expiry: "2026-10-02T21:45:00.000Z", settlement: "5-10 minutes", fee: { total: 0.12, currency: "USDC" }, source: { amount: 11.2, currency: "USDC" }, destination: { amount: 6510.2, currency: "XOF" } } });
  const quote = await quotePayout({ country: "SN", units: 11_200_000n }, { fetchLike, env: ENV, now: () => new Date("2026-10-02T21:40:00.000Z") });
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { amount: 11.2, country: "SN", asset: "monad:usdc", channel: "MOBILEMONEY" });
  assert.equal(calls[0].url, "https://api.onswitch.xyz/offramp/quote");
  assert.deepEqual(quote, { local: 6510.2, currency: "XOF", sourceUnits: 11_200_000n, rate: 587.13, feeUnits: 120_000n, at: "2026-10-02T21:40:00.000Z", expiry: "2026-10-02T21:45:00.000Z", settlement: "5-10 minutes" });
});

test("asked for an amount of local money, the quote is Switch's exact output: the francs delivered, the dollars counted", async () => {
  const { fetchLike, calls } = answering({ success: true, data: { rate: 587.13, source: { amount: 15.07, currency: "USDC" }, destination: { amount: 8800, currency: "XOF" } } });
  const quote = await quotePayout({ country: "SN", local: 8800, currency: "XOF" }, { fetchLike, env: ENV });
  // docs.onswitch.xyz, Get quote: "With true, amount is the local currency to deliver".
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { amount: 8800, country: "SN", currency: "XOF", asset: "monad:usdc", channel: "MOBILEMONEY", exact_output: true });
  assert.equal(quote.sourceUnits, 15_070_000n);
  assert.equal(quote.local, 8800);
});

test("Switch's live answers of 2 Oct 2026, 23:23 UTC, with no fee in them, read as they came", async () => {
  // Measured with the live key, quotes only: the dollars sent for Senegal, then the francs delivered.
  const sent = { expiry: "2026-10-03T00:28:50+01:00", settlement: "5-10 minutes", channel: "MOBILEMONEY", rate: 589.21703, source: { amount: 10, amount_usd: 10, currency: "USDC", network: "MONAD" }, destination: { amount: 5892.1703, amount_usd: 10, currency: "XOF", network: "FIAT" } };
  const byDollars = await quotePayout({ country: "SN", units: 10_000_000n }, { fetchLike: answering({ success: true, message: "Offramp quote fetched successfully", data: sent }).fetchLike, env: ENV });
  assert.equal(byDollars.local, 5892.1703);
  assert.equal(byDollars.sourceUnits, 10_000_000n);
  assert.equal(byDollars.feeUnits, null, "no fee line in the answer, so none is said");
  const delivered = { expiry: "2026-10-03T00:29:32+01:00", settlement: "5-10 minutes", channel: "MOBILEMONEY", rate: 589.21703, source: { amount: 14.935075, amount_usd: 14.935074, currency: "USDC", network: "MONAD" }, destination: { amount: 8800, amount_usd: 14.935074, currency: "XOF", network: "FIAT" } };
  const byFrancs = await quotePayout({ country: "SN", local: 8800, currency: "XOF" }, { fetchLike: answering({ success: true, message: "Offramp quote fetched successfully", data: delivered }).fetchLike, env: ENV });
  assert.equal(byFrancs.sourceUnits, 14_935_075n);
  assert.equal(byFrancs.local, 8800);
  assert.equal(byFrancs.expiry, "2026-10-03T00:29:32+01:00");
});

test("Switch's published rates are read per currency", async () => {
  const { payoutRates } = await import("../src/switch");
  const rates = await payoutRates({ fetchLike: answering({ success: true, data: [{ currency: "XOF", rate: 587.1333 }, { currency: "XAF", rate: 610.164 }, { currency: "BAD", rate: "x" }] }).fetchLike, env: ENV });
  assert.equal(rates.get("XOF"), 587.1333);
  assert.equal(rates.has("BAD"), false);
});

test("a payout is opened for the person's own number, refunded to their own account, for a gift, and its deposit is read exactly", async () => {
  const { fetchLike, calls } = answering({
    success: true,
    data: { status: "AWAITING_DEPOSIT", reference: "61f9a35a-e535-4f04-ba50-3058b4c856c4", rate: 587.13, destination: { amount: 6510.2, currency: "XOF" }, deposit: { amount: 11.2, address: "0x3131b6f6a32751C9d99C1710e357A6C4297d17Bc", asset: "monad:usdc" } },
  });
  const opened = await openPayout(
    { reference: "61f9a35a-e535-4f04-ba50-3058b4c856c4", country: "SN", units: 11_200_000n, beneficiary: { network: "ORANGE", number: "771234567", holderName: "Awa Ndiaye" }, refundAddress: "0x00000000000000000000000000000000000a11ce", callbackUrl: "https://viky.cash/api/mobile-money/webhook" },
    { fetchLike, env: ENV },
  );
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
    amount: 11.2,
    country: "SN",
    asset: "monad:usdc",
    channel: "MOBILEMONEY",
    beneficiary: { holder_type: "INDIVIDUAL", holder_name: "Awa Ndiaye", mobile_network: "ORANGE", mobile_number: "771234567" },
    reference: "61f9a35a-e535-4f04-ba50-3058b4c856c4",
    reason: "GIFT_AND_DONATION",
    refund_address: "0x00000000000000000000000000000000000a11ce",
    callback_url: "https://viky.cash/api/mobile-money/webhook",
    exact_output: false,
  });
  assert.equal(opened.depositUnits, 11_200_000n);
  assert.equal(opened.depositAddress, "0x3131b6f6a32751C9d99C1710e357A6C4297d17Bc");
  // A deposit asked in another coin, or at something that is not an address, is never followed.
  const elsewhere = answering({ success: true, data: { status: "AWAITING_DEPOSIT", reference: "x", rate: 1, destination: { amount: 1, currency: "XOF" }, deposit: { amount: 11.2, address: "0x3131b6f6a32751C9d99C1710e357A6C4297d17Bc", asset: "base:usdc" } } });
  await assert.rejects(openPayout({ reference: "x", country: "SN", units: 1n, beneficiary: { network: "ORANGE", number: "771234567", holderName: "Awa" }, refundAddress: "0x0", callbackUrl: "x" }, { fetchLike: elsewhere.fetchLike, env: ENV }), SwitchError);
});

test("a state is read the same from the status route and from the webhook, and a webhook is believed only when Switch signed it", () => {
  const data = { status: "COMPLETED", reference: "9fa5699e-bd99-442f-9185-7f51e606a39d", destination: { amount: 6510.2, currency: "XOF" }, meta: { hash: `0x${"ab".repeat(32)}` } };
  assert.deepEqual(payoutStateOf(data), { status: "COMPLETED", local: 6510.2, currency: "XOF", depositHash: `0x${"ab".repeat(32)}` });
  assert.deepEqual(payoutStateOf({ status: "AWAITING_DEPOSIT", meta: {} }), { status: "AWAITING_DEPOSIT", local: null, currency: null, depositHash: null });
  const body = JSON.stringify({ success: true, data });
  const signature = createHmac("sha256", ENV.SWITCH_SERVICE_KEY).update(body, "utf8").digest("hex");
  assert.equal(signedBySwitch(body, signature, ENV), true);
  assert.equal(signedBySwitch(body, ` ${signature}\n`, ENV), true, "trimmed, as their own example does");
  assert.equal(signedBySwitch(`${body} `, signature, ENV), false, "one byte changed");
  assert.equal(signedBySwitch(body, null, ENV), false);
  assert.equal(signedBySwitch(body, signature, {}), false, "no key, nothing is believed");
  assert.equal(signedBySwitch(body, createHmac("sha256", "another-key").update(body, "utf8").digest("hex"), ENV), false);
});

/**
 * The way in (the founder, 8 Oct 2026). The answers below are the ones Switch gave live on 8 Oct 2026 between 09:26
 * and 09:40 UTC, trimmed to what is read. No collection was opened: `/onramp/initiate` is called nowhere.
 */

const COVERAGE_IN = {
  success: true,
  message: "Coverage fetched successfully",
  data: [
    { country: "NG", currency: ["NGN"], channel: ["BANK"], direction: ["ONRAMP", "OFFRAMP"], settlement_time: { BANK: "30-120 seconds" }, payout_limit: { BANK: { min: "$1", max: "$100,000" } } },
    { country: "CI", currency: ["XOF"], channel: ["MOBILEMONEY"], direction: ["OFFRAMP", "ONRAMP"], settlement_time: { MOBILEMONEY: "5-10 minutes" }, payout_limit: { MOBILEMONEY: { min: "$1", max: "$100,000" }, note: "This represents the maximum USD value allowed per transaction." } },
    { country: "KE", currency: ["KES"], channel: ["MOBILEMONEY", "BANK"], direction: ["OFFRAMP", "ONRAMP"], settlement_time: { BANK: "5-10 minutes", MOBILEMONEY: "5-10 minutes" }, payout_limit: { MOBILEMONEY: { min: "$10", max: "$100,000" }, BANK: { min: "$10", max: "$100,000" } } },
    // A country paid to and not collected from is not a country of the way in.
    { country: "GA", currency: ["XAF"], channel: ["MOBILEMONEY"], direction: ["OFFRAMP"], settlement_time: { MOBILEMONEY: "5-10 minutes" }, payout_limit: { MOBILEMONEY: { min: "$10", max: "$100,000" } } },
  ],
};

const QUOTE_IN_LOCAL = {
  success: true,
  message: "Onramp quote fetched successfully",
  data: { expiry: "2026-10-08T10:28:27+01:00", settlement: "5-10 minutes", channel: "MOBILEMONEY", rate: 617.393322, source: { amount: 10000, amount_usd: 16.19713, currency: "XOF", network: "FIAT" }, destination: { amount: 16.19713, amount_usd: 16.19713, currency: "USDC", network: "MONAD" } },
};
const QUOTE_IN_EXACT = {
  success: true,
  message: "Onramp quote fetched successfully",
  data: { expiry: "2026-10-08T10:28:44+01:00", settlement: "5-10 minutes", channel: "MOBILEMONEY", rate: 617.393322, source: { amount: 6173.94, amount_usd: 10, currency: "XOF", network: "FIAT" }, destination: { amount: 10, amount_usd: 10, currency: "USDC", network: "MONAD" } },
};

test("the way in has its own coverage: the countries collected from by mobile money, and no other", async () => {
  const { fetchLike, calls } = answering(COVERAGE_IN);
  const rows = await mobileMoneyInCoverage({ fetchLike, env: ENV });
  assert.equal(calls[0].url, "https://api.onswitch.xyz/coverage?direction=ONRAMP");
  assert.deepEqual(rows, [
    { country: "CI", currency: "XOF", settlement: "5-10 minutes", minimumUnits: 1_000_000n, maximumUnits: 100_000_000_000n },
    { country: "KE", currency: "KES", settlement: "5-10 minutes", minimumUnits: 10_000_000n, maximumUnits: 100_000_000_000n },
  ]);
  // The way out still asks for its own direction, and keeps the country it is alone to serve.
  const out = answering(COVERAGE_IN);
  const paid = await mobileMoneyCoverage({ fetchLike: out.fetchLike, env: ENV });
  assert.equal(out.calls[0].url, "https://api.onswitch.xyz/coverage?direction=OFFRAMP");
  assert.deepEqual(paid.map((row) => row.country), ["CI", "KE", "GA"]);
});

test("the operators of a country are read where Switch publishes them for the way in", async () => {
  const { fetchLike, calls } = answering({ success: true, message: "Institution fetched successfully", data: [{ code: "ORANGE", name: "ORANGE" }, { code: "WAVE", name: "WAVE" }] });
  assert.deepEqual(await mobileMoneyOperators("SN", { fetchLike, env: ENV }), [{ code: "ORANGE", name: "ORANGE" }, { code: "WAVE", name: "WAVE" }]);
  assert.equal(calls[0].url, "https://api.onswitch.xyz/institution?country=SN&channel=MOBILEMONEY");
  assert.equal(calls[0].init?.method, "GET");
  await assert.rejects(mobileMoneyOperators("SN", { fetchLike: answering({ success: true, message: "ok", data: [{ code: 7 }] }).fetchLike, env: ENV }), (error: unknown) => error instanceof SwitchError && error.code === "BAD_ANSWER");
});

test("each direction has its own published rate, and neither is asked for the other", async () => {
  const inward = answering({ success: true, message: "Rates fetched successfully", data: [{ currency: "XOF", rate: 617.393939 }, { currency: "KES", rate: 131.575757 }] });
  assert.equal((await payInRates({ fetchLike: inward.fetchLike, env: ENV })).get("XOF"), 617.393939);
  assert.equal(inward.calls[0].url, "https://api.onswitch.xyz/rates?direction=ONRAMP");
  const outward = answering({ success: true, message: "Rates fetched successfully", data: [{ currency: "XOF", rate: 587.22303 }] });
  assert.equal((await payoutRates({ fetchLike: outward.fetchLike, env: ENV })).get("XOF"), 587.22303);
  assert.equal(outward.calls[0].url, "https://api.onswitch.xyz/rates?direction=OFFRAMP");
});

test("a quote of the way in says what the payer pays and the dollars it delivers on Monad, either way round", async () => {
  const typed = answering(QUOTE_IN_LOCAL);
  const fromLocal = await quotePayIn({ country: "CI", currency: "XOF", local: 10_000 }, { fetchLike: typed.fetchLike, env: ENV, now: () => new Date("2026-10-08T09:27:00Z") });
  assert.equal(typed.calls[0].url, "https://api.onswitch.xyz/onramp/quote");
  assert.deepEqual(JSON.parse(String(typed.calls[0].init?.body)), { amount: 10000, country: "CI", currency: "XOF", asset: "monad:usdc", channel: "MOBILEMONEY", exact_output: false });
  assert.deepEqual(fromLocal, { local: 10000, currency: "XOF", units: 16_197_130n, rate: 617.393322, feeLocal: null, at: "2026-10-08T09:27:00.000Z", expiry: "2026-10-08T10:28:27+01:00", settlement: "5-10 minutes" });

  const exact = answering(QUOTE_IN_EXACT);
  const forDollars = await quotePayIn({ country: "CI", currency: "XOF", units: 10_000_000n }, { fetchLike: exact.fetchLike, env: ENV });
  assert.deepEqual(JSON.parse(String(exact.calls[0].init?.body)), { amount: 10, country: "CI", currency: "XOF", asset: "monad:usdc", channel: "MOBILEMONEY", exact_output: true });
  assert.equal(forDollars.local, 6173.94);
  assert.equal(forDollars.units, 10_000_000n);
});

test("a quote in another currency, or for a dollar that is not the one on Monad, is not a quote for this way", async () => {
  const otherCurrency = { ...QUOTE_IN_LOCAL, data: { ...QUOTE_IN_LOCAL.data, source: { ...QUOTE_IN_LOCAL.data.source, currency: "XAF" } } };
  const otherNetwork = { ...QUOTE_IN_LOCAL, data: { ...QUOTE_IN_LOCAL.data, destination: { ...QUOTE_IN_LOCAL.data.destination, network: "BASE" } } };
  const otherCoin = { ...QUOTE_IN_LOCAL, data: { ...QUOTE_IN_LOCAL.data, destination: { ...QUOTE_IN_LOCAL.data.destination, currency: "USDT" } } };
  for (const answer of [otherCurrency, otherNetwork, otherCoin]) {
    await assert.rejects(quotePayIn({ country: "CI", currency: "XOF", local: 10_000 }, { fetchLike: answering(answer).fetchLike, env: ENV }), (error: unknown) => error instanceof SwitchError && error.code === "BAD_ANSWER");
  }
  // A fee, the day an answer carries one, is kept in the payer's money as Switch counts it.
  const withFee = { ...QUOTE_IN_LOCAL, data: { ...QUOTE_IN_LOCAL.data, fee: { total: 150, platform: 150, developer: 0, currency: "XOF" } } };
  assert.equal((await quotePayIn({ country: "CI", currency: "XOF", local: 10_000 }, { fetchLike: answering(withFee).fetchLike, env: ENV })).feeLocal, 150);
});

test("no collection is opened anywhere in this code yet", async () => {
  const { readFileSync, globSync } = await import("node:fs");
  const callersOf = (route: string) => ["app/**/*.ts", "app/**/*.tsx", "src/**/*.ts", "scripts/*.ts"].flatMap((pattern) => globSync(pattern)).filter((file) => new RegExp(`["'\`]/${route}/initiate`).test(readFileSync(file, "utf8")));
  assert.deepEqual(callersOf("onramp"), []);
  // The same search does find the one place a payout is opened, so an empty answer above is not a search that finds nothing.
  assert.deepEqual(callersOf("offramp"), ["src/switch.ts"]);
});
