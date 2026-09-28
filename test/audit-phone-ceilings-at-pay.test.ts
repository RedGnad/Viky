// The day's ceilings hold when the person pays, not only when a price is given (the money path audit of 27 Sep 2026):
// a price moves nothing and does not count, so two prices in a row both passed and were paid past $50 a day.

import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Hex } from "viem";
import type { BitrefillInvoice } from "../src/bitrefill";
import { payPhoneTopUp, PhoneOrderError, pricePhoneTopUp, type PhoneDeps } from "../src/phone-order";
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

function world(price = "30"): { deps: PhoneDeps; relayed: () => number } {
  const invoices = new Map<string, BitrefillInvoice>();
  let relayed = 0;
  const deps: PhoneDeps = {
    operatorsFor: async () => [{ id: "orange-senegal", name: "Orange Senegal", currency: "XOF", packages: [], range: { min: 500, max: 50000, step: 1 } }],
    createInvoice: async () => {
      const id = ++count;
      const invoice: BitrefillInvoice = { id: `inv-${id}`, status: "unpaid", payment: { method: "usdc_base", address: `0x${id.toString(16).padStart(40, "3")}`, price, currency: "USDC" }, orders: [{ id: "o", status: "created" }] };
      invoices.set(invoice.id, invoice);
      return invoice;
    },
    readInvoice: async (id) => invoices.get(id)!,
    treasuryAddress: () => "0x2222222222222222222222222222222222222222",
    treasuryCovers: async () => true,
    payInvoiceOnBase: async ({ to }) => {
      for (const [id, invoice] of invoices) if (invoice.payment.address === to && invoice.status === "unpaid") invoices.set(id, { ...invoice, status: "complete", orders: [{ id: "o", status: "delivered" }] });
      return { hash: `0xpay${++count}` as Hex };
    },
    refundAusd: async () => ({ hash: `0xrefund${++count}` as Hex }),
    heldAusd: async () => 1_000_000_000n,
    relayToTreasury: async (_input, onSubmitted) => {
      relayed += 1;
      const hash = `0xin${++count}` as Hex;
      await onSubmitted?.(hash);
      return { hash };
    },
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
  return { deps, relayed: () => relayed };
}

const signed = (value: bigint, nonce: string) => ({ value, validAfter: 0n, validBefore: 9_999_999_999n, nonce: `0x${nonce.repeat(32)}` as Hex, signature: "0x00" as Hex });

test("two $30 prices in a row both pass, and the second is refused when paid, before any money moves", async () => {
  const { deps, relayed } = world();
  const first = await pricePhoneTopUp({ account: PERSON, phoneNumber: "+221771234567", operatorId: "orange-senegal", value: 15000 }, deps);
  const second = await pricePhoneTopUp({ account: PERSON, phoneNumber: "+221771234567", operatorId: "orange-senegal", value: 15000 }, deps);
  await payPhoneTopUp({ account: PERSON, orderId: first.orderId, authorization: signed(first.ausdUnits, "a1") }, deps);
  await assert.rejects(
    payPhoneTopUp({ account: PERSON, orderId: second.orderId, authorization: signed(second.ausdUnits, "b2") }, deps),
    (error: unknown) => error instanceof PhoneOrderError && error.code === "OVER_PERSON_DAY",
  );
  assert.equal(relayed(), 1, "the second order's money never moved");
  assert.equal((await store.loadPhoneOrder(second.orderId))?.state, "priced");
});

test("five orders a day for everybody together, top-ups and gift cards alike: the sixth is refused before money moves", async () => {
  const { deps: small, relayed } = world("5");
  const people = ["0x1000000000000000000000000000000000000001", "0x1000000000000000000000000000000000000002", "0x1000000000000000000000000000000000000003", "0x1000000000000000000000000000000000000004", "0x1000000000000000000000000000000000000005", "0x1000000000000000000000000000000000000006"] as Hex[];
  // Six prices first: a price moves nothing and counts for nothing, so all six pass.
  const prices = [];
  for (const person of people) prices.push(await pricePhoneTopUp({ account: person, phoneNumber: "+221771234567", operatorId: "orange-senegal", value: 2500 }, small));
  for (const [index, person] of people.entries()) {
    const paying = payPhoneTopUp({ account: person, orderId: prices[index].orderId, authorization: signed(prices[index].ausdUnits, `c${index}`) }, small);
    if (index < 5) await paying;
    else await assert.rejects(paying, (error: unknown) => error instanceof PhoneOrderError && error.code === "OVER_SERVICE_ITEMS");
  }
  assert.equal(relayed(), 5);
});
