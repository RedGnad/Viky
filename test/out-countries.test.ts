import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { countryOfNumber } from "../src/client/account-country";
import { forgetKeptCoverage } from "../src/mobile-money-server";
import { outCountries } from "../src/out-countries";
import { isCountry } from "../src/preferences-store";

/**
 * Where the person lives (D274, the founder's decision of 27 Sep 2026): a fact of the account, picked from every country
 * where at least one way out works. A number may propose a country, never replace one.
 */

function answers(body: Record<string, unknown>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    const key = Object.keys(body).find((part) => url.includes(part));
    return key === undefined ? new Response("", { status: 404 }) : new Response(JSON.stringify(body[key]), { status: 200 });
  }) as typeof fetch;
}

test("the list is the union of the ways out, less where the card is closed or refused", async () => {
  const realFetch = globalThis.fetch;
  const realEnv = { ...process.env };
  for (const name of Object.keys(process.env)) if (name.startsWith("BITREFILL")) delete process.env[name];
  globalThis.fetch = answers({
    "payout-methods": [{ countries: ["FR", "DE"] }],
    "lib/countries": { data: [{ code: "sn", phone_prefix: "221" }, { code: "de", phone_prefix: "49" }, { code: "ng", phone_prefix: "234" }, { code: "us", phone_prefix: "1" }] },
    "lib/currencies": { data: { config: { crypto_currencies: [{ currency: "MON", network: "MONAD", restricted_countries_offramp: ["NG"] }] } } },
  });
  try {
    const now = Date.now() + 50_000_000;
    const read = await outCountries(now);
    // Ramp pays fr and de; Mercuryo adds sn, refuses ng, and pays no card in the United States (D72).
    assert.deepEqual(read.countries, ["de", "fr", "sn"]);
    assert.equal(read.prefixes.sn, "221");
    assert.deepEqual(read.unread, []);
  } finally {
    globalThis.fetch = realFetch;
    process.env = realEnv;
  }
});

test("without Mercuryo's restrictions, none of its countries is offered, and it is said unread", async () => {
  const realFetch = globalThis.fetch;
  const realEnv = { ...process.env };
  for (const name of Object.keys(process.env)) if (name.startsWith("BITREFILL")) delete process.env[name];
  globalThis.fetch = answers({ "payout-methods": [{ countries: ["FR"] }], "lib/countries": { data: [{ code: "sn", phone_prefix: "221" }] } });
  try {
    const read = await outCountries(Date.now() + 250_000_000);
    assert.deepEqual(read.countries, ["fr"]);
    assert.deepEqual(read.unread, ["Mercuryo"]);
  } finally {
    globalThis.fetch = realFetch;
    process.env = realEnv;
  }
});

test("a country mobile money alone serves can be picked, when that way is open, and not while it is off", async () => {
  // The advisor, 4 Oct 2026: the list united Ramp, Mercuryo and Bitrefill, and not the countries Switch pays.
  const realFetch = globalThis.fetch;
  const realEnv = { ...process.env };
  for (const name of Object.keys(process.env)) if (name.startsWith("BITREFILL")) delete process.env[name];
  const corridor = (country: string, currency: string) => ({ country, currency: [currency], channel: ["MOBILEMONEY"], direction: ["OFFRAMP"], payout_limit: { MOBILEMONEY: { min: "$1", max: "$200" } }, settlement_time: { MOBILEMONEY: "5-10 minutes" } });
  globalThis.fetch = answers({
    "payout-methods": [{ countries: ["FR"] }],
    "lib/countries": { data: [{ code: "fr", phone_prefix: "33" }] },
    "lib/currencies": { data: { config: { crypto_currencies: [{ currency: "MON", network: "MONAD", restricted_countries_offramp: [] }] } } },
    // Switch: Ghana and Kenya have a corridor; Kenya's currency has no rate, so the way is not offered there.
    "coverage?direction=OFFRAMP": { success: true, data: [corridor("GH", "GHS"), corridor("KE", "KES"), { ...corridor("NG", "NGN"), channel: ["BANK"] }] },
    "rates?direction=OFFRAMP": { success: true, data: [{ currency: "GHS", rate: 15.2 }] },
  });
  try {
    forgetKeptCoverage();
    delete process.env.MOBILE_MONEY_OUT;
    const off = await outCountries(Date.now() + 450_000_000);
    assert.deepEqual(off.countries, ["fr"], "switched off: no country of its own, and nothing said unread");
    assert.deepEqual(off.unread, []);
    process.env.MOBILE_MONEY_OUT = "on";
    process.env.SWITCH_SERVICE_KEY = "a-test-key";
    const on = await outCountries(Date.now() + 650_000_000);
    assert.deepEqual(on.countries, ["fr", "gh"], "Ghana, which mobile money alone serves, can be picked; Kenya, with no rate, cannot");
    assert.deepEqual(on.unread, []);
    // Switch not answering: nothing of its own is added, and it is said unread.
    forgetKeptCoverage();
    globalThis.fetch = answers({ "payout-methods": [{ countries: ["FR"] }], "lib/countries": { data: [{ code: "fr", phone_prefix: "33" }] }, "lib/currencies": { data: { config: { crypto_currencies: [{ currency: "MON", network: "MONAD", restricted_countries_offramp: [] }] } } } });
    const silent = await outCountries(Date.now() + 850_000_000);
    assert.deepEqual(silent.countries, ["fr"]);
    assert.deepEqual(silent.unread, ["Switch"]);
  } finally {
    forgetKeptCoverage();
    globalThis.fetch = realFetch;
    process.env = realEnv;
  }
});

test("a number proposes the country of its longest matching prefix, and nothing when none matches", () => {
  const prefixes = { us: "1", ag: "1268", sn: "221" };
  assert.equal(countryOfNumber("+1 268 555 0101", prefixes), "ag");
  assert.equal(countryOfNumber("+221 77 123 45 67", prefixes), "sn");
  assert.equal(countryOfNumber("77 123 45 67", prefixes), null);
});

test("the account keeps a country as two letters, and refuses anything else", () => {
  assert.equal(isCountry("sn"), true);
  assert.equal(isCountry("SN"), false);
  assert.equal(isCountry("sen"), false);
  const route = readFileSync("app/api/account/preferences/route.ts", "utf8");
  assert.match(route, /UNKNOWN_COUNTRY/);
});

test("Me asks where the person lives, and the way out and the card read the account, never a number", () => {
  const me = readFileSync("app/kit/Me.tsx", "utf8");
  assert.match(me, /<WhereYouLive/);
  const card = readFileSync("app/components/CashOut.tsx", "utf8");
  assert.doesNotMatch(card, /countryOfNumber|lastNumber/);
  const phone = readFileSync("app/components/PhoneTopUp.tsx", "utf8");
  assert.match(phone, /rememberNumber\(phone\)/);
  assert.doesNotMatch(phone, /countryOfNumber|saveCountry/);
});
