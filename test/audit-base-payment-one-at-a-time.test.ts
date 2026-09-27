// The treasury pays on Base one payment at a time, across server instances: two payments at once never sign the same
// nonce, and a payment that cannot take its turn in a short wait fails before anything is signed. Real viem clients,
// built by baseClients as production builds them, against a local JSON-RPC stand-in for Base, and the turn's row in a
// real Postgres (PGlite in-process). No network, and Anvil's published test key, never a real one.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import test, { after, before } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { decodeFunctionData, erc20Abi, keccak256, parseTransaction, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { BASE_PAYMENT_LEASE_SECONDS, configureBasePaymentLeaseStore, takeBasePaymentTurn } from "../src/base-payment-lease";
import { BASE_USDC_ADDRESS, baseClients, payInvoiceOnBase, TreasuryError, type BaseClients } from "../src/phone-treasury";
import type { SqlExecutor } from "../src/proof-session-store";

const TEST_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const TEST_ADDRESS = privateKeyToAccount(TEST_KEY).address;
const PRICE_UNITS = 20_000_000n;
const FIRST_NONCE = 5;

type Stub = Readonly<{ url: string; raws: Hex[]; calls: string[]; close: () => void }>;

/**
 * Base as a busy public endpoint can answer it: a transfer lands in a block a moment after it was sent, and the
 * treasury's next nonce counts only what already landed, so two instances asking at once are both told the same one.
 */
async function baseStub(options: Readonly<{ send?: "hash" | "lost" }> = {}): Promise<Stub> {
  const raws: Hex[] = [];
  const calls: string[] = [];
  const landed = new Map<Hex, bigint>();
  const start = Date.now();
  const hex = (value: bigint | number) => `0x${value.toString(16)}`;
  const blockNow = () => 100n + BigInt(Math.floor((Date.now() - start) / 100));
  const known = (hash: Hex) => raws.find((raw) => keccak256(raw) === hash);
  const answer = (call: { id: number; method: string; params: unknown[] }) => {
    calls.push(call.method);
    const ok = (result: unknown) => ({ jsonrpc: "2.0", id: call.id, result });
    switch (call.method) {
      case "eth_chainId":
        return ok(hex(8453n));
      case "eth_call":
        return ok(`0x${(100_000_000n).toString(16).padStart(64, "0")}`);
      case "eth_getBalance":
        return ok(hex(10n ** 15n));
      case "eth_getTransactionCount":
        return ok(hex(FIRST_NONCE + landed.size));
      case "eth_estimateGas":
        return ok(hex(60_000n));
      case "eth_maxPriorityFeePerGas":
      case "eth_gasPrice":
        return ok(hex(1_000_000n));
      case "eth_blockNumber":
        return ok(hex(blockNow()));
      case "eth_getBlockByNumber": {
        const [tag] = call.params as [string];
        const number = tag.startsWith("0x") ? BigInt(tag) : blockNow();
        return ok({ number: hex(number), hash: `0x${"11".repeat(32)}`, parentHash: `0x${"22".repeat(32)}`, timestamp: hex(1n), baseFeePerGas: hex(1_000_000n), gasLimit: hex(30_000_000n), gasUsed: "0x0", transactions: [] });
      }
      case "eth_getTransactionByHash": {
        const [hash] = call.params as [Hex];
        const raw = known(hash);
        if (!raw) return ok(null);
        const tx = parseTransaction(raw);
        const block = landed.get(hash);
        return ok({ hash, from: TEST_ADDRESS, to: tx.to, nonce: hex(tx.nonce ?? 0), input: tx.data ?? "0x", value: "0x0", gas: hex(tx.gas ?? 0n), maxFeePerGas: hex(tx.maxFeePerGas ?? 0n), maxPriorityFeePerGas: hex(tx.maxPriorityFeePerGas ?? 0n), type: "0x2", chainId: hex(8453n), blockHash: block === undefined ? null : `0x${"33".repeat(32)}`, blockNumber: block === undefined ? null : hex(block), transactionIndex: block === undefined ? null : "0x0", v: "0x0", r: "0x1", s: "0x1", accessList: [] });
      }
      case "eth_getTransactionReceipt": {
        const [hash] = call.params as [Hex];
        const block = landed.get(hash);
        return ok(block === undefined ? null : { transactionHash: hash, blockHash: `0x${"33".repeat(32)}`, blockNumber: hex(block), transactionIndex: "0x0", from: TEST_ADDRESS, to: BASE_USDC_ADDRESS, status: "0x1", logs: [], logsBloom: `0x${"00".repeat(256)}`, cumulativeGasUsed: hex(60_000n), gasUsed: hex(60_000n), effectiveGasPrice: hex(1_000_000n), contractAddress: null, type: "0x2" });
      }
      default:
        return { jsonrpc: "2.0", id: call.id, error: { code: -32601, message: `the stand-in does not answer ${call.method}` } };
    }
  };
  const server = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      const parsed = JSON.parse(body) as { id: number; method: string; params: unknown[] } | Array<{ id: number; method: string; params: unknown[] }>;
      if (!Array.isArray(parsed) && parsed.method === "eth_sendRawTransaction") {
        calls.push(parsed.method);
        const raw = (parsed.params as [Hex])[0];
        raws.push(raw);
        setTimeout(() => landed.set(keccak256(raw), blockNow()), 300);
        if (options.send === "lost") {
          response.writeHead(504, { "content-type": "text/plain" });
          return response.end("gateway timeout");
        }
        response.writeHead(200, { "content-type": "application/json" });
        return response.end(JSON.stringify({ jsonrpc: "2.0", id: parsed.id, result: keccak256(raw) }));
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(Array.isArray(parsed) ? parsed.map(answer) : answer(parsed)));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, raws, calls, close: () => server.close() };
}

/** One server instance's treasury on Base: its own clients, as baseClients builds them in production. */
function instance(url: string): BaseClients {
  return baseClients({ TREASURY_PRIVATE_KEY: TEST_KEY, TREASURY_ADDRESS: TEST_ADDRESS, BASE_RPC_URL: url } as unknown as NodeJS.ProcessEnv);
}

const pay = (clients: BaseClients, to: string, turn?: Parameters<typeof payInvoiceOnBase>[2]) => payInvoiceOnBase({ to, usdcUnits: PRICE_UNITS }, clients, turn);

/** A turn waited for briefly, so a test does not wait the full twenty seconds. */
const briefTurn = (payer: string) => takeBasePaymentTurn(payer, { waitMs: 300, pollMs: 50 });

async function treasuryError(payment: Promise<unknown>): Promise<TreasuryError> {
  try {
    await payment;
  } catch (error) {
    assert.ok(error instanceof TreasuryError, `a treasury error, not ${String(error)}`);
    return error;
  }
  assert.fail("the payment was expected to throw");
}

const noncesOf = (raws: readonly Hex[]) => raws.map((raw) => parseTransaction(raw).nonce);

let db: PGlite;
const turnRows = async () => (await db.query<{ holder: string; live: boolean }>("SELECT holder, expires_at > now() AS live FROM viky_base_payment_lease")).rows;
before(async () => {
  db = new PGlite();
  configureBasePaymentLeaseStore((async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    return (await db.query<Record<string, unknown>>(text, values)).rows;
  }) as SqlExecutor);
});
after(async () => {
  configureBasePaymentLeaseStore(undefined);
  await db.close();
});

test("two payments at once from two instances sign two different nonces, the second after the first landed", async () => {
  const stub = await baseStub();
  try {
    const [first, second] = await Promise.all([pay(instance(stub.url), "0x3333333333333333333333333333333333333333"), pay(instance(stub.url), "0x4444444444444444444444444444444444444444")]);
    assert.equal(stub.raws.length, 2, "both invoices were paid");
    assert.deepEqual(noncesOf(stub.raws), [FIRST_NONCE, FIRST_NONCE + 1], "never the same nonce twice");
    for (const [paid, to] of [[first, "0x3333333333333333333333333333333333333333"], [second, "0x4444444444444444444444444444444444444444"]] as const) {
      const own = stub.raws.find((raw) => keccak256(raw) === paid.hash);
      assert.ok(own, "each order keeps the hash of a transfer that was sent");
      assert.equal(decodeFunctionData({ abi: erc20Abi, data: parseTransaction(own).data! }).args[0], to, "and it is the transfer to its own invoice");
    }
    assert.deepEqual(await turnRows(), [], "the turn was handed back after each receipt");
  } finally {
    stub.close();
  }
});

test("a payment that cannot take the turn in its wait fails before anything is read, signed or sent", async () => {
  const stub = await baseStub();
  const held = await takeBasePaymentTurn(TEST_ADDRESS);
  assert.ok(held, "another instance holds the turn");
  try {
    const error = await treasuryError(pay(instance(stub.url), "0x3333333333333333333333333333333333333333", briefTurn));
    assert.equal(error.code, "PAYMENT_FAILED", "so the person's money goes back");
    assert.equal(error.hash, undefined);
    assert.equal(stub.raws.length, 0, "nothing reached Base");
    assert.deepEqual(stub.calls, [], "not even the nonce was read");
  } finally {
    await held.release();
    stub.close();
  }
});

test("a turn whose time is over, its function stopped, is taken back; one handed back late frees nothing of the next", async () => {
  const stopped = await takeBasePaymentTurn(TEST_ADDRESS);
  assert.ok(stopped);
  await db.query("UPDATE viky_base_payment_lease SET expires_at = now() - interval '1 second'");
  const stub = await baseStub();
  try {
    const next = await takeBasePaymentTurn(TEST_ADDRESS, { waitMs: 0 });
    assert.ok(next, "taken back from a function that no longer runs");
    await stopped.release();
    assert.equal((await turnRows()).length, 1, "the late hand-back leaves the next holder's turn in place");
    assert.equal(await takeBasePaymentTurn(TEST_ADDRESS, { waitMs: 0 }), null, "and nobody else takes it");
    await next.release();
    const paid = await pay(instance(stub.url), "0x3333333333333333333333333333333333333333");
    assert.equal(paid.hash, keccak256(stub.raws[0]));
  } finally {
    stub.close();
  }
});

test("of two instances asking for the turn at the same moment, exactly one gets it", async () => {
  const turns = await Promise.all([takeBasePaymentTurn(TEST_ADDRESS, { waitMs: 0 }), takeBasePaymentTurn(TEST_ADDRESS, { waitMs: 0 })]);
  assert.equal(turns.filter(Boolean).length, 1);
  await turns.find(Boolean)?.release();
  assert.deepEqual(await turnRows(), []);
});

test("a payment whose fate is unknown keeps the turn until its time is over; one that plainly did not pay hands it back", async () => {
  const lost = await baseStub({ send: "lost" });
  try {
    const error = await treasuryError(pay(instance(lost.url), "0x3333333333333333333333333333333333333333"));
    assert.equal(error.code, "PAYMENT_UNCONFIRMED");
    const rows = await turnRows();
    assert.equal(rows.length, 1, "its nonce may still be spent: nobody reads the next one yet");
    assert.equal(rows[0].live, true);
    const next = await baseStub();
    try {
      assert.equal((await treasuryError(pay(instance(next.url), "0x4444444444444444444444444444444444444444", briefTurn))).code, "PAYMENT_FAILED");
      assert.equal(next.raws.length, 0);
    } finally {
      next.close();
    }
  } finally {
    await db.query("DELETE FROM viky_base_payment_lease");
    lost.close();
  }
  const short = await baseStub();
  try {
    const error = await treasuryError(payInvoiceOnBase({ to: "0x3333333333333333333333333333333333333333", usdcUnits: 10n ** 12n }, instance(short.url)));
    assert.equal(error.code, "TREASURY_SHORT");
    assert.deepEqual(await turnRows(), [], "nothing was sent, so the turn is free again");
  } finally {
    short.close();
  }
});

test("a turn store that cannot be reached pays nothing, and a turn not handed back never turns a payment into a failure", async () => {
  const stub = await baseStub();
  try {
    const unreachable = await treasuryError(
      pay(instance(stub.url), "0x3333333333333333333333333333333333333333", async () => {
        throw new Error("the database is not answering");
      }),
    );
    assert.equal(unreachable.code, "PAYMENT_FAILED");
    assert.equal(stub.raws.length, 0);
    const paid = await pay(instance(stub.url), "0x3333333333333333333333333333333333333333", async () => ({
      release: async () => {
        throw new Error("the database stopped answering after the payment");
      },
    }));
    assert.equal(stub.raws.length, 1);
    assert.equal(paid.hash, keccak256(stub.raws[0]), "the invoice was paid: the order must not be refunded");
  } finally {
    stub.close();
  }
});

test("a database named but not answering pays nothing; only a run with no database at all takes no turn", async () => {
  configureBasePaymentLeaseStore(undefined);
  const saved = process.env.DATABASE_URL;
  const stub = await baseStub();
  try {
    process.env.DATABASE_URL = "postgres://nobody:nothing@127.0.0.1:1/none";
    const error = await treasuryError(pay(instance(stub.url), "0x3333333333333333333333333333333333333333"));
    assert.equal(error.code, "PAYMENT_FAILED", "the turn is asked of the database named, never skipped");
    assert.equal(stub.raws.length, 0);
    delete process.env.DATABASE_URL;
    const paid = await pay(instance(stub.url), "0x3333333333333333333333333333333333333333");
    assert.equal(paid.hash, keccak256(stub.raws[0]), "no database, no order: a test or a script pays at once");
  } finally {
    if (saved === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = saved;
    stub.close();
  }
});

test("a turn lasts at least as long as the function that pays can run", () => {
  const route = readFileSync("app/api/phone/pay/route.ts", "utf8");
  const maxDuration = Number(route.match(/export const maxDuration = (\d+);/)?.[1]);
  assert.ok(maxDuration > 0, "the pay route states its budget");
  assert.ok(BASE_PAYMENT_LEASE_SECONDS >= maxDuration, "a turn is never taken from a function still running");
  assert.match(readFileSync("src/phone-order.ts", "utf8"), /payInvoiceOnBase: \(input\) => payInvoiceOnBase\(input\)/, "production pays with the default turn");
});
