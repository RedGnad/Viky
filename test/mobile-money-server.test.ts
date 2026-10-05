// The mobile money way out on the server, its ledger against a real Postgres (PGlite in-process), so the SQL is what
// runs on Neon; Switch and the chain are stood in for.

import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { encodeAbiParameters, encodeEventTopics, getAddress, type Hex, type PublicClient } from "viem";
import { USDC } from "../src/coins";
import { exitRouterAbi } from "../src/exit-router-abi";
import { ASK_SWITCH_EVERY_MS, followPayout, forgetKeptCoverage, offerIn, startPayout, type SwitchReader } from "../src/mobile-money-server";
import { configureMobilePayoutStore, loadPayout, notePayoutState, payoutsArrived, recordPayout } from "../src/mobile-money-store";
import type { SqlExecutor } from "../src/proof-session-store";
import type { OpenedPayout } from "../src/switch";

const ROUTER = "0x8a1790DfD10CF1599bDaeD5eC8BB46B2A6eB6223";
const ACCOUNT = "0x00000000000000000000000000000000000a11ce";
const ON = { MOBILE_MONEY_OUT: "on", SWITCH_SERVICE_KEY: "test-key" };
const EXIT = `0x${"e1".repeat(32)}` as Hex;

let db: PGlite;
function pgliteExecutor(database: PGlite): SqlExecutor {
  return async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    return (await database.query<Record<string, unknown>>(text, values)).rows;
  };
}

before(async () => {
  process.env.EXIT_ROUTER_ADDRESS = ROUTER;
  Object.assign(process.env, ON);
  db = new PGlite();
  configureMobilePayoutStore(pgliteExecutor(db));
});
after(async () => {
  configureMobilePayoutStore(undefined);
  await db.close();
  delete process.env.MOBILE_MONEY_OUT;
  delete process.env.SWITCH_SERVICE_KEY;
});
beforeEach(() => forgetKeptCoverage());

const reader = (asked: string[] = []): SwitchReader => ({
  rates: async () => new Map([["XOF", 587.1333]]),
  coverage: async () => {
    asked.push("coverage");
    return [{ country: "SN", currency: "XOF", settlement: "5-10 minutes", minimumUnits: 10_000_000n, maximumUnits: 100_000_000_000n }];
  },
  fields: async (country) => {
    asked.push(`fields ${country}`);
    return { networks: [{ code: "ORANGE", name: "ORANGE" }, { code: "WAVE", name: "WAVE" }], numberRule: "^[0-9]{9,40}$", nameRule: "^(?=.*[A-Za-z])[A-Za-z0-9\\s\\-'&().,;]{2,100}$" };
  },
  quote: async () => {
    throw new Error("not asked here");
  },
});

/** A receipt of the way out's router, with the `Exited` it emits, as the chain would answer it. */
function chainWithExit(input: { payer: string; tokenOut: string; amountOut: bigint; router?: string; status?: "success" | "reverted" }): PublicClient {
  const topics = encodeEventTopics({ abi: exitRouterAbi, eventName: "Exited", args: { payer: getAddress(input.payer), tokenOut: getAddress(input.tokenOut), exchange: getAddress("0x00000000000000000000000000000000000e4c40") } });
  const data = encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [12_000_000n, input.amountOut]);
  return {
    getTransactionReceipt: async () => ({ status: input.status ?? "success", logs: [{ address: input.router ?? ROUTER, topics, data, blockHash: `0x${"0".repeat(64)}`, blockNumber: 1n, logIndex: 0, transactionHash: EXIT, transactionIndex: 0, removed: false }] }),
  } as unknown as PublicClient;
}

const opener = (calls: unknown[] = [], deposit = 11_200_000n) => async (input: { reference: string; units: bigint; refundAddress: string; callbackUrl: string }): Promise<OpenedPayout> => {
  calls.push(input);
  return { reference: input.reference, status: "AWAITING_DEPOSIT", depositAddress: "0x3131b6f6a32751C9d99C1710e357A6C4297d17Bc", depositUnits: deposit, local: 6510.2, currency: "XOF", rate: 587.13 };
};

const ask = { account: ACCOUNT, exitTx: EXIT, country: "SN", network: "ORANGE", number: "771234567", holderName: "Awa Ndiaye", callbackUrl: "https://viky.cash/api/mobile-money/webhook" };

test("offered only switched on, in a country Switch covers, with its operators said as a person reads them; read once per sitting", async () => {
  assert.deepEqual(await offerIn("SN", { reader: reader(), env: {} }), { offered: false });
  assert.deepEqual(await offerIn("FR", { reader: reader(), env: ON }), { offered: false });
  assert.deepEqual(await offerIn(null, { reader: reader(), env: ON }), { offered: false });
  const asked: string[] = [];
  forgetKeptCoverage();
  const offer = await offerIn("sn", { reader: reader(asked), env: ON, now: () => 1_000 });
  assert.deepEqual(offer, { offered: true, country: "SN", currency: "XOF", settlement: "5-10 minutes", minimumUnits: "10000000", maximumUnits: "100000000000", leastLocal: 5896, operators: [{ code: "ORANGE", name: "Orange" }, { code: "WAVE", name: "Wave" }], numberRule: "^[0-9]{9,40}$", nameRule: "^(?=.*[A-Za-z])[A-Za-z0-9\\s\\-'&().,;]{2,100}$", rate: 587.1333 });
  await offerIn("SN", { reader: reader(asked), env: ON, now: () => 2_000 });
  assert.deepEqual(asked, ["coverage", "fields SN"], "kept a few minutes, so Switch is not asked twice in one sitting");
  // Switch silent: not offered, never an error on the screen.
  const silent: SwitchReader = { ...reader(), coverage: async () => Promise.reject(new Error("429")) };
  forgetKeptCoverage();
  assert.deepEqual(await offerIn("SN", { reader: silent, env: ON }), { offered: false });
});

test("a payout is opened for what the exchange really made, refunded to the person's own account, and recorded with four digits", async () => {
  const calls: Array<{ units: bigint; refundAddress: string; callbackUrl: string }> = [];
  const started = await startPayout(ask, { reader: reader(), env: ON, client: chainWithExit({ payer: ACCOUNT, tokenOut: USDC.address, amountOut: 11_200_000n }), open: opener(calls) as never, now: () => Date.parse("2026-10-02T21:00:00Z") });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].units, 11_200_000n, "the event's amountOut, never a figure the browser gave");
  assert.equal(calls[0].refundAddress, getAddress(ACCOUNT));
  assert.deepEqual({ ...started, reference: "" }, { reference: "", depositAddress: "0x3131b6f6a32751C9d99C1710e357A6C4297d17Bc", depositUnits: "11200000", expiresAt: "2026-10-02T21:30:00.000Z", local: 6510.2, currency: "XOF" });
  const row = await loadPayout(started.reference);
  assert.equal(row?.numberEnd, "4567");
  assert.equal(row?.network, "ORANGE");
  // Nothing more of the person is kept: no column holds the whole number or the name.
  const columns = (await db.query<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_name = 'viky_mobile_payouts'")).rows.map((one) => one.column_name);
  assert.ok(!columns.some((name) => /holder|name$|phone|number$/.test(name)), columns.join(", "));

  // The same exchange again: the payout already opened, never a second one.
  const again = await startPayout(ask, { reader: reader(), env: ON, client: chainWithExit({ payer: ACCOUNT, tokenOut: USDC.address, amountOut: 11_200_000n }), open: opener(calls) as never, now: () => Date.parse("2026-10-02T21:05:00Z") });
  assert.equal(again.reference, started.reference);
  assert.equal(calls.length, 1);
  // Its window closed with nothing sent: forgotten, and a new one opened for the same dollars.
  const later = await startPayout(ask, { reader: reader(), env: ON, client: chainWithExit({ payer: ACCOUNT, tokenOut: USDC.address, amountOut: 11_200_000n }), open: opener(calls) as never, now: () => Date.parse("2026-10-02T21:31:00Z") });
  assert.notEqual(later.reference, started.reference);
  assert.equal(calls.length, 2);
});

test("refused before anything is opened: another's exchange, another coin, a deposit above what it made, outside the corridor, a bad field", async () => {
  const other = { ...ask, exitTx: `0x${"e2".repeat(32)}` as Hex };
  const deps = (client: PublicClient, deposit?: bigint) => ({ reader: reader(), env: ON, client, open: opener([], deposit) as never });
  await assert.rejects(startPayout(other, deps(chainWithExit({ payer: "0x00000000000000000000000000000000000b0b00", tokenOut: USDC.address, amountOut: 11_200_000n }))), /not money this account changed/);
  await assert.rejects(startPayout(other, deps(chainWithExit({ payer: ACCOUNT, tokenOut: "0x00000000000000000000000000000000000c0c00", amountOut: 11_200_000n }))), /not money this account changed/);
  await assert.rejects(startPayout(other, deps(chainWithExit({ payer: ACCOUNT, tokenOut: USDC.address, amountOut: 11_200_000n, router: "0x00000000000000000000000000000000000d0d00" }))), /not money this account changed/);
  await assert.rejects(startPayout(other, deps(chainWithExit({ payer: ACCOUNT, tokenOut: USDC.address, amountOut: 11_200_000n, status: "reverted" }))), /still being changed/);
  await assert.rejects(startPayout(other, deps(chainWithExit({ payer: ACCOUNT, tokenOut: USDC.address, amountOut: 9_990_000n }))), /from \$10\.00/);
  await assert.rejects(startPayout(other, deps(chainWithExit({ payer: ACCOUNT, tokenOut: USDC.address, amountOut: 11_200_000n }), 11_200_001n)), /asked for more than was changed for it/);
  await assert.rejects(startPayout({ ...other, network: "MTN" }, deps(chainWithExit({ payer: ACCOUNT, tokenOut: USDC.address, amountOut: 11_200_000n }))), /Choose your operator/);
  await assert.rejects(startPayout({ ...other, number: "77" }, deps(chainWithExit({ payer: ACCOUNT, tokenOut: USDC.address, amountOut: 11_200_000n }))), /not one this operator takes/);
  await assert.rejects(startPayout({ ...other, holderName: "1" }, deps(chainWithExit({ payer: ACCOUNT, tokenOut: USDC.address, amountOut: 11_200_000n }))), /name on the account/);
  await assert.rejects(startPayout({ ...other, country: "FR" }, deps(chainWithExit({ payer: ACCOUNT, tokenOut: USDC.address, amountOut: 11_200_000n }))), /not offered for this country/);
});

test("a payout is followed by the webhook's word, and Switch is asked itself at most every fifteen seconds; only by its own account", async () => {
  const started = await startPayout({ ...ask, exitTx: `0x${"e3".repeat(32)}` as Hex }, { reader: reader(), env: ON, client: chainWithExit({ payer: ACCOUNT, tokenOut: USDC.address, amountOut: 11_200_000n }), open: opener() as never, now: () => Date.now() });
  let asked = 0;
  const status = async () => {
    asked += 1;
    return { status: "PROCESSING", local: null, currency: null, depositHash: `0x${"cd".repeat(32)}` };
  };
  const first = await followPayout({ reference: started.reference, account: ACCOUNT }, { status, reader: reader(), env: ON });
  assert.equal(first.phase, "waiting");
  assert.equal(asked, 1);
  assert.equal((await loadPayout(started.reference))?.depositTx, `0x${"cd".repeat(32)}`);
  await followPayout({ reference: started.reference, account: ACCOUNT }, { status, reader: reader(), env: ON });
  assert.equal(asked, 1, "asked again only after fifteen seconds");
  await followPayout({ reference: started.reference, account: ACCOUNT }, { status, reader: reader(), env: ON, now: () => Date.now() + ASK_SWITCH_EVERY_MS + 1 });
  assert.equal(asked, 2);
  // The webhook says it arrived, with the amount paid: the next look says so without asking Switch.
  assert.equal(await notePayoutState(started.reference, { status: "COMPLETED", local: 6512.4, depositHash: null }), true);
  const arrived = await followPayout({ reference: started.reference, account: ACCOUNT }, { status, reader: reader(), env: ON, now: () => Date.now() + 10 * ASK_SWITCH_EVERY_MS });
  assert.deepEqual({ phase: arrived.phase, local: arrived.local, numberEnd: arrived.numberEnd }, { phase: "arrived", local: 6512.4, numberEnd: "4567" });
  assert.equal(asked, 2, "settled: Switch is not asked again");
  await assert.rejects(followPayout({ reference: started.reference, account: "0x00000000000000000000000000000000000b0b00" }, { status, reader: reader(), env: ON }), /No such payout/);
  assert.equal(await notePayoutState("00000000-0000-0000-0000-000000000000", { status: "COMPLETED", local: 1, depositHash: null }), false, "a reference not ours changes nothing");
});

test("the amount typed in francs is priced by Switch's exact quote, and the ceilings are checked against the dollars it counts", async () => {
  const { priceInLocal } = await import("../src/mobile-money-server");
  const asked: unknown[] = [];
  const pricing = (local: number, source: number): SwitchReader => ({
    ...reader(),
    quote: async (input) => {
      asked.push(input);
      return { local, currency: "XOF", sourceUnits: BigInt(Math.round(source * 1e6)), rate: 587.13, feeUnits: null, at: "2026-10-03T10:15:00.000Z", expiry: null, settlement: null };
    },
  });
  const price = await priceInLocal({ account: ACCOUNT, country: "SN", local: 8800 }, { reader: pricing(8800, 15.07), env: ON, used: async () => 0n });
  assert.deepEqual(asked.find((one) => "local" in (one as object)), { country: "SN", local: 8800, currency: "XOF" });
  assert.deepEqual(price, { local: 8800, currency: "XOF", sourceUnits: "15070000", at: "2026-10-03T10:15:00.000Z" });
  // An answer for another amount is never shown as this one's.
  await assert.rejects(priceInLocal({ account: ACCOUNT, country: "SN", local: 8800 }, { reader: pricing(6540, 11.14), env: ON, used: async () => 0n }), /priced something else/);
  // The ceilings, by their sentences.
  await assert.rejects(priceInLocal({ account: ACCOUNT, country: "SN", local: 120_000 }, { reader: pricing(120_000, 204.4), env: ON, used: async () => 0n }), /One payout can be \$200\.00 at most/);
  await assert.rejects(priceInLocal({ account: ACCOUNT, country: "SN", local: 58_800 }, { reader: pricing(58_800, 100.1), env: ON, used: async () => 450_000_000n }), /\$450\.00 already went today/);
});

test("the day counts payouts opened today whose dollars did not come back; a payout past a ceiling is refused when it is sent", async () => {
  const { usedToday } = await import("../src/mobile-money-store");
  const day = "2026-10-03T12:00:00.000Z";
  const insert = (reference: string, units: number, status: string, sent: boolean, expiresAt: string, createdAt = "2026-10-03T08:00:00.000Z") =>
    db.query(
      `INSERT INTO viky_mobile_payouts (reference, account, country, network, number_end, exit_tx, units, deposit_address, deposit_units, local_amount, local_currency, rate, status, expires_at, deposit_sent_at, created_at)
       VALUES ($1, $2, 'SN', 'ORANGE', '4567', $3, $4, '0x3131b6f6a32751C9d99C1710e357A6C4297d17Bc', $4, '1', 'XOF', '1', $5, $6, $7, $8)`,
      [reference, "0x00000000000000000000000000000000000ca5e5", `0x${reference.replace(/-/g, "").padEnd(64, "a")}`, String(units), status, expiresAt, sent ? createdAt : null, createdAt],
    );
  await insert("aaaaaaaa-0000-0000-0000-000000000001", 100_000_000, "COMPLETED", true, "2026-10-03T08:30:00.000Z");
  await insert("aaaaaaaa-0000-0000-0000-000000000002", 50_000_000, "FAILED", true, "2026-10-03T08:30:00.000Z");
  await insert("aaaaaaaa-0000-0000-0000-000000000003", 70_000_000, "AWAITING_DEPOSIT", false, "2026-10-03T08:30:00.000Z");
  await insert("aaaaaaaa-0000-0000-0000-000000000004", 30_000_000, "AWAITING_DEPOSIT", false, "2026-10-03T12:20:00.000Z");
  await insert("aaaaaaaa-0000-0000-0000-000000000005", 200_000_000, "COMPLETED", true, "2026-10-02T08:30:00.000Z", "2026-10-02T08:00:00.000Z");
  // Counted: the one arrived and the one opened and still open. Not: the failed one, the window closed with nothing sent, yesterday's.
  assert.equal(await usedToday("0x00000000000000000000000000000000000CA5E5", new Date(day)), 130_000_000n);
  // At the send, with $450 already gone today, a payout of $70 is refused, and nothing is opened.
  const opened: unknown[] = [];
  await assert.rejects(
    startPayout({ ...ask, exitTx: `0x${"e9".repeat(32)}` as Hex }, { reader: reader(), env: ON, client: chainWithExit({ payer: ACCOUNT, tokenOut: USDC.address, amountOut: 70_000_000n }), open: opener(opened) as never, used: async () => 450_000_000n }),
    /\$450\.00 already went today/,
  );
  assert.equal(opened.length, 0);
});

test("the judges page reads how many payouts arrived and the first, dated by the moment Switch first said so", async () => {
  await db.query("DELETE FROM viky_mobile_payouts");
  assert.deepEqual(await payoutsArrived(), { count: 0, first: null });
  const payout = (reference: string, exitTx: string) =>
    recordPayout({ reference, account: ACCOUNT, country: "SN", network: "ORANGE", numberEnd: "4567", exitTx, units: 10_000_000n, depositAddress: `0x${"de".repeat(20)}`, depositUnits: 10_000_000n, localAmount: 5892.17, localCurrency: "XOF", rate: 589.21703, status: "AWAITING_DEPOSIT", expiresAt: new Date(Date.now() + 1_800_000) });
  await payout("00000000-0000-4000-8000-000000000001", `0x${"a1".repeat(32)}`);
  await payout("00000000-0000-4000-8000-000000000002", `0x${"a2".repeat(32)}`);
  await notePayoutState("00000000-0000-4000-8000-000000000001", { status: "PROCESSING", local: null, depositHash: `0x${"d1".repeat(32)}` });
  assert.deepEqual(await payoutsArrived(), { count: 0, first: null }, "processing is not arrived");
  await notePayoutState("00000000-0000-4000-8000-000000000001", { status: "COMPLETED", local: 5892.17, depositHash: null });
  const first = await payoutsArrived();
  assert.equal(first?.count, 1);
  assert.equal(first?.first?.network, "ORANGE");
  assert.equal(first?.first?.depositTx, `0x${"d1".repeat(32)}`);
  assert.equal(first?.first?.exitTx, `0x${"a1".repeat(32)}`);
  const completedAt = first!.first!.at.getTime();
  // Asked again later, a completed payout keeps the moment it first completed.
  await new Promise((resolve) => setTimeout(resolve, 20));
  await notePayoutState("00000000-0000-4000-8000-000000000001", { status: "COMPLETED", local: null, depositHash: null });
  assert.equal((await payoutsArrived())?.first?.at.getTime(), completedAt);
  await notePayoutState("00000000-0000-4000-8000-000000000002", { status: "COMPLETED", local: null, depositHash: null });
  const two = await payoutsArrived();
  assert.equal(two?.count, 2);
  assert.equal(two?.first?.exitTx, `0x${"a1".repeat(32)}`, "the first stays the first");
});

/** Switch at one rate both ways, the one its quotes gave on 3 Oct 2026 (589.21703 francs a dollar, no fee field). */
const linear = (rate = 589.21703, corridor: { maximumUnits?: bigint } = {}): SwitchReader => ({
  ...reader(),
  coverage: async () => [{ country: "SN", currency: "XOF", settlement: "5-10 minutes", minimumUnits: 10_000_000n, maximumUnits: corridor.maximumUnits ?? 100_000_000_000n }],
  quote: async (input) => {
    const answer = { currency: "XOF", rate, feeUnits: null, at: "2026-10-05T10:15:00.000Z", expiry: null, settlement: null };
    if ("local" in input) return { ...answer, local: input.local, sourceUnits: BigInt(Math.ceil((input.local / rate) * 1e6)) };
    return { ...answer, local: (Number(input.units) / 1e6) * rate, sourceUnits: input.units };
  },
});
const shownOf = (units: bigint) => `${units / 1_000_000n}.${(units % 1_000_000n).toString().padStart(6, "0")}`;

test("with the balance as the only limit, the amount the field opens on is accepted by the exchange", async () => {
  const { payableNow, priceInLocal } = await import("../src/mobile-money-server");
  const { changeFor, MoreThanHeld, unitsOfShown } = await import("../src/client/mobile-money");
  const { ApiError } = await import("../src/client/api");
  const { localOfUnits } = await import("../src/mobile-money");
  // The exchange as the browser meets it: a floor a little under what it takes, and the route's own refusal of more
  // than the account holds.
  const exchange = (held: bigint, costPerMillion: bigint, asked: bigint[] = []) => async (amount: bigint) => {
    asked.push(amount);
    if (amount > held) throw new ApiError({ status: 409, code: "NOT_ENOUGH", message: "That is more than you have." });
    return { shown: shownOf(amount - (amount * costPerMillion) / 1_000_000n), sells: "", name: "", ticket: "ticket" };
  };
  for (const held of [15_000_000n, 10_370_000n, 37_000_001n, 123_456_789n]) {
    for (const cost of [400n, 3_000n, 10_000n]) {
      forgetKeptCoverage();
      const deps = { reader: linear(), env: ON, used: async () => 0n, held: async () => held, floor: async (amount: bigint) => amount - (amount * cost) / 1_000_000n, changed: async () => null };
      const payable = await payableNow({ account: ACCOUNT, country: "SN" }, deps);
      assert.equal(payable.by, "balance", "nothing but the balance holds it");
      assert.equal(payable.spendUnits, held.toString());
      assert.ok(payable.mostLocal >= payable.leastLocal, `${held} at ${cost}: there is an amount to open on`);
      // The amount the field opens on, priced as the screen prices it: Switch's quote for exactly that, then the
      // exchange asked for enough of the balance. Since the bound was read the rate has moved a thousandth against
      // the person, which is what the margin is for.
      const price = await priceInLocal({ account: ACCOUNT, country: "SN", local: payable.mostLocal }, deps);
      const needed = BigInt(price.sourceUnits);
      const asked: bigint[] = [];
      const changed = await changeFor(needed, BigInt(payable.spendUnits), exchange(held, cost + 1_000n, asked));
      assert.ok(changed.dollars <= held, `${held} at ${cost}: never more than is held (${changed.dollars})`);
      assert.ok(unitsOfShown(changed.exchange.shown) >= needed, `${held} at ${cost}: the exchange guarantees what Switch needs`);
      assert.ok(asked.every((amount) => amount <= held), "and it was never asked for more than is held");
    }
  }
  // The smallest amount is priced at or over the corridor's minimum, where the published rate put it under.
  forgetKeptCoverage();
  const deps = { reader: linear(), env: ON, used: async () => 0n, held: async () => 15_000_000n, floor: async (amount: bigint) => amount - (amount * 400n) / 1_000_000n, changed: async () => null };
  const payable = await payableNow({ account: ACCOUNT, country: "SN" }, deps);
  assert.equal(payable.leastLocal, 5904);
  assert.ok(BigInt((await priceInLocal({ account: ACCOUNT, country: "SN", local: payable.leastLocal }, deps)).sourceUnits) >= 10_000_000n);
  await assert.rejects(priceInLocal({ account: ACCOUNT, country: "SN", local: localOfUnits(10_000_000n, 587.1333, "up") }, deps), /from \$10\.00/, "the old bound, 5 872 F, priced under the minimum");
  // What it replaced: the balance at Switch's published rate, without the cost. With the quote at that rate and an
  // exchange that keeps three thousandths, the amount the field opened on asked for more than the account held.
  forgetKeptCoverage();
  const atPublished = { ...deps, reader: linear(587.1333) };
  const old = await priceInLocal({ account: ACCOUNT, country: "SN", local: localOfUnits(15_000_000n, 587.1333, "down") }, atPublished);
  await assert.rejects(changeFor(BigInt(old.sourceUnits), 15_000_000n, exchange(15_000_000n, 3_000n)), MoreThanHeld);
});

test("the largest amount says what holds it down, and nothing is offered that the balance cannot reach", async () => {
  const { payableNow } = await import("../src/mobile-money-server");
  const floor = async (amount: bigint) => amount - (amount * 400n) / 1_000_000n;
  const base = { env: ON, used: async () => 0n, floor, changed: async () => null };
  // More than one payout may be: the ceiling holds it, and only that much of the balance may be changed.
  forgetKeptCoverage();
  const ceiling = await payableNow({ account: ACCOUNT, country: "SN" }, { ...base, reader: linear(), held: async () => 300_000_000n });
  assert.deepEqual({ by: ceiling.by, spend: ceiling.spendUnits }, { by: "ceiling", spend: "200000000" });
  // The corridor's own largest payout, when it is under both.
  forgetKeptCoverage();
  const corridor = await payableNow({ account: ACCOUNT, country: "SN" }, { ...base, reader: linear(589.21703, { maximumUnits: 50_000_000n }), held: async () => 150_000_000n });
  assert.equal(corridor.by, "corridor");
  assert.equal(corridor.mostLocal, Math.floor(49.9 * 589.21703), "the largest payout less the margin, cut down to the franc");
  // A balance the exchange leaves under the corridor's minimum: nothing to open on, which the screen says in place of the form.
  forgetKeptCoverage();
  const under = await payableNow({ account: ACCOUNT, country: "SN" }, { ...base, reader: linear(), held: async () => 10_010_000n, floor: async (amount: bigint) => amount - (amount * 10_000n) / 1_000_000n });
  assert.ok(under.mostLocal < under.leastLocal);
  // The exchange silent: one sentence in the person's own words, and no figure.
  forgetKeptCoverage();
  await assert.rejects(payableNow({ account: ACCOUNT, country: "SN" }, { ...base, reader: linear(), held: async () => 15_000_000n, floor: async () => Promise.reject(new Error("no route")) }), /Mobile money cannot be reached just now\. Nothing was taken/);
});

test("a payout money left for is found again until it was seen finished, and one never paid into is not on its way", async () => {
  const { latestPayout, sawPayout } = await import("../src/mobile-money-server");
  const { markDepositSent } = await import("../src/mobile-money-store");
  const account = "0x00000000000000000000000000000000000f0f01";
  const follow = { status: async () => ({ status: "PROCESSING", local: null, currency: null, depositHash: null }), reader: reader(), env: ON };
  const started = await startPayout({ ...ask, account, exitTx: `0x${"f1".repeat(32)}` as Hex }, { reader: reader(), env: ON, client: chainWithExit({ payer: account, tokenOut: USDC.address, amountOut: 11_200_000n }), open: opener() as never, now: () => Date.now() });
  // Opened, and nothing sent to it yet: no money left, so there is nothing on its way to show.
  assert.equal(await latestPayout(account, follow), null);
  // The dollars left: from here the way out shows it, with the operator's name and the country's time, without the form.
  assert.equal(await markDepositSent(started.reference, account), true);
  const waiting = await latestPayout(account, follow);
  assert.deepEqual({ reference: waiting?.reference, phase: waiting?.phase, operator: waiting?.operator, settlement: waiting?.settlement, numberEnd: waiting?.numberEnd }, { reference: started.reference, phase: "waiting", operator: "Orange", settlement: "5-10 minutes", numberEnd: "4567" });
  // A look every five seconds asks Switch nothing for the operator's name and the country's time: with nothing kept
  // of the country the operator is said by its code and the time is left out, and Switch is not read for them.
  forgetKeptCoverage();
  const read: string[] = [];
  const look = await followPayout({ reference: started.reference, account }, { ...follow, reader: reader(read) });
  assert.deepEqual({ operator: look.operator, settlement: look.settlement, read }, { operator: "Orange", settlement: null, read: [] });
  // Found again, it is read once, and kept for the looks that follow.
  assert.equal((await latestPayout(account, { ...follow, reader: reader(read) }))?.settlement, "5-10 minutes");
  assert.deepEqual(read, ["coverage", "fields SN"]);
  assert.equal((await followPayout({ reference: started.reference, account }, { ...follow, reader: reader(read) })).settlement, "5-10 minutes");
  assert.deepEqual(read, ["coverage", "fields SN"]);
  // On its way cannot be seen finished: it is shown again on every return.
  assert.equal(await sawPayout({ reference: started.reference, account }, follow), false);
  assert.equal((await latestPayout(account, follow))?.reference, started.reference);
  // Arrived while the person was away: shown once more, as arrived, until a screen has shown it.
  await notePayoutState(started.reference, { status: "COMPLETED", local: 6512.4, depositHash: null });
  assert.equal((await latestPayout(account, follow))?.phase, "arrived");
  await assert.rejects(sawPayout({ reference: started.reference, account: "0x00000000000000000000000000000000000b0b00" }, follow), /No such payout/);
  assert.equal(await sawPayout({ reference: started.reference, account }, follow), true);
  assert.equal(await latestPayout(account, follow), null);
  // A failure is owed a screen as an arrival is.
  const failed = await startPayout({ ...ask, account, exitTx: `0x${"f2".repeat(32)}` as Hex }, { reader: reader(), env: ON, client: chainWithExit({ payer: account, tokenOut: USDC.address, amountOut: 11_200_000n }), open: opener() as never, now: () => Date.now() });
  await markDepositSent(failed.reference, account);
  await notePayoutState(failed.reference, { status: "FAILED", local: null, depositHash: null });
  assert.equal((await latestPayout(account, follow))?.phase, "failed");
});

test("dollars changed and not sent are what the next press sends: money is never changed twice", async () => {
  const { changedAndWaiting, offerIn: offer, payableNow } = await import("../src/mobile-money-server");
  const { markDepositSent } = await import("../src/mobile-money-store");
  const account = "0x00000000000000000000000000000000000f0f02";
  const exitTx = `0x${"f3".repeat(32)}` as Hex;
  forgetKeptCoverage();
  const offered = await offer("SN", { reader: linear(), env: ON });
  assert.ok(offered.offered);
  if (!offered.offered) return;
  // The payout was cut after the money was changed: the way out that landed is written down, nothing was sent since,
  // and the account holds what it made.
  const open = async () => ({ coin: USDC.address, atLeast: 11_100_000n, sinceMs: Date.now() - 60_000, txHash: exitTx });
  const client = chainWithExit({ payer: account, tokenOut: USDC.address, amountOut: 11_200_000n });
  const deps = { reader: linear(), open, client, heldUsdc: async () => 11_200_000n, used: async () => 0n };
  const changed = await changedAndWaiting({ account, offer: offered }, deps);
  assert.deepEqual(changed, { exitTx, units: "11200000", local: Math.floor(11.2 * 589.21703), currency: "XOF" });
  // The card is told of them when it opens, and sends those: the same exchange, opened once.
  const payable = await payableNow({ account, country: "SN" }, { reader: linear(), env: ON, used: async () => 0n, held: async () => 3_800_000n, floor: async (amount: bigint) => amount, changed: (input) => changedAndWaiting(input, deps) });
  assert.deepEqual(payable.changed, changed);
  const calls: unknown[] = [];
  const started = await startPayout({ ...ask, account, exitTx }, { reader: linear(), env: ON, client, open: opener(calls) as never, now: () => Date.now() });
  // Opened and still not paid into, a second cut: the same dollars are still what the card sends, by the same payout.
  assert.deepEqual(await changedAndWaiting({ account, offer: offered }, deps), changed);
  assert.equal((await startPayout({ ...ask, account, exitTx }, { reader: linear(), env: ON, client, open: opener(calls) as never, now: () => Date.now() })).reference, started.reference);
  assert.equal(calls.length, 1);
  // Once the dollars have left for it, nothing waits any more.
  await markDepositSent(started.reference, account);
  assert.equal(await changedAndWaiting({ account, offer: offered }, deps), null);
  // And dollars that are not for this way out are left alone: no longer held, another coin, a change whose transaction
  // was never heard of, less than the country's smallest payout.
  const fresh = { ...deps, open: async () => ({ coin: USDC.address, atLeast: 11_100_000n, sinceMs: Date.now(), txHash: `0x${"f4".repeat(32)}` as Hex }) };
  assert.equal(await changedAndWaiting({ account, offer: offered }, { ...fresh, heldUsdc: async () => 11_199_999n }), null);
  assert.equal(await changedAndWaiting({ account, offer: offered }, { ...fresh, open: async () => ({ coin: "0x0000000000000000000000000000000000000000" as Hex, atLeast: 1n, sinceMs: Date.now(), txHash: `0x${"f4".repeat(32)}` as Hex }) }), null);
  assert.equal(await changedAndWaiting({ account, offer: offered }, { ...fresh, open: async () => ({ coin: USDC.address, atLeast: 11_100_000n, sinceMs: Date.now(), txHash: null }) }), null);
  assert.equal(await changedAndWaiting({ account, offer: offered }, { ...fresh, client: chainWithExit({ payer: account, tokenOut: USDC.address, amountOut: 9_000_000n }), heldUsdc: async () => 9_000_000n }), null);
  assert.equal(await changedAndWaiting({ account, offer: offered }, { ...fresh, open: async () => null }), null);
});
