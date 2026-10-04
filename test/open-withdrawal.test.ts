import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after, before, beforeEach } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { attachSignature, configureExitStore, ensureExitSchema, markExitSent, newExitId, saveExit, type ExitRecord } from "../src/exit-store";
import { heldForWithdrawal } from "../src/exit-steps";
import { openWithdrawalOf } from "../src/open-withdrawal";
import type { SqlExecutor } from "../src/proof-session-store";
import { configureSendStore, ensureSendsSchema, recordSend } from "../src/send-store";
import { CASH_OUT, HOME, YOUR_MONEY } from "../src/sentences";

/**
 * A withdrawal is open when what was written down says so, and never because of a balance (the founder, 3 Oct 2026).
 * A card payment delivers USDC, the coin the bank service takes, and Home read it as "$5.60 of it is ready to send to
 * Ramp" a moment after paying.
 */

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
const RAMP = "0x0000000000000000000000000000000000000Ca5";
const USDC = "0x754704Bc059F8C67012fEd69BC8A327a5aafb603";
const AUSD = "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a";
const hash = (byte: string) => `0x${byte.repeat(32)}` as `0x${string}`;

function terms(over: Partial<Omit<ExitRecord, "signature" | "txHash" | "state">> = {}) {
  return {
    id: newExitId(),
    account: ACCOUNT as `0x${string}`,
    amount: 10_000_000n,
    tokenOut: USDC as `0x${string}`,
    minOut: 9_990_000n,
    exchange: "0xb3e6778480b2E488385E8205eA05E20060B813cb" as `0x${string}`,
    callData: "0xce1e7030" as `0x${string}`,
    callHash: hash("11"),
    salt: hash("22"),
    deadline: BigInt(Math.floor(Date.now() / 1000) + 900),
    nonce: hash("33"),
    ...over,
  };
}

/** A way out that landed: prepared, signed, sent. */
async function landed(over: Partial<Omit<ExitRecord, "signature" | "txHash" | "state">> = {}): Promise<void> {
  const t = terms(over);
  await saveExit(t);
  await attachSignature(t.id, "0x01");
  await markExitSent(t.id, hash("aa"));
}

before(async () => {
  db = new PGlite();
  const run = pgliteExecutor(db);
  configureExitStore(run);
  configureSendStore(run);
  await ensureExitSchema();
  await ensureSendsSchema();
});

beforeEach(async () => {
  await db.query("DELETE FROM viky_exits");
  await db.query("DELETE FROM viky_sends");
});

after(async () => {
  configureExitStore(undefined);
  configureSendStore(undefined);
  await db.close();
});

test("no way out ever landed: no withdrawal is open, whatever the account holds", async () => {
  assert.equal(await openWithdrawalOf(ACCOUNT), null);
  // Terms prepared, and terms signed, are not money changed: nothing has come back yet.
  const prepared = terms();
  await saveExit(prepared);
  assert.equal(await openWithdrawalOf(ACCOUNT), null);
  await attachSignature(prepared.id, "0x01");
  assert.equal(await openWithdrawalOf(ACCOUNT), null);
});

test("a way out that landed is open until its coin is sent on, and only for the account it is of", async () => {
  await landed();
  const open = await openWithdrawalOf(ACCOUNT);
  assert.ok(open);
  assert.equal(open.coin, USDC);
  assert.equal(open.atLeast, 9_990_000n);
  assert.ok(Math.abs(open.sinceMs - Date.now()) < 60_000);
  assert.equal(await openWithdrawalOf(SOMEBODY_ELSE), null);
  // A send of another coin, and a send by somebody else, close nothing.
  await recordSend({ account: ACCOUNT, coin: AUSD, destination: RAMP, amount: 1_000_000n, txHash: hash("b1") });
  await recordSend({ account: SOMEBODY_ELSE, coin: USDC, destination: RAMP, amount: 9_990_000n, txHash: hash("b2") });
  assert.ok(await openWithdrawalOf(ACCOUNT));
  // The coin sent on: the withdrawal is closed.
  await recordSend({ account: ACCOUNT, coin: USDC, destination: RAMP, amount: 9_990_000n, txHash: hash("b3") });
  assert.equal(await openWithdrawalOf(ACCOUNT), null);
});

test("a send made before the way out landed does not close it", async () => {
  await recordSend({ account: ACCOUNT, coin: USDC, destination: RAMP, amount: 3_000_000n, txHash: hash("c1") });
  await db.query("UPDATE viky_sends SET sent_at = now() - interval '1 hour'");
  await landed();
  assert.ok(await openWithdrawalOf(ACCOUNT));
});

test("a conversion of card dollars into what a gift holds is not a withdrawal", async () => {
  // Written in the same table (src/usdc-router.ts): what comes back is what a gift holds, which no way out gives.
  await landed({ tokenOut: AUSD as `0x${string}`, amount: 5_600_948n, minOut: 5_595_484n });
  assert.equal(await openWithdrawalOf(ACCOUNT), null);
});

test("the balance is held to what the way out gave back: less of the coin than that is not that money", () => {
  const open = { coin: USDC, atLeast: 9_990_000n };
  assert.equal(heldForWithdrawal(open, USDC, 9_990_000n), true);
  assert.equal(heldForWithdrawal(open, USDC.toLowerCase(), 12_000_000n), true);
  // The founder's own account on 3 Oct 2026: a way out of 16 Sep with no send written after it, and 5.60 USDC from a
  // card payment. Not the money of that withdrawal.
  assert.equal(heldForWithdrawal(open, USDC, 5_600_948n), false);
  assert.equal(heldForWithdrawal(open, AUSD, 50_000_000n), false, "another coin");
  assert.equal(heldForWithdrawal(null, USDC, 50_000_000n), false, "no withdrawal open");
  assert.equal(heldForWithdrawal(undefined, USDC, 50_000_000n), false, "not known yet");
  assert.equal(heldForWithdrawal({ coin: USDC, atLeast: 0n }, USDC, 50_000_000n), false, "a way out that promised nothing proves nothing");
});

test("Home says one amount and names no service; the withdrawal screen says ready only for an open withdrawal, in the account's currency", () => {
  const hero = readFileSync("app/kit/MoneyHero.tsx", "utf8");
  assert.doesNotMatch(hero, /firstReady|readyLine|readyLabel|exitAmount|\.way\.name/);
  assert.equal("readyLine" in HOME, false);
  assert.equal("readyLabel" in HOME, false);
  assert.equal("readyLine" in YOUR_MONEY, false);
  // The withdrawal screen: what it says is ready goes through the open withdrawal for the bank service's coin.
  const screen = readFileSync("app/components/CashOut.tsx", "utf8");
  assert.match(screen, /const saidReady = \(way: WayOut\): Ready \| undefined => \(isNative\(coinOf\(way\)\) \|\| heldForWithdrawal\(openWithdrawal, coinOf\(way\)\.address, held\(coinOf\(way\)\)\) \? readyOf\(way\) : undefined\);/);
  assert.match(screen, /const firstReady = WAYS_OUT\.find\(\(way\) => saidReady\(way\) !== undefined\);/);
  assert.equal((screen.match(/W\.readyLine\(firstReady\.name, readyInWords\(firstReady\)\)/g) ?? []).length, 2);
  assert.match(screen, /spokenAmount\(money\.led\(readyOf\(way\)!\.units\)\)/, "in the account's own currency");
  assert.equal(CASH_OUT.readyLine("Ramp", "about €4.77"), "about €4.77 of it is ready to send to Ramp.");
  // Dollars a card delivered are counted with the rest and changed first, when a way is chosen; never while the
  // withdrawal is not known.
  assert.match(screen, /const arrived = openWithdrawal !== undefined && !heldForWithdrawal\(openWithdrawal, USDC\.address, held\(USDC\)\) && held\(USDC\) >= USDC_ARRIVAL_FLOOR && usdcRouterAddress\(\) \? held\(USDC\) : 0n;/);
  assert.match(screen, /const changeable = toTheCent\(ausd \+ giftsHold \+ arrived, AUSD\.decimals\);/);
  assert.match(screen, /if \(arrived > 0n\) \{\n\s*readying = true;\n\s*await changeArrivedUsdc\(\{ account, amount: arrived \}\);/);
  // The route answers for the session's account, never one the browser names.
  const route = readFileSync("app/api/exit/open/route.ts", "utf8");
  assert.match(route, /const open = await openWithdrawalOf\(auth\.account\);/);
});
