// An order whose AUSD never came in (a price that lapsed before it was paid) is never refunded, counts against no
// ceiling, and is not listed as money the treasury holds. Real Postgres (PGlite), fake Bitrefill, treasury and relayer.

import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Hex } from "viem";
import type { BitrefillInvoice, BitrefillOperator } from "../src/bitrefill";
import { followPhoneTopUp, payPhoneTopUp, PhoneOrderError, priceGiftCard, pricePhoneTopUp, type PhoneDeps } from "../src/phone-order";
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
beforeEach(async () => {
  await db.query("DELETE FROM viky_phone_orders");
});

const PERSON = "0x1111111111111111111111111111111111111111" as Hex;
const TREASURY = "0x2222222222222222222222222222222222222222" as Hex;
const ORANGE: BitrefillOperator = { id: "orange-senegal", name: "Orange Senegal", currency: "XOF", packages: [], range: { min: 500, max: 50000, step: 1 } };

let invoiceCount = 0;

type World = { invoices: Map<string, BitrefillInvoice>; paid: bigint[]; refunds: Array<{ to: Hex; ausdUnits: bigint; nonce: Hex }>; relayed: number };

function world(overrides: Partial<PhoneDeps> = {}, price = "50"): { deps: PhoneDeps; w: World } {
  const w: World = { invoices: new Map(), paid: [], refunds: [], relayed: 0 };
  const deps: PhoneDeps = {
    operatorsFor: async () => [ORANGE],
    createInvoice: async () => {
      const invoice: BitrefillInvoice = { id: `inv-abandoned-${++invoiceCount}`, status: "unpaid", payment: { method: "usdc_base", address: "0x3333333333333333333333333333333333333333", price, currency: "USDC" }, orders: [{ id: "o", status: "created" }] };
      w.invoices.set(invoice.id, invoice);
      return invoice;
    },
    readInvoice: async (id) => w.invoices.get(id)!,
    treasuryAddress: () => TREASURY,
    treasuryCovers: async () => true,
    payInvoiceOnBase: async ({ usdcUnits }) => {
      w.paid.push(usdcUnits);
      return { hash: `0xpay${w.paid.length}` as Hex };
    },
    refundAusd: async (input) => {
      w.refunds.push(input);
      return { hash: `0xrefund${w.refunds.length}` as Hex };
    },
    heldAusd: async () => 100_000_000n,
    relayToTreasury: async (_input, onSubmitted) => {
      w.relayed += 1;
      const hash = `0xin${w.relayed}` as Hex;
      await onSubmitted?.(hash);
      return { hash };
    },
    relayLanded: async () => "landed",
    authorizationUsed: async () => false,
    store,
    giftCardById: async (id) => ({ id, name: "Boomplay", countryCode: "SN", countryName: "Senegal", currency: "XOF", packages: [{ id: `${id}<&>1959`, value: "1959" }], range: null }),
    readOrderCode: async () => undefined,
    seal: (text) => `sealed:${Buffer.from(text).toString("base64")}`,
    open: (sealed) => Buffer.from(sealed.slice("sealed:".length), "base64").toString(),
    sleep: async () => undefined,
    ...overrides,
  };
  return { deps, w };
}

const refused = (code: string) => (error: unknown) => error instanceof PhoneOrderError && error.code === code;
/** Any well-formed body: the lapsed invoice is found before the authorization is even read. */
const junk = { value: 1n, validAfter: 0n, validBefore: 9_999_999_999n, nonce: `0x${"ab".repeat(32)}` as Hex, signature: "0x00" as Hex };
const price = (deps: PhoneDeps, account: Hex = PERSON) => pricePhoneTopUp({ account, phoneNumber: "+221771234567", operatorId: ORANGE.id, value: 20000 }, deps);

/** Prices an order, lets Bitrefill move its invoice off `unpaid`, and presses pay once: the order is abandoned. */
async function lapse(deps: PhoneDeps, w: World, orderId: string, account: Hex = PERSON, status = "denied"): Promise<void> {
  const invoiceId = (await store.loadPhoneOrder(orderId))!.invoiceId;
  w.invoices.set(invoiceId, { ...w.invoices.get(invoiceId)!, status });
  await assert.rejects(payPhoneTopUp({ account, orderId, authorization: junk }, deps), refused("PRICE_EXPIRED"));
}

test("a follow of an order whose AUSD never came in sends nothing back, and says the price ran out", async () => {
  const { deps, w } = world();
  const priced = await price(deps);
  assert.equal(priced.ausdUnits, 50_000_000n);
  await lapse(deps, w, priced.orderId);
  const abandoned = await store.loadPhoneOrder(priced.orderId);
  assert.equal(abandoned?.ausdTx, null, "nothing came in");
  const followed = await followPhoneTopUp({ account: PERSON, orderId: priced.orderId }, deps).then((status) => status, (error: unknown) => error);
  assert.deepEqual(w.refunds, [], "the treasury sends nothing for an order it never received");
  assert.ok(refused("PRICE_EXPIRED")(followed), `refused as lapsed, not ${JSON.stringify(followed)}`);
  await assert.rejects(followPhoneTopUp({ account: PERSON, orderId: priced.orderId }, deps, 45_000), refused("PRICE_EXPIRED"), "and again");
  assert.deepEqual(w.refunds, []);
  assert.equal(w.relayed, 0);
  assert.equal(w.paid.length, 0);
  const row = await store.loadPhoneOrder(priced.orderId);
  assert.equal(row?.state, "failed");
  assert.equal(row?.refundTx, null);
});

test("pay pressed again on a lapsed price is refused as lapsed, never shown as money on its way back", async () => {
  const { deps, w } = world();
  const priced = await price(deps);
  await lapse(deps, w, priced.orderId);
  await assert.rejects(payPhoneTopUp({ account: PERSON, orderId: priced.orderId, authorization: junk }, deps), refused("PRICE_EXPIRED"));
  assert.equal(w.refunds.length, 0);
});

test("a gift card whose invoice expired unpaid is not refunded either", async () => {
  const { deps, w } = world();
  const priced = await priceGiftCard({ account: PERSON, productId: "boomplay-senegal", packageId: "boomplay-senegal<&>1959" }, deps);
  await lapse(deps, w, priced.orderId, PERSON, "expired");
  await assert.rejects(followPhoneTopUp({ account: PERSON, orderId: priced.orderId }, deps), refused("PRICE_EXPIRED"));
  assert.equal(w.refunds.length, 0);
});

test("a lapsed price counts against no ceiling and is not listed as money the treasury holds", async () => {
  const { deps, w } = world();
  const priced = await price(deps);
  await lapse(deps, w, priced.orderId);
  assert.deepEqual(await store.usedToday(PERSON), { items: 0, usdcUnits: 0n }, "nothing went today");
  assert.equal((await store.usedToday(undefined, undefined, "phone")).items, 0);
  assert.equal((await store.usedToday()).items, 0);
  assert.equal((await store.unsettledOrders()).some((row) => row.id === priced.orderId), false, "no money held for it");
  const again = await price(deps);
  assert.equal(again.ausdUnits, 50_000_000n, "the same person can price the day's $50 again");
});

test("five lapsed prices do not close the phone way for everybody else", async () => {
  const { deps, w } = world({}, "1");
  for (let i = 0; i < 5; i += 1) {
    const account = `0x${String(i + 5).repeat(40)}` as Hex;
    const priced = await price(deps, account);
    await lapse(deps, w, priced.orderId, account);
  }
  const honest = await price(deps);
  assert.equal(honest.ausdUnits, 1_000_000n, "not refused OVER_SERVICE_ITEMS");
  assert.equal(w.refunds.length, 0);
});

test("a failure after the AUSD came in still counts, is still listed as held, and is still refunded once", async () => {
  let refundWorks = false;
  const { deps, w } = world({
    payInvoiceOnBase: async () => {
      throw new TreasuryError("PAYMENT_FAILED", "no");
    },
    refundAusd: async (input) => {
      if (!refundWorks) throw new TreasuryError("REFUND_FAILED", "later");
      w.refunds.push(input);
      return { hash: "0xrefund" as Hex };
    },
  });
  const priced = await price(deps);
  const status = await payPhoneTopUp({ account: PERSON, orderId: priced.orderId, authorization: { ...junk, value: priced.ausdUnits } }, deps);
  assert.equal(status.state, "refund_pending");
  assert.deepEqual(await store.usedToday(PERSON), { items: 1, usdcUnits: 50_000_000n });
  assert.equal((await store.unsettledOrders()).some((row) => row.id === priced.orderId), true);
  refundWorks = true;
  assert.equal((await followPhoneTopUp({ account: PERSON, orderId: priced.orderId }, deps)).state, "refunded");
  assert.equal((await followPhoneTopUp({ account: PERSON, orderId: priced.orderId }, deps)).state, "refunded");
  assert.equal(w.refunds.length, 1);
  assert.equal(w.refunds[0].ausdUnits, 50_000_000n);
});
