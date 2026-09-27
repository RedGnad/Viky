// The phone way out's ledger against a real Postgres (PGlite in-process), and its treasury against fake chains.

import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { decodeFunctionData, erc20Abi, keccak256, recoverTypedDataAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { transferAuthorizationTypedData } from "../src/ausd-authorization";
import { AUSD } from "../src/coins";
import {
  configurePhoneOrderStore,
  ensurePhoneOrderSchema,
  loadPhoneOrder,
  markAbandoned,
  markDelivered,
  markFailed,
  markPaid,
  markReceived,
  markRefunded,
  recordPricedOrder,
  unsettledOrders,
  usedToday,
} from "../src/phone-order-store";
import { BASE_USDC_ADDRESS, payInvoiceOnBase, refundAusd, treasuryAccount, TreasuryError, type BaseClients } from "../src/phone-treasury";
import type { RelayerClients } from "../src/relayer";
import type { SqlExecutor } from "../src/proof-session-store";

/** Anvil's first published development key: a test key the whole world knows, never a real one. */
const TEST_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const TEST_ADDRESS = privateKeyToAccount(TEST_KEY).address;
const OTHER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

let db: PGlite;
function pgliteExecutor(database: PGlite): SqlExecutor {
  return async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    return (await database.query<Record<string, unknown>>(text, values)).rows;
  };
}
before(async () => {
  db = new PGlite();
  configurePhoneOrderStore(pgliteExecutor(db));
  await ensurePhoneOrderSchema();
});
after(async () => {
  configurePhoneOrderStore(undefined);
  await db.close();
});

const ORDER = { account: "0x1111111111111111111111111111111111111111", kind: "phone" as const, productId: "orange-senegal", operatorName: "Orange Senegal", localAmount: "2000", localCurrency: "XOF", phoneNumber: "+221771234567", usdcUnits: 3_812_346n, ausdUnits: 3_812_346n };

test("an order goes forward one step at a time, a step asked twice changes nothing, and the number goes when it ends", async () => {
  const order = await recordPricedOrder({ ...ORDER, invoiceId: "inv-1" });
  assert.equal(order.state, "priced");
  assert.equal(order.phoneNumber, "+221771234567");
  assert.equal(await markPaid(order.id, "0xpay"), null, "no payment before the person's money arrived");
  assert.equal((await markReceived(order.id, "0xin"))?.state, "received");
  assert.equal(await markReceived(order.id, "0xin2"), null, "received once");
  assert.equal((await markPaid(order.id, "0xpay"))?.state, "paid");
  const delivered = await markDelivered(order.id);
  assert.equal(delivered?.state, "delivered");
  assert.equal(delivered?.phoneNumber, null, "the number is kept for the order and no longer");
  assert.equal(delivered?.ausdTx, "0xin");
});

test("a failed order is refunded once, and a priced order nobody paid for is dropped with its number", async () => {
  const order = await recordPricedOrder({ ...ORDER, invoiceId: "inv-2" });
  await markReceived(order.id, "0xin-2");
  assert.equal((await markFailed(order.id, "denied"))?.state, "failed");
  assert.equal((await unsettledOrders()).some((row) => row.id === order.id), true, "money the treasury holds for somebody is listed");
  const refunded = await markRefunded(order.id, "0xrefund");
  assert.equal(refunded?.state, "refunded");
  assert.equal(refunded?.phoneNumber, null);
  assert.equal(await markRefunded(order.id, "0xrefund-again"), null, "never twice");
  const idle = await recordPricedOrder({ ...ORDER, invoiceId: "inv-3" });
  const dropped = await markAbandoned(idle.id);
  assert.equal(dropped?.phoneNumber, null);
  assert.equal((await loadPhoneOrder(idle.id))?.failure, "abandoned");
});

test("the day's use counts the money that came in and did not come back, per person or for the whole service", async () => {
  const person = "0x2222222222222222222222222222222222222222";
  const a = await recordPricedOrder({ ...ORDER, account: person, invoiceId: "inv-4", usdcUnits: 10_000_000n });
  await markReceived(a.id, "0xin-4");
  await recordPricedOrder({ ...ORDER, account: person, invoiceId: "inv-5", usdcUnits: 20_000_000n });
  const mine = await usedToday(person);
  assert.equal(mine.items, 1, "a priced order nobody paid for does not count");
  assert.equal(mine.usdcUnits, 10_000_000n);
  assert.ok((await usedToday()).items >= 2, "the whole service's count, for the account's own limits (the delivered and the received order; the abandoned one moved nothing)");
});

test("the treasury's key must make the address shared, and must not be the relayer's", () => {
  assert.equal(treasuryAccount({ TREASURY_PRIVATE_KEY: TEST_KEY, TREASURY_ADDRESS: TEST_ADDRESS } as unknown as NodeJS.ProcessEnv).address, TEST_ADDRESS);
  const refused = (error: unknown) => error instanceof TreasuryError && error.code === "NOT_CONFIGURED";
  assert.throws(() => treasuryAccount({ TREASURY_PRIVATE_KEY: OTHER_KEY, TREASURY_ADDRESS: TEST_ADDRESS } as unknown as NodeJS.ProcessEnv), refused);
  assert.throws(() => treasuryAccount({ TREASURY_PRIVATE_KEY: TEST_KEY, TREASURY_ADDRESS: TEST_ADDRESS, RELAYER_PRIVATE_KEY: TEST_KEY } as unknown as NodeJS.ProcessEnv), refused);
  assert.throws(() => treasuryAccount({} as unknown as NodeJS.ProcessEnv), refused);
});

function baseClientsHolding(usdcUnits: bigint, ethWei: bigint, sent: unknown[]): BaseClients {
  const account = privateKeyToAccount(TEST_KEY);
  return {
    account,
    publicClient: {
      readContract: async () => usdcUnits,
      getBalance: async () => ethWei,
      waitForTransactionReceipt: async () => ({ status: "success" }),
    } as unknown as BaseClients["publicClient"],
    walletClient: {
      prepareTransactionRequest: async (call: { to: Hex; data: Hex }) => {
        sent.push({ address: call.to, ...decodeFunctionData({ abi: erc20Abi, data: call.data }) });
        return { ...call, chainId: 8453, type: "eip1559", nonce: 0, gas: 60_000n, maxFeePerGas: 2n, maxPriorityFeePerGas: 1n };
      },
      sendRawTransaction: async ({ serializedTransaction }: { serializedTransaction: Hex }) => keccak256(serializedTransaction),
    } as unknown as BaseClients["walletClient"],
  };
}

test("an invoice is paid with the exact USDC asked, and never when the treasury cannot cover it", async () => {
  const sent: Array<{ address: string; functionName: string; args: readonly unknown[] }> = [];
  const paid = await payInvoiceOnBase({ to: "0x3333333333333333333333333333333333333333", usdcUnits: 3_812_346n }, baseClientsHolding(10_000_000n, 10n ** 15n, sent));
  assert.match(paid.hash, /^0x[0-9a-f]{64}$/, "the hash of the transfer the treasury signed");
  assert.equal(sent[0].address, BASE_USDC_ADDRESS);
  assert.equal(sent[0].functionName, "transfer");
  assert.equal(sent[0].args[1], 3_812_346n);
  const short = (error: unknown) => error instanceof TreasuryError && error.code === "TREASURY_SHORT";
  await assert.rejects(payInvoiceOnBase({ to: "0x3333333333333333333333333333333333333333", usdcUnits: 3_812_346n }, baseClientsHolding(1_000_000n, 10n ** 15n, [])), short);
  await assert.rejects(payInvoiceOnBase({ to: "0x3333333333333333333333333333333333333333", usdcUnits: 3_812_346n }, baseClientsHolding(10_000_000n, 0n, [])), short, "no ETH for the fee");
});

test("a refund is an AUSD authorization the treasury signs and the relayer carries, to the person, for the amount", async () => {
  const written: Array<{ args: readonly unknown[] }> = [];
  const relayer = {
    address: "0x4444444444444444444444444444444444444444",
    publicClient: {
      getChainId: async () => 143,
      getBalance: async () => 100n * 10n ** 18n,
      getBlock: async () => ({ number: 5n }),
      simulateContract: async () => ({}),
      estimateContractGas: async () => 100_000n,
      waitForTransactionReceipt: async () => ({ status: "success", blockNumber: 1n }),
      getBlockNumber: async () => 10n,
      getTransactionReceipt: async () => ({ status: "success", blockNumber: 1n }),
    },
    walletClient: {
      account: { address: "0x4444444444444444444444444444444444444444" },
      writeContract: async (call: { args: readonly unknown[] }) => {
        written.push(call);
        return "0xrefunded" as Hex;
      },
    },
  } as unknown as RelayerClients;
  const nonce = `0x${"ab".repeat(32)}` as Hex;
  const refund = await refundAusd({ to: "0x1111111111111111111111111111111111111111", ausdUnits: 3_812_346n, nonce }, { account: privateKeyToAccount(TEST_KEY), relayer });
  assert.equal(refund.hash, "0xrefunded");
  assert.equal(written.length, 1);
  {
    const [from, to, value, validAfter, validBefore, signedNonce, signature] = written[0].args as [Hex, Hex, bigint, bigint, bigint, Hex, Hex];
    assert.equal(from, TEST_ADDRESS);
    assert.equal(to, "0x1111111111111111111111111111111111111111");
    assert.equal(value, 3_812_346n);
    assert.equal(signedNonce, nonce);
    const signer = await recoverTypedDataAddress({ ...transferAuthorizationTypedData({ from, to, value, validAfter, validBefore, nonce: signedNonce }, AUSD), signature });
    assert.equal(signer, TEST_ADDRESS);
  }
});
