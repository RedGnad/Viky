// Orders move on with nobody's screen open (the money path audit of 27 Sep 2026): the settling pass follows every order
// whose money came in and has not ended, so a failure after the money arrived is sent back by itself.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after, before, beforeEach } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Hex } from "viem";
import type { BitrefillInvoice } from "../src/bitrefill";
import { followUnsettledOrders, pricePhoneTopUp, type PhoneDeps } from "../src/phone-order";
import * as store from "../src/phone-order-store";
import type { SqlExecutor } from "../src/proof-session-store";

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
beforeEach(async () => {
  await db.query("DELETE FROM viky_phone_orders");
});

const PERSON = "0x1111111111111111111111111111111111111111" as Hex;
let count = 0;

function world() {
  const invoices = new Map<string, BitrefillInvoice>();
  const refunds: unknown[] = [];
  let paid = 0;
  const deps: PhoneDeps = {
    operatorsFor: async () => [{ id: "orange-senegal", name: "Orange Senegal", currency: "XOF", packages: [], range: { min: 500, max: 50000, step: 1 } }],
    createInvoice: async () => {
      const invoice: BitrefillInvoice = { id: `inv-${++count}`, status: "unpaid", payment: { method: "usdc_base", address: "0x3333333333333333333333333333333333333333", price: "4", currency: "USDC" }, orders: [{ id: "o", status: "created" }] };
      invoices.set(invoice.id, invoice);
      return invoice;
    },
    readInvoice: async (id) => invoices.get(id)!,
    treasuryAddress: () => "0x2222222222222222222222222222222222222222",
    treasuryCovers: async () => true,
    payInvoiceOnBase: async () => {
      paid += 1;
      return { hash: `0xpay${++count}` as Hex };
    },
    refundAusd: async (input) => {
      refunds.push(input);
      return { hash: `0xrefund${++count}` as Hex };
    },
    heldAusd: async () => 100_000_000n,
    relayToTreasury: async () => ({ hash: `0xin${++count}` as Hex }),
    relayLanded: async () => "landed",
    authorizationUsed: async () => false,
    store,
    giftCardById: async () => {
      throw new Error("none");
    },
    readOrderCode: async () => undefined,
    seal: (text) => text,
    open: (sealed) => sealed,
    sleep: async () => undefined,
  };
  const inState = async (state: "received" | "paid" | "failed") => {
    const priced = await pricePhoneTopUp({ account: PERSON, phoneNumber: "+221771234567", operatorId: "orange-senegal", value: 2000 }, deps);
    await store.markReceived(priced.orderId, `0xin${++count}`);
    if (state !== "received") await store.markPaid(priced.orderId, `0xpay${++count}`);
    if (state === "failed") await store.markFailed(priced.orderId, "bitrefill:denied");
    const row = (await store.loadPhoneOrder(priced.orderId))!;
    return row;
  };
  return { deps, invoices, refunds, paid: () => paid, inState };
}

test("a paid order whose invoice fails after the person left is refunded by the pass", async () => {
  const w = world();
  const order = await w.inState("paid");
  w.invoices.set(order.invoiceId, { ...w.invoices.get(order.invoiceId)!, status: "denied" });
  assert.deepEqual(await followUnsettledOrders(w.deps), [{ orderId: order.id, state: "refunded" }]);
  assert.equal(w.refunds.length, 1);
});

test("a refund that could not be sent the first time is sent by the pass", async () => {
  const w = world();
  const order = await w.inState("failed");
  assert.deepEqual(await followUnsettledOrders(w.deps), [{ orderId: order.id, state: "refunded" }]);
  assert.equal((await store.loadPhoneOrder(order.id))?.state, "refunded");
});

test("an order whose AUSD arrived is paid only when Bitrefill says it received the payment, and never paid again", async () => {
  const w = world();
  const waiting = await w.inState("received");
  assert.match((await followUnsettledOrders(w.deps))[0].state, /for an operator/);
  assert.equal(w.paid(), 0, "an unpaid invoice is never paid a second time by the pass");
  w.invoices.set(waiting.invoiceId, { ...w.invoices.get(waiting.invoiceId)!, status: "complete", orders: [{ id: "o", status: "delivered" }] });
  assert.deepEqual(await followUnsettledOrders(w.deps), [{ orderId: waiting.id, state: "delivered" }]);
  assert.equal(w.paid(), 0);
  assert.equal(w.refunds.length, 0);
});

test("a sent relay left on a priced order is completed by the pass without another payment", async () => {
  const w = world();
  const priced = await pricePhoneTopUp({ account: PERSON, phoneNumber: "+221771234567", operatorId: "orange-senegal", value: 2000 }, w.deps);
  const invoiceId = (await store.loadPhoneOrder(priced.orderId))!.invoiceId;
  const deps: PhoneDeps = {
    ...w.deps,
    payInvoiceOnBase: async (input) => {
      const paid = await w.deps.payInvoiceOnBase(input);
      w.invoices.set(invoiceId, { ...w.invoices.get(invoiceId)!, status: "complete", orders: [{ id: "o", status: "delivered" }] });
      return paid;
    },
  };
  const nonce = `0x${"12".repeat(32)}`;
  assert.ok(await store.claimRelay(priced.orderId, nonce));
  assert.ok(await store.noteRelay(priced.orderId, "0x1234"));
  assert.deepEqual(await followUnsettledOrders(deps), [{ orderId: priced.orderId, state: "delivered" }]);
  assert.equal((await store.loadPhoneOrder(priced.orderId))?.state, "delivered");
  assert.equal(w.paid(), 1);
  assert.equal(w.refunds.length, 0);
  await followUnsettledOrders(deps);
  assert.equal(w.paid(), 1, "the invoice is never paid twice");
});

test("an unconfirmed relay stays priced and is never treated as received", async () => {
  const w = world();
  const priced = await pricePhoneTopUp({ account: PERSON, phoneNumber: "+221771234567", operatorId: "orange-senegal", value: 2000 }, w.deps);
  assert.ok(await store.claimRelay(priced.orderId, `0x${"34".repeat(32)}`));
  assert.ok(await store.noteRelay(priced.orderId, "0x5678"));
  const deps: PhoneDeps = { ...w.deps, relayLanded: async () => "unknown" };
  assert.match((await followUnsettledOrders(deps))[0].state, /not followed/);
  assert.equal((await store.loadPhoneOrder(priced.orderId))?.state, "priced");
  assert.equal(w.paid(), 0);
  assert.equal(w.refunds.length, 0);
});

test("a reverted relay frees its claim without paying or refunding", async () => {
  const w = world();
  const priced = await pricePhoneTopUp({ account: PERSON, phoneNumber: "+221771234567", operatorId: "orange-senegal", value: 2000 }, w.deps);
  assert.ok(await store.claimRelay(priced.orderId, `0x${"56".repeat(32)}`));
  assert.ok(await store.noteRelay(priced.orderId, "0x9abc"));
  const deps: PhoneDeps = { ...w.deps, relayLanded: async () => "reverted" };
  assert.deepEqual(await followUnsettledOrders(deps), [{ orderId: priced.orderId, state: "priced, relay reverted; no payment" }]);
  assert.equal((await store.loadPhoneOrder(priced.orderId))?.relayTx, null);
  assert.equal((await store.loadPhoneOrder(priced.orderId))?.state, "priced");
  assert.equal(w.paid(), 0);
  assert.equal(w.refunds.length, 0);
  assert.deepEqual(await followUnsettledOrders(deps), []);
});

test("the settling pass runs the follow, and its failure does not stop the gifts' pass", () => {
  const route = readFileSync(new URL("../app/api/cron/settle/route.ts", import.meta.url), "utf8");
  assert.match(route, /followUnsettledOrders\(\)\.catch\(/);
  assert.ok(route.indexOf("dailyPass(SETTLING_PASS)") < route.indexOf("followUnsettledOrders()"));
});
