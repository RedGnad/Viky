import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after, before, beforeEach } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  asOpenExit,
  attachSignature,
  configureExitStore,
  conversionsSent,
  exchangesSentInto,
  discardExit,
  ensureExitSchema,
  loadExit,
  markExitSent,
  markExitStale,
  newExitId,
  retireExpiredExits,
  openExit,
  saveExit,
  type ExitRecord,
} from "../src/exit-store";
import { planExit } from "../src/exit-plan";
import type { SqlExecutor } from "../src/proof-session-store";

let db: PGlite;

function pgliteExecutor(database: PGlite): SqlExecutor {
  return async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    const result = await database.query<Record<string, unknown>>(text, values);
    return result.rows;
  };
}

const ACCOUNT = "0x00000000000000000000000000000000000A11cE";
const SOMEBODY_ELSE = "0x0000000000000000000000000000000000000B0b";
const EXCHANGE = "0xb3e6778480b2E488385E8205eA05E20060B813cb";
/** The coin one of the two payout services takes; the other takes the chain's own (D77). */
const USDC = "0x754704Bc059F8C67012fEd69BC8A327a5aafb603";

function terms(over: Partial<Omit<ExitRecord, "signature" | "txHash" | "state">> = {}) {
  return {
    id: newExitId(),
    account: ACCOUNT as `0x${string}`,
    amount: 3_000_000n,
    tokenOut: USDC as `0x${string}`,
    // Six decimals, because what comes back is USDC and the person sends it on themselves (D76).
    minOut: 2_997_000n,
    exchange: EXCHANGE as `0x${string}`,
    callData: "0xce1e7030" as `0x${string}`,
    callHash: `0x${"11".repeat(32)}` as `0x${string}`,
    salt: `0x${"22".repeat(32)}` as `0x${string}`,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 900),
    nonce: `0x${"33".repeat(32)}` as `0x${string}`,
    ...over,
  };
}

before(async () => {
  db = new PGlite();
  configureExitStore(pgliteExecutor(db));
  await ensureExitSchema();
});

beforeEach(async () => {
  await db.query("DELETE FROM viky_exits");
});

after(async () => {
  configureExitStore(undefined);
  await db.close();
});

test("a prepared way out is found again, with its terms and its calldata", async () => {
  const t = terms();
  await saveExit(t);
  const found = await openExit(ACCOUNT);
  assert.equal(found?.id, t.id);
  assert.equal(found?.amount, 3_000_000n);
  assert.equal(found?.tokenOut, USDC);
  assert.equal(found?.minOut, 2_997_000n);
  assert.equal(found?.callData, "0xce1e7030");
  assert.equal(found?.signature, null);
  assert.equal(found?.state, "prepared");
});

test("the same terms are relayed again rather than signed again", async () => {
  const t = terms();
  await saveExit(t);
  assert.equal(await attachSignature(t.id, "0xabcd"), true);
  const found = await openExit(ACCOUNT);
  const plan = planExit(asOpenExit(found!), { amount: t.amount, tokenOut: t.tokenOut, minOut: t.minOut });
  assert.deepEqual(plan, { kind: "reuse", id: t.id });
  assert.equal(found?.signature, "0xabcd");
});

test("a signature is kept once, so there is never a second thing to relay", async () => {
  const t = terms();
  await saveExit(t);
  assert.equal(await attachSignature(t.id, "0xaaaa"), true);
  assert.equal(await attachSignature(t.id, "0xbbbb"), false);
  assert.equal((await loadExit(t.id, ACCOUNT))?.signature, "0xaaaa");
});

test("terms nobody signed can be thrown away; signed ones cannot", async () => {
  const unsigned = terms();
  await saveExit(unsigned);
  assert.equal(await discardExit(unsigned.id), true);
  assert.equal(await openExit(ACCOUNT), null);

  const signed = terms();
  await saveExit(signed);
  await attachSignature(signed.id, "0xabcd");
  assert.equal(await discardExit(signed.id), false);
  assert.equal((await openExit(ACCOUNT))?.id, signed.id);
});

test("once it has landed it is no longer in the way", async () => {
  const t = terms();
  await saveExit(t);
  await attachSignature(t.id, "0xabcd");
  assert.equal(await markExitSent(t.id, "0xfeed"), true);
  assert.equal(await openExit(ACCOUNT), null);
  assert.equal(await markExitSent(t.id, "0xfeed"), false);
});

/**
 * Terms the exchange refused because its route had moved are set aside, so the next attempt may quote again
 * (D81). Without this a retry is impossible: while one set is signed, no second set may be made, because two
 * live authorizations for the same money could both land.
 */
test("terms the exchange refused are set aside, and stop holding the account back", async () => {
  const t = terms();
  await saveExit(t);
  await attachSignature(t.id, "0xabcd");
  assert.equal((await openExit(ACCOUNT))?.id, t.id, "signed terms hold the account until they are dealt with");

  assert.equal(await markExitStale(t.id), true);
  assert.equal(await openExit(ACCOUNT), null, "set aside, so a fresh quote can be prepared");
  assert.equal((await loadExit(t.id, ACCOUNT))?.state, "stale");
});

test("only signed terms can be set aside, and only once", async () => {
  const unsigned = terms();
  await saveExit(unsigned);
  assert.equal(await markExitStale(unsigned.id), false, "nothing was signed, so there is nothing to set aside");

  const landed = terms();
  await saveExit(landed);
  await attachSignature(landed.id, "0xabcd");
  await markExitSent(landed.id, "0xfeed");
  assert.equal(await markExitStale(landed.id), false, "what already landed is finished, not stale");

  const once = terms();
  await saveExit(once);
  await attachSignature(once.id, "0xabcd");
  assert.equal(await markExitStale(once.id), true);
  assert.equal(await markExitStale(once.id), false, "and it cannot be set aside twice");
});

test("terms that have expired hold nobody back", async () => {
  await saveExit(terms({ deadline: BigInt(Math.floor(Date.now() / 1000) - 1) }));
  assert.equal(await openExit(ACCOUNT), null);
});

test("one account never sees another's way out", async () => {
  const t = terms();
  await saveExit(t);
  assert.equal(await openExit(SOMEBODY_ELSE), null);
  assert.equal(await loadExit(t.id, SOMEBODY_ELSE), null);
});

/**
 * The destination column is gone (D76), and a table made before that still has it, declared NOT NULL. Running
 * the schema again has to drop it, or every insert against an existing database fails while every test on a
 * fresh one passes. That is the shape of bug that only ever shows up in production.
 */
test("a table made when terms still had a destination takes the new inserts", async () => {
  await db.query("ALTER TABLE viky_exits ADD COLUMN IF NOT EXISTS payout_to text NOT NULL DEFAULT ''");
  await ensureExitSchema();
  const t = terms();
  await saveExit(t);
  assert.equal((await openExit(ACCOUNT))?.id, t.id);
});

/**
 * Terms whose deadline has passed were already harmless: the contract refuses them, the token's own window closed
 * with them, and `openExit` never offers one. What they were not is honest about themselves. One has sat in
 * production since 16 Sep 2026 saying `signed`, which reads as a signature waiting to be used (the audit of 18 Sep,
 * gap e).
 */
test("terms past their deadline are retired, and what could still land is left alone", async () => {
  const now = Math.floor(Date.now() / 1_000);
  const past = { deadline: BigInt(now - 60) };
  const future = { deadline: BigInt(now + 900) };

  const expiredSigned = terms(past);
  await saveExit(expiredSigned);
  await attachSignature(expiredSigned.id, `0x${"ab".repeat(65)}`);
  const expiredPrepared = terms(past);
  await saveExit(expiredPrepared);
  const liveSigned = terms(future);
  await saveExit(liveSigned);
  await attachSignature(liveSigned.id, `0x${"cd".repeat(65)}`);
  const alreadySent = terms(past);
  await saveExit(alreadySent);
  await attachSignature(alreadySent.id, `0x${"ef".repeat(65)}`);
  await markExitSent(alreadySent.id, `0x${"aa".repeat(32)}`);

  assert.equal(await retireExpiredExits(now), 2, "the signed one and the prepared one, both past their deadline");
  assert.equal((await loadExit(expiredSigned.id, ACCOUNT))?.state, "stale");
  assert.equal((await loadExit(expiredPrepared.id, ACCOUNT))?.state, "stale");
  assert.equal((await loadExit(liveSigned.id, ACCOUNT))?.state, "signed", "what can still land is untouched");
  assert.equal((await loadExit(alreadySent.id, ACCOUNT))?.state, "sent", "and what landed stays landed");

  // Nothing is left to retire the second time, and the one still alive is still the one a person would be offered.
  assert.equal(await retireExpiredExits(now), 0);
  assert.equal((await openExit(ACCOUNT))?.id, liveSigned.id);
});

test("the judges page reads the conversions sent, USDC changed into what a gift holds, and the first of them", async () => {
  assert.deepEqual(await conversionsSent(), { count: 0, first: null });
  const AUSD = "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a" as `0x${string}`;
  // A way out in USDC is not a conversion, however it ends.
  const out = terms();
  await saveExit(out);
  await attachSignature(out.id, `0x${"55".repeat(65)}`);
  await markExitSent(out.id, `0x${"66".repeat(32)}`);
  const conversion = terms({ amount: 14_935_075n, tokenOut: AUSD, minOut: 14_785_724n });
  await saveExit(conversion);
  assert.deepEqual(await conversionsSent(), { count: 0, first: null }, "prepared is not sent");
  await attachSignature(conversion.id, `0x${"77".repeat(65)}`);
  await markExitSent(conversion.id, `0x${"88".repeat(32)}`);
  const sent = await conversionsSent();
  assert.equal(sent?.count, 1);
  assert.equal(sent?.first?.amount, 14_935_075n);
  assert.equal(sent?.first?.minOut, 14_785_724n);
  assert.equal(sent?.first?.txHash, `0x${"88".repeat(32)}`);
});

test("the judges page reads the exchanges sent for a way out, by the coin handed back, and the first of them", async () => {
  const USDC = "0x754704Bc059F8C67012fEd69BC8A327a5aafb603";
  const MON = "0x0000000000000000000000000000000000000000";
  assert.deepEqual(await exchangesSentInto(USDC), { count: 0, first: null });
  // Prepared and signed is not sent.
  const bank = terms({ amount: 10_000_000n, minOut: 9_995_586n });
  await saveExit(bank);
  await attachSignature(bank.id, `0x${"11".repeat(65)}`);
  assert.deepEqual(await exchangesSentInto(USDC), { count: 0, first: null }, "signed is not sent");
  await markExitSent(bank.id, `0x${"22".repeat(32)}`);
  const sent = await exchangesSentInto(USDC.toLowerCase());
  assert.equal(sent?.count, 1);
  assert.deepEqual([sent?.first?.amount, sent?.first?.minOut, sent?.first?.txHash], [10_000_000n, 9_995_586n, `0x${"22".repeat(32)}`]);
  // The card's coin has its own count: an exchange into USDC is not one of the card's.
  assert.deepEqual(await exchangesSentInto(MON), { count: 0, first: null });
  // What reads it leaves out an exchange that made the dollars of a mobile money payout: that way has its own line.
  const store = readFileSync("src/exit-store.ts", "utf8");
  assert.match(store, /SELECT exit_tx FROM viky_mobile_payouts/);
  assert.match(store, /!mobile\.has\(String\(row\.tx_hash\)\.toLowerCase\(\)\)/);
});

