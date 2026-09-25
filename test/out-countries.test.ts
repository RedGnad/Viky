import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { countryOfNumber } from "../src/client/account-country";
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
