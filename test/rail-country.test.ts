import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { GET as whereGet } from "../app/api/rails/where/route";
import { cardRailRestricted, euroRailBuyCountries, euroRailCountries, euroRailSellsGiftCoin, reachOfWaysIn, reachOfWaysOut } from "../src/rail-availability";
import { countryCode, countryInWords, guessCountry, orderRails, orderWaysOut, regionOfLocale } from "../src/rail-country";
import { WAY_OUT_CARD, WAY_OUT_EURO, WAYS_IN, WAYS_OUT } from "../src/rails";

/**
 * Routing the rails by country (R1): detect to **order**, never to hide.
 *
 * The two signals are the country the platform reads from the connection and the region of the device's language.
 * Neither is asked of the person, both are often wrong (a trip, a shared connection, a private network), and the rail's
 * own identity check is what actually decides. So the worst this may do is put the wrong card first.
 */

const ORIGIN = "https://viky.test";

function ask(headers: Record<string, string>, query = ""): Request {
  return new Request(`${ORIGIN}/api/rails/where${query}`, { headers });
}

test("the device's region is read from its language, and nothing is invented when there is none", () => {
  assert.equal(regionOfLocale("fr-SN"), "sn");
  assert.equal(regionOfLocale("en-GB"), "gb");
  assert.equal(regionOfLocale("fr"), null, "a language without a region says nothing about a country");
  assert.equal(regionOfLocale(""), null);
  assert.equal(regionOfLocale("not a locale at all"), null);
  assert.equal(countryCode("FR"), "fr");
  assert.equal(countryCode("france"), null);
  // The words come from the runtime, so no list of countries is written in the repository.
  assert.equal(countryInWords("sn"), "Senegal");
  assert.equal(countryInWords("fr"), "France");
  assert.equal(countryInWords(null), null);
});

test("two signals that agree ask nothing, two that differ ask once, and the answer wins", () => {
  assert.deepEqual(guessCountry({ fromConnection: "fr", fromDevice: "fr" }), { country: "fr", ask: false, fromConnection: "fr", fromDevice: "fr" });
  assert.deepEqual(guessCountry({ fromConnection: "fr", fromDevice: null }), { country: "fr", ask: false, fromConnection: "fr", fromDevice: null });
  assert.deepEqual(guessCountry({ fromConnection: null, fromDevice: "sn" }), { country: "sn", ask: false, fromConnection: null, fromDevice: "sn" });
  // A private network in one country and a device set to another: one question, and nothing ordered meanwhile.
  const split = guessCountry({ fromConnection: "de", fromDevice: "sn" });
  assert.equal(split.ask, true);
  assert.equal(split.country, null);
  assert.deepEqual(guessCountry({ fromConnection: "de", fromDevice: "sn", answered: "sn" }), { country: "sn", ask: false, fromConnection: "de", fromDevice: "sn" });
  assert.deepEqual(guessCountry({}), { country: null, ask: false, fromConnection: null, fromDevice: null });
});

test("only a rail that says it does not serve moves, and none is ever removed", () => {
  const serves = orderWaysOut(WAYS_OUT, { [WAY_OUT_CARD.name]: "serves", [WAY_OUT_EURO.name]: "does-not" });
  assert.deepEqual(serves.map((way) => way.name), [WAY_OUT_CARD.name, WAY_OUT_EURO.name]);
  assert.equal(serves.length, WAYS_OUT.length, "both are still there");
  const unread = orderWaysOut(WAYS_OUT, { [WAY_OUT_EURO.name]: "unknown", [WAY_OUT_CARD.name]: "does-not" });
  assert.deepEqual(unread.map((way) => way.name), [WAY_OUT_EURO.name, WAY_OUT_CARD.name], "a refusal goes last, and is still shown");
  assert.deepEqual(orderWaysOut(WAYS_OUT, {}).map((way) => way.name), WAYS_OUT.map((way) => way.name), "no answer, the register's order");
  // A silence is not a refusal: the rail that publishes no per-country answer keeps the place the register gave it,
  // rather than falling behind one that answered, for ever and everywhere (D101).
  const bothFine = orderRails(WAYS_IN, { [WAYS_IN[1].name]: "serves", [WAYS_IN[0].name]: "unknown" });
  assert.deepEqual(bothFine.map((way) => way.name), WAYS_IN.map((way) => way.name));
  const oneRefuses = orderRails(WAYS_IN, { [WAYS_IN[0].name]: "unknown", [WAYS_IN[1].name]: "does-not" });
  assert.deepEqual(oneRefuses.map((way) => way.name), WAYS_IN.map((way) => way.name), "it was already first, and the other is still there");
});

test("what each rail serves is read from that rail, and a read that fails never says no", async () => {
  const realFetch = globalThis.fetch;
  // The shapes measured on 18 Sep 2026 at the two public endpoints named in src/rail-availability.ts.
  const payoutMethods = [
    { name: "SEPA", currencies: ["EUR"], countries: ["fr", "de", "es"] },
    { name: "CARD", currencies: ["EUR"], countries: ["fr", "gb"] },
  ];
  const currencies = { data: { config: { crypto_currencies: [{ currency: "MON", network: "MONAD", restricted_countries_offramp: ["gb"], restricted_countries_onramp: ["gb"] }] } } };
  // The shapes read on 25 Sep 2026 at the euro rail's countries and assets endpoints (D239).
  const countries = [
    { code: "fr", name: "France", cardPaymentsEnabled: true, mainCurrencyCode: "EUR" },
    { code: "gb", name: "United Kingdom", cardPaymentsEnabled: true, mainCurrencyCode: "GBP" },
    { code: "de", name: "Germany", cardPaymentsEnabled: true, mainCurrencyCode: "EUR" },
  ];
  let assets = { assets: [{ symbol: "AUSD", chain: "MONAD", enabled: true, hidden: false }, { symbol: "MON", chain: "MONAD", enabled: true, hidden: false }] };
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("host-api/countries")) return new Response(JSON.stringify(countries), { status: 200 });
    if (url.includes("v3/assets")) return new Response(JSON.stringify(assets), { status: 200 });
    if (url.includes("ramp.network")) return new Response(JSON.stringify(payoutMethods), { status: 200 });
    if (url.includes("mercuryo.io")) return new Response(JSON.stringify(currencies), { status: 200 });
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  try {
    // Read with a moment that empties what an earlier test held, so each case really asks.
    assert.deepEqual([...(await euroRailCountries(Date.now() + 3_600_000) ?? [])].sort(), ["de", "es", "fr", "gb"]);
    assert.deepEqual(await cardRailRestricted(Date.now() + 3_600_000), ["gb"]);
    assert.deepEqual([...(await euroRailBuyCountries(Date.now() + 3_600_000) ?? [])].sort(), ["de", "fr", "gb"]);
    assert.equal(await euroRailSellsGiftCoin(Date.now() + 3_600_000), true);
    const inFrance = await reachOfWaysOut("fr");
    assert.equal(inFrance[WAY_OUT_EURO.name], "serves");
    assert.equal(inFrance[WAY_OUT_CARD.name], "serves", "the card rail's own list restricts nothing in France; what it says of the EEA is on its card");
    const inSenegal = await reachOfWaysOut("sn");
    assert.equal(inSenegal[WAY_OUT_EURO.name], "does-not", "not in any of its payout methods");
    assert.equal(inSenegal[WAY_OUT_CARD.name], "serves");
    const inBritain = await reachOfWaysOut("gb");
    assert.equal(inBritain[WAY_OUT_CARD.name], "does-not");
    // Each way in is asked of its own rail (D239): the euro rail's countries list and its asset list, the chain rail's
    // restrictions per coin and country.
    assert.deepEqual(await reachOfWaysIn("gb"), { Ramp: "serves", Mercuryo: "does-not" });
    assert.deepEqual(await reachOfWaysIn("fr"), { Ramp: "serves", Mercuryo: "serves" });
    assert.deepEqual(await reachOfWaysIn("sn"), { Ramp: "does-not", Mercuryo: "serves" }, "not on the euro rail's own list");
    assert.deepEqual(await reachOfWaysIn(null), { Ramp: "unknown", Mercuryo: "unknown" }, "no country, no answer about one");
    // The euro rail switches the coin off in its own asset list: a pause, wherever the person is, said as its own.
    assets = { assets: [{ symbol: "AUSD", chain: "MONAD", enabled: false, hidden: false }] };
    assert.equal(await euroRailSellsGiftCoin(Date.now() + 7_200_000), false);
    assert.deepEqual(await reachOfWaysIn("fr"), { Ramp: "paused", Mercuryo: "serves" });
    assert.deepEqual(await reachOfWaysIn(null), { Ramp: "paused", Mercuryo: "unknown" });
    assert.deepEqual(await reachOfWaysIn("sn"), { Ramp: "does-not", Mercuryo: "serves" }, "a country that is not served is said first");
    assets = { assets: [{ symbol: "AUSD", chain: "MONAD", enabled: true, hidden: false }] };
    assert.equal(await euroRailSellsGiftCoin(Date.now() + 10_800_000), true);
    assert.deepEqual(await reachOfWaysOut(null), { [WAY_OUT_EURO.name]: "unknown", [WAY_OUT_CARD.name]: "unknown" });
  } finally {
    globalThis.fetch = realFetch;
  }

});

test("the route reads the country of the connection, takes the device's language, and answers both rails", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("host-api/countries")) return new Response(JSON.stringify([{ code: "fr", cardPaymentsEnabled: true }]), { status: 200 });
    if (url.includes("v3/assets")) return new Response(JSON.stringify({ assets: [{ symbol: "AUSD", chain: "MONAD", enabled: true, hidden: false }] }), { status: 200 });
    if (url.includes("ramp.network")) return new Response(JSON.stringify([{ name: "SEPA", countries: ["fr"] }]), { status: 200 });
    if (url.includes("mercuryo.io")) {
      return new Response(JSON.stringify({ data: { config: { crypto_currencies: [{ currency: "MON", network: "MONAD", restricted_countries_offramp: ["gb"], restricted_countries_onramp: ["gb"] }] } } }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  try {
    const agreed = (await (await whereGet(ask({ "x-vercel-ip-country": "FR" }, "?locale=fr-FR"))).json()) as Record<string, unknown>;
    assert.equal(agreed.country, "fr");
    assert.equal(agreed.ask, false);
    assert.deepEqual(agreed.waysOut, { [WAY_OUT_EURO.name]: "serves", [WAY_OUT_CARD.name]: "serves" });
    assert.deepEqual(agreed.waysIn, { Ramp: "serves", Mercuryo: "serves" });

    const split = (await (await whereGet(ask({ "x-vercel-ip-country": "DE" }, "?locale=fr-SN"))).json()) as Record<string, unknown>;
    assert.equal(split.ask, true, "a connection in one country and a device set to another asks once");
    assert.equal(split.country, null);
    assert.deepEqual([split.fromConnection, split.fromDevice], ["de", "sn"]);

    const answered = (await (await whereGet(ask({ "x-vercel-ip-country": "DE" }, "?locale=fr-SN&answered=sn"))).json()) as Record<string, unknown>;
    assert.equal(answered.country, "sn");
    assert.equal(answered.ask, false);
    assert.deepEqual(answered.waysOut, { [WAY_OUT_EURO.name]: "does-not", [WAY_OUT_CARD.name]: "serves" });
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("the screen orders and asks, and never hides a way out (R1)", () => {
  const screen = readFileSync("app/components/CashOut.tsx", "utf8");
  // Both ways are always mapped; only their order changes, and the country's answer is used only once it exists.
  assert.match(screen, /const ordered = orderByWhatReaches\(WAYS_OUT, where && !where\.ask \? where\.waysOut : \{\}, \(way\) => netOf\(way\)\?\.net\);/);
  assert.match(screen, /\{ordered\.map\(\(way, index\) => \{/);
  assert.doesNotMatch(screen, /WAYS_OUT\.filter|ordered\.filter/, "nothing filters a way out off the screen");
  // The one question, with the two signals as its two answers.
  assert.match(screen, /\{W\.whereIsYours\}/);
  assert.match(screen, /\[where\.fromDevice, where\.fromConnection\]/);
  // What a rail says about that country is said in the rail's own name, and only when it was really read.
  assert.match(screen, /where\?\.waysOut\[way\.name\] === "does-not"/);
});

test("a rail that cannot be reached says nothing, and what it said before is not kept for long", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("", { status: 503 })) as typeof fetch;
  try {
    const now = Date.now() + 9_000_000;
    assert.equal(await euroRailCountries(now), null);
    assert.equal(await cardRailRestricted(now), null);
    assert.equal(await euroRailBuyCountries(now), null);
    assert.equal(await euroRailSellsGiftCoin(now), null);
    const unreadable = await reachOfWaysOut("fr");
    assert.equal(unreadable[WAY_OUT_EURO.name], "unknown");
    assert.equal(unreadable[WAY_OUT_CARD.name], "unknown");
    assert.deepEqual(await reachOfWaysIn("fr"), { Ramp: "unknown", Mercuryo: "unknown" });
    // An answer is held for ten minutes, a failure for thirty seconds: one bad minute at a service must not leave
    // every screen guessing for ten.
    const source = readFileSync("src/rail-availability.ts", "utf8");
    assert.match(source, /const HELD_FOR_MS = 10 \* 60 \* 1_000;/);
    assert.match(source, /const FAILURE_HELD_FOR_MS = 30 \* 1_000;/);
    assert.match(source, /now - held\.at < \(held\.value === null \? FAILURE_HELD_FOR_MS : HELD_FOR_MS\)/);
  } finally {
    globalThis.fetch = realFetch;
  }
});
