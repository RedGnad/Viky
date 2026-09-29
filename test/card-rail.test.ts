import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after, before } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { privateKeyToAccount } from "viem/accounts";
import { GET as whereGet } from "../app/api/rails/where/route";
import { ACCOUNT_AUTH_COOKIE_NAME, createAccountAuthChallenge, issueAccountAuthSession } from "../src/account-auth-server";
import { CARD_CLOSED_BY_EMBARGO, cardOffered, payerCountry } from "../src/card-rail";
import { configurePreferencesStore, saveCountry } from "../src/preferences-store";
import type { SqlExecutor } from "../src/proof-session-store";
import { WAYS_IN } from "../src/rails";
import { PAY } from "../src/sentences";

/**
 * Paying by card, as its providers' terms allow it (the founder, 29 Sep 2026): a line under every card payment naming
 * the partner and linking its terms, and no card for a payer in a country under a US embargo. Nobody is kept out of
 * Viky: only the card follows its providers.
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

async function cardFor(headers: Record<string, string>): Promise<{ offered: boolean; country: string | null }> {
  const realFetch = globalThis.fetch;
  // The rails' own availability answers are not what is measured here.
  globalThis.fetch = (async () => new Response("{}", { status: 404 })) as typeof fetch;
  try {
    const answer = (await (await whereGet(new Request(`${ORIGIN}/api/rails/where`, { headers: { origin: ORIGIN, host: "viky.test", ...headers } }))).json()) as { card: { offered: boolean; country: string | null } };
    return answer.card;
  } finally {
    globalThis.fetch = realFetch;
  }
}

test("the card is not offered in Cuba, Iran, North Korea or Syria, and is everywhere else, and when nothing is known", () => {
  assert.deepEqual([...CARD_CLOSED_BY_EMBARGO].sort(), ["cu", "ir", "kp", "sy"]);
  for (const country of CARD_CLOSED_BY_EMBARGO) assert.equal(cardOffered(country), false, country);
  for (const country of ["fr", "sn", "ci", "us", null]) assert.equal(cardOffered(country), true, String(country));
  assert.equal(payerCountry({ account: "fr", connection: "IR" }), "fr", "the account's own country first");
  assert.equal(payerCountry({ account: null, connection: "IR" }), "ir", "then the connection's");
  assert.equal(payerCountry({ account: undefined, connection: undefined }), null);
});

test("the route decides from the account's country when it has one, and from the connection's otherwise", async () => {
  assert.deepEqual(await cardFor({ "x-vercel-ip-country": "FR" }), { offered: true, country: "fr" });
  assert.deepEqual(await cardFor({ "x-vercel-ip-country": "IR" }), { offered: false, country: "ir" });
  const cookie = await cookieFor(PAYER);
  assert.deepEqual(await cardFor({ cookie, "x-vercel-ip-country": "SY" }), { offered: false, country: "sy" }, "an account with no country: the connection");
  await saveCountry(PAYER.address, "fr");
  assert.deepEqual(await cardFor({ cookie, "x-vercel-ip-country": "SY" }), { offered: true, country: "fr" }, "the account's country outranks the connection");
  await saveCountry(PAYER.address, "cu");
  assert.deepEqual(await cardFor({ cookie, "x-vercel-ip-country": "FR" }), { offered: false, country: "cu" });
});

test("every card partner links its own terms on its official site, and the line names the partner", () => {
  const terms = Object.fromEntries(WAYS_IN.map((way) => [way.name, way.terms]));
  assert.deepEqual(terms, { Ramp: "https://rampnetwork.com/terms-of-service", Mercuryo: "https://mercuryo.io/legal/terms/" });
  assert.equal(`${PAY.cardTerms.before}${PAY.cardTerms.link("Ramp")}${PAY.cardTerms.after}`, "By paying by card, you confirm you are 18 or older and accept Ramp's terms.");
  assert.equal(PAY.cardNotOffered("Iran"), "Paying by card is not offered in Iran. You can still pay from your account: money sent to your code arrives there.");
});

test("each button or link that pays by card carries the line, and gives way to the sentence where the card is not offered", () => {
  const sheet = readFileSync("app/kit/offer/PaySheet.tsx", "utf8");
  assert.match(sheet, /\{byCard \? <CardTermsLine way=\{way\} \/> : null\}/);
  assert.match(sheet, /\{!enough && cardClosed \? \(\s*<CardNotOffered country=\{card\?\.country \?\? null\} \/>/);
  const wait = readFileSync("app/components/PayGift.tsx", "utf8");
  // The two places the waiting screen opens the partner: paying the rest, and the partner's page itself.
  assert.equal((wait.match(/<CardTermsLine way=\{wayIn\} \/>/g) ?? []).length, 2);
  assert.equal((wait.match(/<CardNotOffered country=\{card\?\.country \?\? null\} \/>/g) ?? []).length, 2);
  assert.equal((wait.match(/window\.open\(wayInPage|href=\{wayInPage/g) ?? []).length, 2, "and no other way to the partner");
});
