// A Base payment that went out is never followed by an AUSD refund because the database write after it failed (the
// money path audit of 27 Sep 2026): the order stays on its way, the hash is in the log, and nothing goes back.

import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Hex } from "viem";
import type { BitrefillInvoice } from "../src/bitrefill";
import { payPhoneTopUp, pricePhoneTopUp, type PhoneDeps } from "../src/phone-order";
import * as store from "../src/phone-order-store";
import { TreasuryError } from "../src/phone-treasury";
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

const PERSON = "0x1111111111111111111111111111111111111111" as Hex;
let invoiceCount = 0;

function deps(payment: () => Promise<{ hash: Hex }>, refunds: unknown[]): PhoneDeps {
  const invoices = new Map<string, BitrefillInvoice>();
  return {
    operatorsFor: async () => [{ id: "orange-senegal", name: "Orange Senegal", currency: "XOF", packages: [], range: { min: 500, max: 50000, step: 1, priceRate: 0.0019 } }],
    createInvoice: async () => {
      const invoice: BitrefillInvoice = { id: `inv-${++invoiceCount}`, status: "unpaid", payment: { method: "usdc_base", address: "0x3333333333333333333333333333333333333333", price: "3.812346", currency: "USDC" }, orders: [{ id: "o", status: "created" }] };
      invoices.set(invoice.id, invoice);
      return invoice;
    },
    readInvoice: async (id) => invoices.get(id)!,
    treasuryAddress: () => "0x2222222222222222222222222222222222222222",
    treasuryCovers: async () => true,
    payInvoiceOnBase: payment,
    refundAusd: async (input) => {
      refunds.push(input);
      return { hash: "0xrefund" as Hex };
    },
    heldAusd: async () => 100_000_000n,
    relayToTreasury: async (_input, onSubmitted) => {
      await onSubmitted?.(`0xin${invoiceCount}` as Hex);
      return { hash: `0xin${invoiceCount}` as Hex };
    },
    relayLanded: async () => "landed",
    authorizationUsed: async () => false,
    store: {
      ...store,
      markPaid: async () => {
        throw new Error("database timed out");
      },
    },
    giftCardById: async () => {
      throw new Error("none");
    },
    readOrderCode: async () => undefined,
    seal: (text) => text,
    open: (sealed) => sealed,
    sleep: async () => undefined,
  };
}

for (const [name, payment] of [
  ["confirmed", async () => ({ hash: "0xpaid" as Hex })],
  ["sent and not confirmed yet", async () => Promise.reject(new TreasuryError("PAYMENT_UNCONFIRMED", "later", { hash: "0xslow" as Hex }))],
] as const) {
  test(`a payment ${name} whose record failed is never refunded`, async () => {
    const refunds: unknown[] = [];
    const d = deps(payment, refunds);
    const priced = await pricePhoneTopUp({ account: PERSON, phoneNumber: "+221771234567", operatorId: "orange-senegal", value: 2000 }, d);
    const status = await payPhoneTopUp({ account: PERSON, orderId: priced.orderId, authorization: { value: priced.ausdUnits, validAfter: 0n, validBefore: 9_999_999_999n, nonce: `0x${"ab".repeat(32)}`, signature: "0x00" } }, d);
    assert.equal(status.state, "on_its_way");
    assert.equal(refunds.length, 0, "the treasury paid Bitrefill: the AUSD is not sent back as well");
    assert.equal((await store.loadPhoneOrder(priced.orderId))?.state, "received");
  });
}
