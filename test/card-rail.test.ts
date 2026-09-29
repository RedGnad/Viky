import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after, before } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { privateKeyToAccount } from "viem/accounts";
import { GET as whereGet } from "../app/api/rails/where/route";
import { ACCOUNT_AUTH_COOKIE_NAME, createAccountAuthChallenge, issueAccountAuthSession } from "../src/account-auth-server";
import { wayInFor } from "../src/gift-amount";
import { cardOffered, cardReach, payerCountry } from "../src/card-rail";
import { configurePreferencesStore, saveCountry } from "../src/preferences-store";
import type { SqlExecutor } from "../src/proof-session-store";
import { MERCURYO_CLOSED_IN, RAMP_CLOSED_IN, WAY_IN_CHAIN_COIN, WAY_IN_GIFT_COIN, WAYS_IN } from "../src/rails";
import { PAY } from "../src/sentences";

/**
 * Paying by card, on its partners' own terms (the founder, 29 Sep 2026): each partner follows its own published list of
 * countries, for the payer's country (the account's, else the connection's); the first that serves it is offered, and
 * none means no card. A line under every card payment names the partner and links its terms. Nobody is kept out of Viky.
 */

const ORIGIN = "https://viky.test";
const ENV = { SESSION_SIGNING_SECRET: "test-account-session-secret-that-is-longer-than-32-bytes" };
const PAYER = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
process.env.SESSION_SIGNING_SECRET = ENV.SESSION_SIGNING_SECRET;

let db: PGlite;
before(async () => {
  db = new PGlite();
  await db.query("CREATE TABLE viky_accounts (account text PRIMARY KEY, display_currency text, appearance text, updated_at timestamptz DEFAULT now())");
  const executor: SqlExecutor = async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    return (await db.query<Record<string, unknown>>(text, values)).rows;
  };
  configurePreferencesStore(executor);
});
after(async () => {
  configurePreferencesStore(undefined);
  await db.close();
});

async function cookieFor(account: typeof PAYER): Promise<string> {
  const challenge = createAccountAuthChallenge({ account: account.address, origin: ORIGIN, nonce: "0123456789abcdef0123456789abcdef", environment: ENV });
  const signature = await account.signMessage({ message: challenge.message });
  const session = await issueAccountAuthSession({ challenge: challenge.challenge, signature, origin: ORIGIN, environment: ENV });
  return `${ACCOUNT_AUTH_COOKIE_NAME}=${session.token}`;
}

type Answer = { waysIn: Record<string, string>; card: { offered: boolean; country: string | null } };

async function answerFor(headers: Record<string, string>): Promise<Answer> {
  const realFetch = globalThis.fetch;
  // The partners' live answers are not what is measured here: their published lists are.
  globalThis.fetch = (async () => new Response("{}", { status: 404 })) as typeof fetch;
  try {
    return (await (await whereGet(new Request(`${ORIGIN}/api/rails/where`, { headers: { origin: ORIGIN, host: "viky.test", ...headers } }))).json()) as Answer;
  } finally {
    globalThis.fetch = realFetch;
  }
}

test("each partner follows its own list: Ramp's shuts Senegal and Ivory Coast, Mercuryo's keeps them open", () => {
  assert.equal(RAMP_CLOSED_IN.length, 132, "Ramp's page, read 29 Sep 2026");
  for (const country of ["sn", "ci", "cm", "ma", "ng", "ke", "jp", "ua"]) assert.ok(RAMP_CLOSED_IN.includes(country), `Ramp: ${country}`);
  for (const country of ["sn", "ci", "cm", "ng", "ke", "jp", "ua", "fr"]) assert.ok(!MERCURYO_CLOSED_IN.includes(country), `Mercuryo: ${country}`);
  assert.equal(WAY_IN_GIFT_COIN.closedIn, RAMP_CLOSED_IN, "never the other partner's list");
  assert.ok(WAY_IN_CHAIN_COIN.closedIn.includes("gb"), "Mercuryo does not sell the chain's coin in the United Kingdom (D72)");
  // The four countries under a US embargo need no rule of their own: both lists name them.
  for (const country of ["cu", "ir", "kp", "sy"]) for (const way of WAYS_IN) assert.ok(way.closedIn.includes(country), `${way.name}: ${country}`);
  for (const code of [...RAMP_CLOSED_IN, ...MERCURYO_CLOSED_IN]) assert.match(code, /^[a-z]{2}$/);
});

test("the first partner that serves the payer's country is offered, and none means no card", () => {
  const offer = (country: string) => wayInFor(30_000_000n, WAYS_IN, 1.15, cardReach(country)).way.name;
  assert.equal(offer("fr"), "Ramp");
  assert.equal(offer("sn"), "Mercuryo", "Dakar goes to the partner that serves Senegal");
  assert.equal(offer("ci"), "Mercuryo");
  assert.equal(cardOffered(cardReach("fr")), true);
  assert.equal(cardOffered(cardReach("sn")), true);
  assert.equal(cardOffered(cardReach("ir")), false, "neither serves Iran");
  assert.equal(cardOffered(cardReach(null)), true, "no country known: the card is offered and the partner checks");
  assert.equal(cardReach("fr", { Ramp: "paused" }).Ramp, "paused", "a live pause still counts where the list is silent");
  assert.equal(payerCountry({ account: "fr", connection: "IR" }), "fr", "the account's own country first");
  assert.equal(payerCountry({ account: null, connection: "SN" }), "sn", "then the connection's");
});

test("the route answers for the account's country when it has one, and for the connection's otherwise", async () => {
  const france = await answerFor({ "x-vercel-ip-country": "FR" });
  assert.deepEqual(france.card, { offered: true, country: "fr" });
  assert.equal(france.waysIn.Ramp, "unknown", "France is on neither list; the live answer decides");
  const dakar = await answerFor({ "x-vercel-ip-country": "SN" });
  assert.deepEqual([dakar.waysIn.Ramp, dakar.waysIn.Mercuryo, dakar.card.offered], ["does-not", "unknown", true]);
  assert.deepEqual((await answerFor({ "x-vercel-ip-country": "IR" })).card, { offered: false, country: "ir" });
  const cookie = await cookieFor(PAYER);
  assert.deepEqual((await answerFor({ cookie, "x-vercel-ip-country": "SY" })).card, { offered: false, country: "sy" }, "an account with no country: the connection");
  await saveCountry(PAYER.address, "fr");
  assert.deepEqual((await answerFor({ cookie, "x-vercel-ip-country": "SY" })).card, { offered: true, country: "fr" }, "the account's country outranks the connection");
});

test("every card partner links its own terms on its official site, and the sentences are the founder's", () => {
  const terms = Object.fromEntries(WAYS_IN.map((way) => [way.name, way.terms]));
  assert.deepEqual(terms, { Ramp: "https://rampnetwork.com/terms-of-service", Mercuryo: "https://mercuryo.io/legal/terms/" });
  assert.equal(`${PAY.cardTerms.before}${PAY.cardTerms.link("Ramp")}${PAY.cardTerms.after}`, "By paying by card, you confirm you are 18 or older and accept Ramp's terms.");
  assert.equal(PAY.cardNotOffered("Iran"), "Card payment isn't available in Iran. You can pay with money already in your Viky account, and anyone who uses Viky can send money to yours.");
});

test("each button or link that pays by card carries the line, and gives way to the sentence where no card serves", () => {
  const sheet = readFileSync("app/kit/offer/PaySheet.tsx", "utf8");
  assert.match(sheet, /\{byCard \? <CardTermsLine way=\{way\} \/> : null\}/);
  assert.match(sheet, /\{!enough && cardClosed \? \(\s*<CardNotOffered country=\{card\?\.country \?\? null\} \/>/);
  const wait = readFileSync("app/components/PayGift.tsx", "utf8");
  // The two places the waiting screen opens the partner: paying the rest, and the partner's page itself.
  assert.equal((wait.match(/<CardTermsLine way=\{wayIn\} \/>/g) ?? []).length, 2);
  assert.equal((wait.match(/<CardNotOffered country=\{card\?\.country \?\? null\} \/>/g) ?? []).length, 2);
  assert.equal((wait.match(/window\.open\(wayInPage|href=\{wayInPage/g) ?? []).length, 2, "and no other way to the partner");
});
