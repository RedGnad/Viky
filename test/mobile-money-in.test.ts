// The mobile money way in (the founder, 8 Oct 2026): where it is offered, read from Switch and kept a few minutes.
// The stand-in answers what Switch answered live on 8 Oct 2026. No collection is opened by anything tested here.

import assert from "node:assert/strict";
import test from "node:test";
import { mobileMoneyInOn } from "../src/mobile-money-in";
import { forgetKeptPayInCoverage, payInCountries, payInOfferIn, type PayInReader } from "../src/mobile-money-in-server";

const ENV = { SWITCH_SERVICE_KEY: "test-key-not-a-real-one" };
const LIMITS = { minimumUnits: 10_000_000n, maximumUnits: 100_000_000_000n, settlement: "5-10 minutes" };

function reading(over: Partial<PayInReader> = {}) {
  const asked = { coverage: 0, rates: 0, operators: [] as string[] };
  const reader: PayInReader = {
    coverage: async () => {
      asked.coverage += 1;
      return [
        { country: "CI", currency: "XOF", ...LIMITS, minimumUnits: 1_000_000n },
        { country: "SN", currency: "XOF", ...LIMITS },
        { country: "KE", currency: "KES", ...LIMITS },
        // Collected from, with no rate published for its currency: not offered.
        { country: "EG", currency: "EGP", ...LIMITS },
      ];
    },
    rates: async () => {
      asked.rates += 1;
      return new Map([["XOF", 617.393939], ["KES", 131.575757]]);
    },
    operators: async (country) => {
      asked.operators.push(country);
      return country === "SN" ? [{ code: "ORANGE", name: "ORANGE" }, { code: "WAVE", name: "WAVE" }] : country === "KE" ? [{ code: "MPESA", name: "MPESA" }, { code: "AIRTEL", name: "AIRTEL" }] : [{ code: "ORANGE", name: "ORANGE" }, { code: "MTN", name: "MTN" }, { code: "MOOV", name: "MOOV" }];
    },
    ...over,
  };
  return { reader, asked };
}

test("the way in needs no setting to open, only the key, and one setting closes it", () => {
  assert.equal(mobileMoneyInOn(ENV), true);
  assert.equal(mobileMoneyInOn({}), false);
  assert.equal(mobileMoneyInOn({ ...ENV, MOBILE_MONEY_IN: "off" }), false);
  assert.equal(mobileMoneyInOn({ ...ENV, MOBILE_MONEY_IN: " OFF " }), false);
  // The way out's own switch says nothing of the way in.
  assert.equal(mobileMoneyInOn({ ...ENV, MOBILE_MONEY_OUT: "off" }), true);
});

test("a country Switch collects in is offered with its operators, its limits and its published time", async () => {
  forgetKeptPayInCoverage();
  const { reader } = reading();
  assert.deepEqual(await payInOfferIn("sn", { reader, env: ENV, now: () => 0 }), {
    offered: true,
    country: "SN",
    currency: "XOF",
    settlement: "5-10 minutes",
    minimumUnits: "10000000",
    maximumUnits: "100000000000",
    operators: [{ code: "ORANGE", name: "Orange" }, { code: "WAVE", name: "Wave" }],
    rate: 617.393939,
  });
  const ivory = await payInOfferIn("CI", { reader, env: ENV, now: () => 0 });
  assert.equal(ivory.offered && ivory.minimumUnits, "1000000");
  assert.deepEqual(ivory.offered && ivory.operators.map((one) => one.name), ["Orange", "MTN", "Moov"]);
});

test("not offered: closed, no key, a country not covered, no rate, no operator, no country, or Switch not answering", async () => {
  forgetKeptPayInCoverage();
  const { reader } = reading();
  assert.deepEqual(await payInOfferIn("SN", { reader, env: { ...ENV, MOBILE_MONEY_IN: "off" }, now: () => 0 }), { offered: false });
  assert.deepEqual(await payInOfferIn("SN", { reader, env: {}, now: () => 0 }), { offered: false });
  assert.deepEqual(await payInOfferIn("FR", { reader, env: ENV, now: () => 0 }), { offered: false });
  assert.deepEqual(await payInOfferIn("EG", { reader, env: ENV, now: () => 0 }), { offered: false });
  assert.deepEqual(await payInOfferIn(null, { reader, env: ENV, now: () => 0 }), { offered: false });
  assert.deepEqual(await payInOfferIn("Senegal", { reader, env: ENV, now: () => 0 }), { offered: false });
  forgetKeptPayInCoverage();
  assert.deepEqual(await payInOfferIn("KE", { reader: reading({ operators: async () => [] }).reader, env: ENV, now: () => 0 }), { offered: false });
  forgetKeptPayInCoverage();
  const silent = reading({ coverage: async () => Promise.reject(new Error("no answer")) }).reader;
  assert.deepEqual(await payInOfferIn("SN", { reader: silent, env: ENV, now: () => 0 }), { offered: false });
});

test("Switch is asked once for ten minutes, and again after", async () => {
  forgetKeptPayInCoverage();
  const { reader, asked } = reading();
  await payInOfferIn("SN", { reader, env: ENV, now: () => 0 });
  await payInOfferIn("SN", { reader, env: ENV, now: () => 9 * 60_000 });
  await payInOfferIn("CI", { reader, env: ENV, now: () => 9 * 60_000 });
  assert.deepEqual(asked, { coverage: 1, rates: 1, operators: ["SN", "CI"] });
  await payInOfferIn("SN", { reader, env: ENV, now: () => 11 * 60_000 });
  assert.deepEqual(asked, { coverage: 2, rates: 2, operators: ["SN", "CI", "SN"] });
});

test("the countries of the way in are those with a rate, none while it is closed, and a silence is an error and not an empty list", async () => {
  forgetKeptPayInCoverage();
  const { reader } = reading();
  assert.deepEqual(await payInCountries({ reader, env: ENV, now: () => 0 }), ["ci", "sn", "ke"]);
  assert.equal(await payInCountries({ reader, env: { ...ENV, MOBILE_MONEY_IN: "off" }, now: () => 0 }), null);
  forgetKeptPayInCoverage();
  await assert.rejects(payInCountries({ reader: reading({ rates: async () => Promise.reject(new Error("no answer")) }).reader, env: ENV, now: () => 0 }));
});
