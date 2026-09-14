import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  asOpenExit,
  attachSignature,
  configureExitStore,
  discardExit,
  ensureExitSchema,
  loadExit,
  markExitSent,
  newExitId,
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
const PAYOUT = "0x0000000000000000000000000000000000000B0b";
const EXCHANGE = "0xb3e6778480b2E488385E8205eA05E20060B813cb";
const ONE = 1_000_000_000_000_000_000n;

function terms(over: Partial<Omit<ExitRecord, "signature" | "txHash" | "state">> = {}) {
  return {
    id: newExitId(),
    account: ACCOUNT as `0x${string}`,
    amount: 3_000_000n,
    payoutTo: PAYOUT as `0x${string}`,
    minOut: 126n * ONE,
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
  assert.equal(found?.minOut, 126n * ONE);
  assert.equal(found?.callData, "0xce1e7030");
  assert.equal(found?.signature, null);
  assert.equal(found?.state, "prepared");
});

test("the same terms are relayed again rather than signed again", async () => {
  const t = terms();
  await saveExit(t);
  assert.equal(await attachSignature(t.id, "0xabcd"), true);
  const found = await openExit(ACCOUNT);
  const plan = planExit(asOpenExit(found!), { amount: t.amount, payoutTo: t.payoutTo, minOut: t.minOut });
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

test("terms that have expired hold nobody back", async () => {
  await saveExit(terms({ deadline: BigInt(Math.floor(Date.now() / 1000) - 1) }));
  assert.equal(await openExit(ACCOUNT), null);
});

test("one account never sees another's way out", async () => {
  const t = terms();
  await saveExit(t);
  assert.equal(await openExit(PAYOUT), null);
  assert.equal(await loadExit(t.id, PAYOUT), null);
});
