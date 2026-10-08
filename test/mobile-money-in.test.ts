// The mobile money way in (the founder, 8 Oct 2026): where it is offered, read from Switch and kept a few minutes.
// The stand-in answers what Switch answered live on 8 Oct 2026, where it says so. No collection is opened by anything
// tested here.

import assert from "node:assert/strict";
import test from "node:test";
import { mobileMoneyInOn } from "../src/mobile-money-in";
import { forgetKeptPayInCoverage, payInOfferIn, type PayInReader } from "../src/mobile-money-in-server";

const ENV = { SWITCH_SERVICE_KEY: "test-key-not-a-real-one" };
const LIMITS = { minimumUnits: 10_000_000n, maximumUnits: 100_000_000_000n, settlement: "5-10 minutes" };
/** The fields of the one corridor Switch publishes on-ramp requirements for, a bank transfer in Nigeria. */
const SOME_FIELDS = ["holder_type", "holder_name", "channel", "wallet_address"];

function reading(over: Partial<PayInReader> = {}) {
  const asked = { coverage: 0, rates: 0, operators: [] as string[], fields: [] as string[] };
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
    // The day Switch publishes requirements for a country. On 8 Oct 2026 it published none: see the next test.
    fields: async (country) => {
      asked.fields.push(country);
      return SOME_FIELDS;
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

test("as Switch answered on 8 Oct 2026, the way in is offered nowhere: covered and priced, with no requirements", async () => {
  // Its coverage listed these countries, its quotes priced them, and it published on-ramp requirements for none of
  // them; an opening in its sandbox was refused in each one tried. Covered is not openable.
  forgetKeptPayInCoverage();
  const { reader, asked } = reading({ fields: async () => null });
  for (const country of ["CI", "SN", "KE"]) assert.deepEqual(await payInOfferIn(country, { reader, env: ENV, now: () => 0 }), { offered: false }, country);
  // Nothing more is asked of a country no collection can be opened in.
  assert.deepEqual(asked.operators, []);
});

test("the day Switch publishes requirements for a country, it is offered with its operators, its limits and its published time", async () => {
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
  // One country with requirements does not open another without.
  forgetKeptPayInCoverage();
  const onlyKenya = reading({ fields: async (country) => (country === "KE" ? SOME_FIELDS : null) }).reader;
  assert.equal((await payInOfferIn("KE", { reader: onlyKenya, env: ENV, now: () => 0 })).offered, true);
  assert.deepEqual(await payInOfferIn("SN", { reader: onlyKenya, env: ENV, now: () => 0 }), { offered: false });
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
  // The requirements not answering is not "none published", and is not an offer either.
  forgetKeptPayInCoverage();
  const unread = reading({ fields: async () => Promise.reject(new Error("no answer")) }).reader;
  assert.deepEqual(await payInOfferIn("SN", { reader: unread, env: ENV, now: () => 0 }), { offered: false });
});

test("Switch is asked once for ten minutes, and again after", async () => {
  forgetKeptPayInCoverage();
  const { reader, asked } = reading();
  await payInOfferIn("SN", { reader, env: ENV, now: () => 0 });
  await payInOfferIn("SN", { reader, env: ENV, now: () => 9 * 60_000 });
  await payInOfferIn("CI", { reader, env: ENV, now: () => 9 * 60_000 });
  assert.deepEqual(asked, { coverage: 1, rates: 1, operators: ["SN", "CI"], fields: ["SN", "CI"] });
  await payInOfferIn("SN", { reader, env: ENV, now: () => 11 * 60_000 });
  assert.deepEqual(asked, { coverage: 2, rates: 2, operators: ["SN", "CI", "SN"], fields: ["SN", "CI", "SN"] });
  // "None published" is kept as long: a country is not asked about at every look.
  forgetKeptPayInCoverage();
  const none = reading({ fields: async (country) => (none.asked.fields.push(country), null) });
  await payInOfferIn("SN", { reader: none.reader, env: ENV, now: () => 0 });
  await payInOfferIn("SN", { reader: none.reader, env: ENV, now: () => 60_000 });
  assert.deepEqual(none.asked.fields, ["SN"]);
});
