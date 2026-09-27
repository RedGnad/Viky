// The treasury's USDC payment on Base, signed here and hashed before it is sent: a send whose answer is lost after the
// node took the transfer is followed by that hash and never refunded. Real viem clients, built by baseClients, against
// a local JSON-RPC stand-in for Base. No network, and Anvil's published test key, never a real one.

import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import test, { after, before } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { createPublicClient, createWalletClient, decodeFunctionData, erc20Abi, http as viemHttp, keccak256, parseTransaction, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import type { BitrefillInvoice } from "../src/bitrefill";
import { payPhoneTopUp, type PhoneDeps } from "../src/phone-order";
import * as store from "../src/phone-order-store";
import { BASE_USDC_ADDRESS, baseClients, payInvoiceOnBase, TreasuryError, type BaseClients } from "../src/phone-treasury";
import type { SqlExecutor } from "../src/proof-session-store";

const TEST_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const TEST_ADDRESS = privateKeyToAccount(TEST_KEY).address;
const INVOICE_ADDRESS = "0x3333333333333333333333333333333333333333";
const PRICE_UNITS = 20_000_000n;

/** What the stand-in answers to eth_sendRawTransaction, after it has recorded the transfer as received. */
type SendAnswer = "hash" | "lost" | "hang" | { code: number; message: string };

type BaseStub = Readonly<{ url: string; raws: Hex[]; close: () => void }>;

async function baseStub(options: Readonly<{ send: SendAnswer; knowsTransaction?: boolean; estimateReverts?: boolean }>): Promise<BaseStub> {
  const raws: Hex[] = [];
  const hex = (value: bigint) => `0x${value.toString(16)}`;
  const answer = (call: { id: number; method: string; params: unknown[] }) => {
    const ok = (result: unknown) => ({ jsonrpc: "2.0", id: call.id, result });
    switch (call.method) {
      case "eth_chainId":
        return ok(hex(8453n));
      case "eth_call":
        return ok(`0x${(100_000_000n).toString(16).padStart(64, "0")}`);
      case "eth_getBalance":
        return ok(hex(10n ** 15n));
      case "eth_getTransactionCount":
        return ok(hex(5n));
      case "eth_estimateGas":
        return options.estimateReverts ? { jsonrpc: "2.0", id: call.id, error: { code: 3, message: "execution reverted", data: "0x" } } : ok(hex(60_000n));
      case "eth_maxPriorityFeePerGas":
      case "eth_gasPrice":
        return ok(hex(1_000_000n));
      case "eth_getBlockByNumber":
        return ok({ number: hex(16n), hash: `0x${"11".repeat(32)}`, parentHash: `0x${"22".repeat(32)}`, timestamp: hex(1n), baseFeePerGas: hex(1_000_000n), gasLimit: hex(30_000_000n), gasUsed: "0x0", transactions: [] });
      case "eth_blockNumber":
        return ok(hex(20n));
      case "eth_getTransactionByHash": {
        const [hash] = call.params as [Hex];
        return ok(options.knowsTransaction ? { hash, from: TEST_ADDRESS, to: BASE_USDC_ADDRESS, nonce: hex(5n), input: "0x", value: "0x0", gas: hex(60_000n), maxFeePerGas: hex(3_000_000n), maxPriorityFeePerGas: hex(1_000_000n), type: "0x2", chainId: hex(8453n), blockHash: null, blockNumber: null, transactionIndex: null, v: "0x0", r: "0x1", s: "0x1", accessList: [] } : null);
      }
      case "eth_getTransactionReceipt": {
        const [hash] = call.params as [Hex];
        const landed = raws.some((raw) => keccak256(raw) === hash);
        return ok(landed ? { transactionHash: hash, blockHash: `0x${"33".repeat(32)}`, blockNumber: hex(18n), transactionIndex: "0x0", from: TEST_ADDRESS, to: BASE_USDC_ADDRESS, status: "0x1", logs: [], logsBloom: `0x${"00".repeat(256)}`, cumulativeGasUsed: hex(60_000n), gasUsed: hex(60_000n), effectiveGasPrice: hex(1_000_000n), contractAddress: null, type: "0x2" } : null);
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
        const raw = (parsed.params as [Hex])[0];
        raws.push(raw);
        if (options.send === "lost") {
          // The node took the transfer; its answer is lost on the way back.
          response.writeHead(504, { "content-type": "text/plain" });
          return response.end("gateway timeout");
        }
        if (options.send === "hang") return setTimeout(() => response.destroy(), 2_000);
        response.writeHead(200, { "content-type": "application/json" });
        if (options.send === "hash") return response.end(JSON.stringify({ jsonrpc: "2.0", id: parsed.id, result: keccak256(raw) }));
        return response.end(JSON.stringify({ jsonrpc: "2.0", id: parsed.id, error: options.send }));
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(Array.isArray(parsed) ? parsed.map(answer) : answer(parsed)));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, raws, close: () => server.close() };
}

/** The clients payInvoiceOnBase uses in production, pointed at the stand-in. */
function clientsFor(url: string): BaseClients {
  return baseClients({ TREASURY_PRIVATE_KEY: TEST_KEY, TREASURY_ADDRESS: TEST_ADDRESS, BASE_RPC_URL: url } as unknown as NodeJS.ProcessEnv);
}

async function paymentError(clients: BaseClients): Promise<TreasuryError> {
  try {
    await payInvoiceOnBase({ to: INVOICE_ADDRESS, usdcUnits: PRICE_UNITS }, clients);
  } catch (error) {
    assert.ok(error instanceof TreasuryError, `a treasury error, not ${String(error)}`);
    return error;
  }
  assert.fail("the payment was expected to throw");
}

test("a transfer the node took whose answer was lost is unconfirmed, carrying the hash of the signed transfer", async () => {
  const stub = await baseStub({ send: "lost" });
  try {
    const error = await paymentError(clientsFor(stub.url));
    assert.equal(stub.raws.length, 1, "sent once");
    assert.equal(error.code, "PAYMENT_UNCONFIRMED", "followed, never refunded");
    assert.equal(error.hash, keccak256(stub.raws[0]));
  } finally {
    stub.close();
  }
});

test("a send that runs out of time after the node took it is unconfirmed too", async () => {
  const stub = await baseStub({ send: "hang" });
  try {
    const account = privateKeyToAccount(TEST_KEY);
    // Built as baseClients builds them, with a short timeout only so the test does not wait ten seconds.
    const transport = viemHttp(stub.url, { timeout: 300 });
    const clients: BaseClients = { account, publicClient: createPublicClient({ chain: base, transport }) as PublicClient, walletClient: createWalletClient({ chain: base, transport, account }) };
    const error = await paymentError(clients);
    assert.equal(stub.raws.length, 1);
    assert.equal(error.code, "PAYMENT_UNCONFIRMED");
    assert.equal(error.hash, keccak256(stub.raws[0]));
  } finally {
    stub.close();
  }
});

test("a node that already holds the transfer, or answers with an error it does not explain, leaves it unconfirmed", async () => {
  for (const send of [{ code: -32000, message: "already known" }, { code: -32603, message: "internal error" }]) {
    const stub = await baseStub({ send });
    try {
      const error = await paymentError(clientsFor(stub.url));
      assert.equal(error.code, "PAYMENT_UNCONFIRMED", send.message);
      assert.equal(error.hash, keccak256(stub.raws[0]));
    } finally {
      stub.close();
    }
  }
});

test("a transfer Base plainly refused is failed only when Base does not know it; known, it is followed", async () => {
  const refused = await baseStub({ send: { code: -32000, message: "nonce too low: next nonce 6, tx nonce 5" } });
  try {
    const error = await paymentError(clientsFor(refused.url));
    assert.equal(error.code, "PAYMENT_FAILED", "it can never land, so the money can go back");
    assert.equal(error.hash, undefined);
  } finally {
    refused.close();
  }
  const known = await baseStub({ send: { code: -32000, message: "nonce too low: next nonce 6, tx nonce 5" }, knowsTransaction: true });
  try {
    const error = await paymentError(clientsFor(known.url));
    assert.equal(error.code, "PAYMENT_UNCONFIRMED", "Base has it: it may be the one that spent the nonce");
    assert.equal(error.hash, keccak256(known.raws[0]));
  } finally {
    known.close();
  }
});

test("an error before the transfer is signed sends nothing and is a failed payment", async () => {
  const stub = await baseStub({ send: "hash", estimateReverts: true });
  try {
    const error = await paymentError(clientsFor(stub.url));
    assert.equal(error.code, "PAYMENT_FAILED");
    assert.equal(stub.raws.length, 0, "nothing reached the node");
  } finally {
    stub.close();
  }
});

test("a transfer that goes through pays the exact USDC to Bitrefill's address on Base, under the hash it was signed with", async () => {
  const stub = await baseStub({ send: "hash" });
  try {
    const paid = await payInvoiceOnBase({ to: INVOICE_ADDRESS, usdcUnits: PRICE_UNITS }, clientsFor(stub.url));
    assert.equal(stub.raws.length, 1);
    assert.equal(paid.hash, keccak256(stub.raws[0]));
    const signed = parseTransaction(stub.raws[0]);
    assert.equal(signed.chainId, 8453);
    assert.equal(signed.to?.toLowerCase(), BASE_USDC_ADDRESS.toLowerCase());
    const transfer = decodeFunctionData({ abi: erc20Abi, data: signed.data! });
    assert.equal(transfer.functionName, "transfer");
    assert.deepEqual(transfer.args, [INVOICE_ADDRESS, PRICE_UNITS]);
  } finally {
    stub.close();
  }
});

let db: PGlite;
before(async () => {
  db = new PGlite();
  store.configurePhoneOrderStore((async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    return (await db.query<Record<string, unknown>>(text, values)).rows;
  }) as SqlExecutor);
  await store.ensurePhoneOrderSchema();
});
after(async () => {
  store.configurePhoneOrderStore(undefined);
  await db.close();
});

test("an order whose payment answer was lost is delivered when Bitrefill saw the money, and the person is not refunded", async () => {
  const stub = await baseStub({ send: "lost" });
  try {
    const clients = clientsFor(stub.url);
    const person = "0x1111111111111111111111111111111111111111" as Hex;
    const unpaid: BitrefillInvoice = { id: "inv-lost-answer", status: "unpaid", payment: { method: "usdc_base", address: INVOICE_ADDRESS, price: "20", currency: "USDC" }, orders: [{ id: "o", status: "created" }] };
    const refunds: unknown[] = [];
    const deps = {
      // Bitrefill sees the USDC once the transfer reached Base, whatever the node answered.
      readInvoice: async () => (stub.raws.length > 0 ? { ...unpaid, status: "complete", orders: [{ id: "o", status: "delivered" }] } : unpaid),
      treasuryAddress: () => TEST_ADDRESS,
      treasuryCovers: async () => true,
      payInvoiceOnBase: (input: { to: string; usdcUnits: bigint }) => payInvoiceOnBase(input, clients),
      refundAusd: async (input: unknown) => {
        refunds.push(input);
        return { hash: "0xrefund" as Hex };
      },
      heldAusd: async () => PRICE_UNITS,
      relayToTreasury: async () => ({ hash: "0xin" as Hex }),
      authorizationUsed: async () => false,
      store,
      sleep: async () => undefined,
    } as unknown as PhoneDeps;
    const order = await store.recordPricedOrder({ account: person, kind: "phone", productId: "orange-senegal", operatorName: "Orange Senegal", localAmount: "10000", localCurrency: "XOF", phoneNumber: "+221771234567", invoiceId: unpaid.id, usdcUnits: PRICE_UNITS, ausdUnits: PRICE_UNITS });
    const authorization = { value: PRICE_UNITS, validAfter: 0n, validBefore: 9_999_999_999n, nonce: `0x${"cd".repeat(32)}` as Hex, signature: "0x00" as Hex };
    const status = await payPhoneTopUp({ account: person, orderId: order.id, authorization }, deps);
    assert.equal(status.state, "delivered");
    assert.equal(refunds.length, 0, "Bitrefill was paid, so the treasury does not pay the person back as well");
    assert.equal((await store.loadPhoneOrder(order.id))?.paymentTx, keccak256(stub.raws[0]), "the journal keeps the payment on Base");
  } finally {
    stub.close();
  }
});
