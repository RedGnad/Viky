import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { SqlExecutor } from "../src/proof-session-store";
import { configureSendStore, ensureSendsSchema, loadSends, recordSend, sendReference } from "../src/send-store";
import { configurePreferencesStore, ensurePreferencesSchema, loadPreferences, saveAppearance, saveCountry, saveDisplayCurrency } from "../src/preferences-store";

let db: PGlite;

function pgliteExecutor(database: PGlite): SqlExecutor {
  return async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    const result = await database.query<Record<string, unknown>>(text, values);
    return result.rows;
  };
}

const ACCOUNT = "0x00000000000000000000000000000000000A11cE" as const;
const RAMP = "0x000000000000000000000000000000000000dEaD" as const;
const USDC = "0x754704Bc059F8C67012fEd69BC8A327a5aafb603" as const;
/** The first real conversion's hash (D82), whose first eight characters make the reference a person reads. */
const HASH = "0x7599b203c1897f6659b2c72a3603a57fd9002c8c2a92efc463d8db6bc2e1f3ae" as const;

before(async () => {
  db = new PGlite();
  configureSendStore(pgliteExecutor(db));
  configurePreferencesStore(pgliteExecutor(db));
  await ensureSendsSchema();
  await ensurePreferencesSchema();
});

beforeEach(async () => {
  await db.query("DELETE FROM viky_sends");
  await db.query("DELETE FROM viky_accounts");
});

after(async () => {
  configureSendStore(undefined);
  configurePreferencesStore(undefined);
  await db.close();
});

test("a send is written down once it is final, and the reference is the hash in short form (decision 7)", async () => {
  const recorded = await recordSend({ account: ACCOUNT, coin: USDC, destination: RAMP, amount: 9_990_000n, txHash: HASH });
  assert.equal(recorded.reference, "7599b203");
  assert.equal(sendReference(HASH), "7599b203");
  const sends = await loadSends(ACCOUNT);
  assert.equal(sends.length, 1);
  assert.equal(sends[0].amount, 9_990_000n);
  assert.equal(sends[0].destination, RAMP);
  assert.equal(sends[0].txHash.toLowerCase(), HASH.toLowerCase());
  assert.ok(sends[0].sentAtMs > 0);
});

test("the same transaction reported twice is one row", async () => {
  await recordSend({ account: ACCOUNT, coin: USDC, destination: RAMP, amount: 9_990_000n, txHash: HASH });
  await recordSend({ account: ACCOUNT, coin: USDC, destination: RAMP, amount: 9_990_000n, txHash: HASH });
  assert.equal((await loadSends(ACCOUNT)).length, 1);
  assert.equal((await loadSends(RAMP)).length, 0, "another account sees nothing of it");
});

test("an account has no display currency until it chooses one, and the last choice wins", async () => {
  assert.deepEqual(await loadPreferences(ACCOUNT), { displayCurrency: null, appearance: null, country: null });
  await saveDisplayCurrency(ACCOUNT, "EUR");
  assert.deepEqual(await loadPreferences(ACCOUNT), { displayCurrency: "EUR", appearance: null, country: null });
  await saveDisplayCurrency(ACCOUNT.toLowerCase(), "XOF");
  assert.deepEqual(await loadPreferences(ACCOUNT), { displayCurrency: "XOF", appearance: null, country: null }, "one row per account, whatever the case of its letters");
});

test("an account is shown by day or by night once it has said, and the two choices keep their own row (D159)", async () => {
  assert.equal((await loadPreferences(ACCOUNT)).appearance, null, "until somebody presses, the device decides");
  await saveDisplayCurrency(ACCOUNT, "XOF");
  await saveAppearance(ACCOUNT, "dark");
  assert.deepEqual(await loadPreferences(ACCOUNT), { displayCurrency: "XOF", appearance: "dark", country: null }, "and choosing one never forgets the other");
  await saveAppearance(ACCOUNT.toLowerCase(), "light");
  assert.equal((await loadPreferences(ACCOUNT)).appearance, "light", "one row per account, whatever the case of its letters");
  await saveDisplayCurrency(ACCOUNT, "EUR");
  assert.deepEqual(await loadPreferences(ACCOUNT), { displayCurrency: "EUR", appearance: "light", country: null });
});

test("an account keeps where it lives beside its other choices, and the last answer wins (D274)", async () => {
  assert.equal((await loadPreferences(ACCOUNT)).country, null, "until the person says, no country is kept");
  await saveDisplayCurrency(ACCOUNT, "EUR");
  await saveCountry(ACCOUNT, "sn");
  assert.equal((await loadPreferences(ACCOUNT)).country, "sn");
  await saveCountry(ACCOUNT.toLowerCase(), "fr");
  const kept = await loadPreferences(ACCOUNT);
  assert.equal(kept.country, "fr", "one row per account, whatever the case of its letters");
  assert.equal(kept.displayCurrency, "EUR", "and saying it forgets no other choice");
});
