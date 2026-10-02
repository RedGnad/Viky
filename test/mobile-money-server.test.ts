// The mobile money way out on the server, its ledger against a real Postgres (PGlite in-process), so the SQL is what
// runs on Neon; Switch and the chain are stood in for.

import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { encodeAbiParameters, encodeEventTopics, getAddress, type Hex, type PublicClient } from "viem";
import { USDC } from "../src/coins";
import { exitRouterAbi } from "../src/exit-router-abi";
import { ASK_SWITCH_EVERY_MS, followPayout, forgetKeptCoverage, offerIn, startPayout, type SwitchReader } from "../src/mobile-money-server";
import { configureMobilePayoutStore, loadPayout, notePayoutState } from "../src/mobile-money-store";
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
  assert.deepEqual(offer, { offered: true, country: "SN", currency: "XOF", settlement: "5-10 minutes", minimumUnits: "10000000", maximumUnits: "100000000000", operators: [{ code: "ORANGE", name: "Orange" }, { code: "WAVE", name: "Wave" }], numberRule: "^[0-9]{9,40}$", nameRule: "^(?=.*[A-Za-z])[A-Za-z0-9\\s\\-'&().,;]{2,100}$" });
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
  await assert.rejects(startPayout(other, deps(chainWithExit({ payer: "0x00000000000000000000000000000000000b0b00", tokenOut: USDC.address, amountOut: 11_200_000n }))), /did not make dollars for this account/);
  await assert.rejects(startPayout(other, deps(chainWithExit({ payer: ACCOUNT, tokenOut: "0x00000000000000000000000000000000000c0c00", amountOut: 11_200_000n }))), /did not make dollars for this account/);
  await assert.rejects(startPayout(other, deps(chainWithExit({ payer: ACCOUNT, tokenOut: USDC.address, amountOut: 11_200_000n, router: "0x00000000000000000000000000000000000d0d00" }))), /did not make dollars for this account/);
  await assert.rejects(startPayout(other, deps(chainWithExit({ payer: ACCOUNT, tokenOut: USDC.address, amountOut: 11_200_000n, status: "reverted" }))), /not on the network yet/);
  await assert.rejects(startPayout(other, deps(chainWithExit({ payer: ACCOUNT, tokenOut: USDC.address, amountOut: 9_990_000n }))), /from \$10\.00/);
  await assert.rejects(startPayout(other, deps(chainWithExit({ payer: ACCOUNT, tokenOut: USDC.address, amountOut: 11_200_000n }), 11_200_001n)), /asked for more than the exchange made/);
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
  const first = await followPayout({ reference: started.reference, account: ACCOUNT }, { status });
  assert.equal(first.phase, "waiting");
  assert.equal(asked, 1);
  assert.equal((await loadPayout(started.reference))?.depositTx, `0x${"cd".repeat(32)}`);
  await followPayout({ reference: started.reference, account: ACCOUNT }, { status });
  assert.equal(asked, 1, "asked again only after fifteen seconds");
  await followPayout({ reference: started.reference, account: ACCOUNT }, { status, now: () => Date.now() + ASK_SWITCH_EVERY_MS + 1 });
  assert.equal(asked, 2);
  // The webhook says it arrived, with the amount paid: the next look says so without asking Switch.
  assert.equal(await notePayoutState(started.reference, { status: "COMPLETED", local: 6512.4, depositHash: null }), true);
  const arrived = await followPayout({ reference: started.reference, account: ACCOUNT }, { status, now: () => Date.now() + 10 * ASK_SWITCH_EVERY_MS });
  assert.deepEqual({ phase: arrived.phase, local: arrived.local, numberEnd: arrived.numberEnd }, { phase: "arrived", local: 6512.4, numberEnd: "4567" });
  assert.equal(asked, 2, "settled: Switch is not asked again");
  await assert.rejects(followPayout({ reference: started.reference, account: "0x00000000000000000000000000000000000b0b00" }, { status }), /No such payout/);
  assert.equal(await notePayoutState("00000000-0000-0000-0000-000000000000", { status: "COMPLETED", local: 1, depositHash: null }), false, "a reference not ours changes nothing");
});
