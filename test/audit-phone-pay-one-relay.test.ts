// One order is paid by one relay, read from its own transaction (the money path audit of 27 Sep 2026): a nonce the
// person used elsewhere is not money received, a second authorization for the same order is never carried, and a
// write that failed after the relay is settled from the recorded hash, not by taking the money again.

import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Hex } from "viem";
import type { BitrefillInvoice, BitrefillOperator } from "../src/bitrefill";
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
const ORANGE: BitrefillOperator = { id: "orange-senegal", name: "Orange Senegal", currency: "XOF", packages: [], range: { min: 500, max: 50000, step: 1 } };

type World = { invoices: Map<string, BitrefillInvoice>; paid: number; relayed: number; landed: "landed" | "reverted" | "unknown"; used: boolean };

function world(overrides: Partial<PhoneDeps> = {}): { deps: PhoneDeps; w: World } {
  const w: World = { invoices: new Map(), paid: 0, relayed: 0, landed: "landed", used: false };
  const deps: PhoneDeps = {
    operatorsFor: async () => [ORANGE],
    createInvoice: async () => {
      const invoice: BitrefillInvoice = { id: `inv-${w.invoices.size + 1}-${Math.random()}`, status: "unpaid", payment: { method: "usdc_base", address: "0x3333333333333333333333333333333333333333", price: "3.812346", currency: "USDC" }, orders: [{ id: "o", status: "created" }] };
      w.invoices.set(invoice.id, invoice);
      return invoice;
    },
    readInvoice: async (id) => w.invoices.get(id)!,
    treasuryAddress: () => "0x2222222222222222222222222222222222222222",
    treasuryCovers: async () => true,
    payInvoiceOnBase: async () => {
      w.paid += 1;
      for (const [id, invoice] of w.invoices) if (invoice.status === "unpaid") w.invoices.set(id, { ...invoice, status: "complete", orders: [{ id: "o", status: "delivered" }] });
      return { hash: `0xpay${w.paid}` as Hex };
    },
    refundAusd: async () => ({ hash: "0xrefund" as Hex }),
    heldAusd: async () => 100_000_000n,
    relayToTreasury: async (_input, onSubmitted) => {
      w.relayed += 1;
      const hash = `0xin${w.relayed}` as Hex;
      await onSubmitted?.(hash);
      return { hash };
    },
    relayLanded: async () => w.landed,
    authorizationUsed: async () => w.used,
    store,
    giftCardById: async () => {
      throw new Error("no gift cards here");
    },
    readOrderCode: async () => undefined,
    seal: (text) => text,
    open: (sealed) => sealed,
    sleep: async () => undefined,
    ...overrides,
  };
  return { deps, w };
}

const refused = (code: string) => (error: unknown) => error instanceof PhoneOrderError && error.code === code;
const signed = (value: bigint, nonce: string) => ({ value, validAfter: 0n, validBefore: 9_999_999_999n, nonce: `0x${nonce.repeat(32)}` as Hex, signature: "0x00" as Hex });
const price = (deps: PhoneDeps) => pricePhoneTopUp({ account: PERSON, phoneNumber: "+221771234567", operatorId: ORANGE.id, value: 2000 }, deps);

test("a nonce the person used elsewhere is not money received: nothing is paid and the order is free again", async () => {
  // The relay is refused before it is sent (the simulation), and the token says the nonce is used: by another transfer.
  const { deps, w } = world({ relayToTreasury: async () => { throw new Error("authorization is used"); } });
  w.used = true;
  const priced = await price(deps);
  await assert.rejects(payPhoneTopUp({ account: PERSON, orderId: priced.orderId, authorization: signed(priced.ausdUnits, "ab") }, deps), refused("INVALID_AUTHORIZATION"));
  assert.equal(w.paid, 0, "the treasury pays nothing for money it never received");
  const row = await store.loadPhoneOrder(priced.orderId);
  assert.equal(row?.state, "priced");
  assert.equal(row?.relayTx, null, "the claim is given back: nothing was sent");
});

test("a second authorization for the same order is never carried, and the first settles it once final", async () => {
  const { deps, w } = world({
    relayToTreasury: async (_input, onSubmitted) => {
      w.relayed += 1;
      await onSubmitted?.(`0xin${w.relayed}` as Hex);
      throw new Error("finality timed out");
    },
  });
  w.landed = "unknown";
  const priced = await price(deps);
  await assert.rejects(payPhoneTopUp({ account: PERSON, orderId: priced.orderId, authorization: signed(priced.ausdUnits, "a1") }, deps), refused("PAYMENT_CONFIRMING"));
  await assert.rejects(payPhoneTopUp({ account: PERSON, orderId: priced.orderId, authorization: signed(priced.ausdUnits, "b2") }, deps), refused("PAYMENT_CONFIRMING"));
  assert.equal(w.relayed, 1, "the second press carried nothing");
  w.landed = "landed";
  const status = await payPhoneTopUp({ account: PERSON, orderId: priced.orderId, authorization: signed(priced.ausdUnits, "c3") }, deps);
  assert.equal(status.state, "delivered");
  assert.equal(w.relayed, 1);
  assert.equal(w.paid, 1);
  assert.equal((await store.loadPhoneOrder(priced.orderId))?.ausdTx, "0xin1");
});

test("a write that failed after the relay is settled from the recorded hash, not by taking the money again", async () => {
  let failOnce = true;
  const { deps, w } = world({
    store: {
      ...store,
      markReceived: async (id: string, tx: string) => {
        if (failOnce) {
          failOnce = false;
          throw new Error("database timed out");
        }
        return store.markReceived(id, tx);
      },
    },
  });
  const priced = await price(deps);
  await assert.rejects(payPhoneTopUp({ account: PERSON, orderId: priced.orderId, authorization: signed(priced.ausdUnits, "d4") }, deps));
  const status = await payPhoneTopUp({ account: PERSON, orderId: priced.orderId, authorization: signed(priced.ausdUnits, "e5") }, deps);
  assert.equal(status.state, "delivered");
  assert.equal(w.relayed, 1, "the person's money moved once");
  assert.equal(w.paid, 1);
});

test("two presses at once carry one relay", async () => {
  const { deps, w } = world({
    relayToTreasury: async (_input, onSubmitted) => {
      w.relayed += 1;
      const hash = `0xin${w.relayed}` as Hex;
      await new Promise((resolve) => setTimeout(resolve, 20));
      await onSubmitted?.(hash);
      return { hash };
    },
  });
  const priced = await price(deps);
  await Promise.allSettled([
    payPhoneTopUp({ account: PERSON, orderId: priced.orderId, authorization: signed(priced.ausdUnits, "f6") }, deps),
    payPhoneTopUp({ account: PERSON, orderId: priced.orderId, authorization: signed(priced.ausdUnits, "a7") }, deps),
  ]);
  assert.equal(w.relayed, 1);
  assert.equal(w.paid, 1);
});

test("a relay that reverted moved nothing: the order is free again and a new press pays it", async () => {
  let revert = true;
  const { deps, w } = world({
    relayToTreasury: async (_input, onSubmitted) => {
      w.relayed += 1;
      const hash = `0xin${w.relayed}` as Hex;
      await onSubmitted?.(hash);
      if (revert) throw new Error("reverted");
      return { hash };
    },
  });
  w.landed = "reverted";
  const priced = await price(deps);
  await assert.rejects(payPhoneTopUp({ account: PERSON, orderId: priced.orderId, authorization: signed(priced.ausdUnits, "b8") }, deps), refused("INVALID_AUTHORIZATION"));
  assert.equal((await store.loadPhoneOrder(priced.orderId))?.relayTx, null);
  revert = false;
  w.landed = "landed";
  assert.equal((await payPhoneTopUp({ account: PERSON, orderId: priced.orderId, authorization: signed(priced.ausdUnits, "c9") }, deps)).state, "delivered");
  assert.equal(w.paid, 1);
});

test("a claim left pending by a request that stopped is taken again only once its authorization is known unused", async () => {
  const { deps, w } = world();
  const priced = await price(deps);
  await db.query(`UPDATE viky_phone_orders SET relay_tx = 'pending:0x${"99".repeat(32)}', updated_at = now() - interval '10 minutes' WHERE id = $1`, [priced.orderId]);
  w.used = true;
  await assert.rejects(payPhoneTopUp({ account: PERSON, orderId: priced.orderId, authorization: signed(priced.ausdUnits, "d1") }, deps), refused("PAYMENT_CONFIRMING"));
  assert.equal(w.relayed, 0);
  w.used = false;
  assert.equal((await payPhoneTopUp({ account: PERSON, orderId: priced.orderId, authorization: signed(priced.ausdUnits, "e2") }, deps)).state, "delivered");
  assert.equal(w.relayed, 1);
});
