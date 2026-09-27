// The phone way out, from price to top-up, against a real Postgres (PGlite) and fake Bitrefill, treasury and relayer.

import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Hex } from "viem";
import { BitrefillError, type BitrefillInvoice, type BitrefillOperator } from "../src/bitrefill";
import { followPhoneTopUp, payPhoneTopUp, PhoneOrderError, pricePhoneTopUp, refundNonce, type PhoneDeps } from "../src/phone-order";
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
const ORANGE: BitrefillOperator = { id: "orange-senegal", name: "Orange Senegal", currency: "XOF", packages: [], range: { min: 500, max: 50000, step: 1, priceRate: 0.0019 } };

let invoiceCount = 0;

type World = { invoices: Map<string, BitrefillInvoice>; paid: bigint[]; refunds: Array<{ to: Hex; ausdUnits: bigint; nonce: Hex }>; relayed: number; held: bigint; covers: boolean };

function world(overrides: Partial<PhoneDeps> = {}, price = "3.812346"): { deps: PhoneDeps; w: World } {
  const w: World = { invoices: new Map(), paid: [], refunds: [], relayed: 0, held: 100_000_000n, covers: true };
  const deps: PhoneDeps = {
    operatorsFor: async () => [ORANGE],
    createInvoice: async () => {
      const invoice: BitrefillInvoice = { id: `inv-${++invoiceCount}`, status: "unpaid", payment: { method: "usdc_base", address: "0x3333333333333333333333333333333333333333", price, currency: "USDC" }, orders: [{ id: "o", status: "created" }] };
      w.invoices.set(invoice.id, invoice);
      return invoice;
    },
    readInvoice: async (id) => w.invoices.get(id)!,
    treasuryAddress: () => TREASURY,
    treasuryCovers: async () => w.covers,
    payInvoiceOnBase: async ({ usdcUnits }) => {
      w.paid.push(usdcUnits);
      for (const [id, invoice] of w.invoices) if (invoice.status === "unpaid") w.invoices.set(id, { ...invoice, status: "complete", orders: [{ id: "o", status: "delivered" }] });
      return { hash: `0xpay${w.paid.length}` as Hex };
    },
    refundAusd: async (input) => {
      w.refunds.push(input);
      return { hash: `0xrefund${w.refunds.length}` as Hex };
    },
    heldAusd: async () => w.held,
    relayToTreasury: async (_input, onSubmitted) => {
      w.relayed += 1;
      const hash = `0xin${w.relayed}` as Hex;
      await onSubmitted?.(hash);
      return { hash };
    },
    relayLanded: async () => "landed",
    authorizationUsed: async () => false,
    store,
    giftCardById: async (id) => ({ id, name: id === "boomplay-senegal" ? "Boomplay" : "Amazon.fr", countryCode: "SN", countryName: "Senegal", currency: "XOF", packages: [{ id: `${id}<&>1959`, value: "1959", priceUsd: 3.5 }], range: null }),
    readOrderCode: async () => ({ code: "BOOM-1234-CODE", instructions: "Open Boomplay and redeem" }),
    seal: (text) => `sealed:${Buffer.from(text).toString("base64")}`,
    open: (sealed) => Buffer.from(sealed.slice("sealed:".length), "base64").toString(),
    sleep: async () => undefined,
    ...overrides,
  };
  return { deps, w };
}

const refused = (code: string) => (error: unknown) => error instanceof PhoneOrderError && error.code === code;
const authorization = (value: bigint) => ({ value, validAfter: 0n, validBefore: 9_999_999_999n, nonce: `0x${"cd".repeat(32)}` as Hex, signature: "0x00" as Hex });
const price = (deps: PhoneDeps, value = 2000) => pricePhoneTopUp({ account: PERSON, phoneNumber: "+221771234567", operatorId: ORANGE.id, value }, deps);

test("a price is written down and moves nothing", async () => {
  const { deps, w } = world();
  const priced = await price(deps);
  assert.equal(priced.ausdUnits, 3_812_346n);
  assert.equal(priced.to, TREASURY);
  assert.equal(priced.localCurrency, "XOF");
  assert.equal(w.relayed, 0);
  assert.equal(w.paid.length, 0);
  assert.equal((await store.loadPhoneOrder(priced.orderId))?.state, "priced");
});

test("every ceiling refuses by name, with the figure in the sentence, before anything moves", async () => {
  await assert.rejects(price(world({}, "50.000001").deps), (error: unknown) => refused("OVER_ORDER")(error) && /\$50\.00/.test((error as Error).message));
  const { deps } = world({}, "30");
  const first = await price(deps);
  await payPhoneTopUp({ account: PERSON, orderId: first.orderId, authorization: authorization(30_000_000n) }, deps);
  await assert.rejects(price(deps), (error: unknown) => refused("OVER_PERSON_DAY")(error) && /\$50\.00 a day.*\$30\.00 already/.test((error as Error).message));
  await db.query("DELETE FROM viky_phone_orders");
  const many = world({}, "1").deps;
  for (let i = 0; i < 5; i += 1) {
    const order = await pricePhoneTopUp({ account: `0x${String(i + 5).repeat(40)}` as Hex, phoneNumber: "+221771234567", operatorId: ORANGE.id, value: 500 }, many);
    await payPhoneTopUp({ account: `0x${String(i + 5).repeat(40)}` as Hex, orderId: order.orderId, authorization: authorization(1_000_000n) }, many);
  }
  await assert.rejects(price(many), (error: unknown) => refused("OVER_SERVICE_ITEMS")(error) && /5 top-ups a day/.test((error as Error).message));
  await db.query("DELETE FROM viky_phone_orders");
  const poor = world();
  poor.w.held = 1n;
  await assert.rejects(price(poor.deps), refused("NOT_ENOUGH"));
  const empty = world();
  empty.w.covers = false;
  await assert.rejects(price(empty.deps), refused("TREASURY_SHORT"));
  await assert.rejects(price(world({ operatorsFor: async () => { throw new BitrefillError("COUNTRY_NOT_SERVED", "none"); } }).deps), refused("COUNTRY_NOT_SERVED"));
  await assert.rejects(price(world({ treasuryAddress: () => { throw new TreasuryError("NOT_CONFIGURED", "no"); } }).deps), refused("NOT_CONFIGURED"));
});

test("paid: the person's AUSD goes to the treasury, the invoice is paid once, the top-up delivered, the number erased", async () => {
  const { deps, w } = world();
  const priced = await price(deps);
  const status = await payPhoneTopUp({ account: PERSON, orderId: priced.orderId, authorization: authorization(priced.ausdUnits) }, deps);
  assert.equal(status.state, "delivered");
  assert.equal(status.amount, "$3.81");
  assert.deepEqual(w.paid, [3_812_346n]);
  const row = await store.loadPhoneOrder(priced.orderId);
  assert.equal(row?.phoneNumber, null);
  assert.equal(row?.ausdTx, "0xin1");
  assert.equal(row?.paymentTx, "0xpay1");
  const again = await payPhoneTopUp({ account: PERSON, orderId: priced.orderId, authorization: authorization(priced.ausdUnits) }, deps);
  assert.equal(again.state, "delivered");
  assert.equal(w.relayed, 1, "a second tap moves nothing");
  assert.equal(w.paid.length, 1);
});

test("nothing moves on a wrong amount, a lapsed price, or somebody else's order", async () => {
  const { deps, w } = world();
  const priced = await price(deps);
  await assert.rejects(payPhoneTopUp({ account: PERSON, orderId: priced.orderId, authorization: authorization(priced.ausdUnits + 1n) }, deps), refused("INVALID_AUTHORIZATION"));
  await assert.rejects(payPhoneTopUp({ account: TREASURY, orderId: priced.orderId, authorization: authorization(priced.ausdUnits) }, deps), refused("NOT_YOURS"));
  const invoiceId = (await store.loadPhoneOrder(priced.orderId))!.invoiceId;
  w.invoices.set(invoiceId, { ...w.invoices.get(invoiceId)!, status: "denied" });
  await assert.rejects(payPhoneTopUp({ account: PERSON, orderId: priced.orderId, authorization: authorization(priced.ausdUnits) }, deps), refused("PRICE_EXPIRED"));
  assert.equal(w.relayed, 0);
  assert.equal((await store.loadPhoneOrder(priced.orderId))?.phoneNumber, null, "a lapsed price keeps nothing of the number");
});

test("a failure after the money arrived sends it back, once, with the order's own nonce", async () => {
  const { deps, w } = world({ payInvoiceOnBase: async () => { throw new TreasuryError("PAYMENT_FAILED", "no"); } });
  const priced = await price(deps);
  const status = await payPhoneTopUp({ account: PERSON, orderId: priced.orderId, authorization: authorization(priced.ausdUnits) }, deps);
  assert.equal(status.state, "refunded");
  assert.deepEqual(w.refunds, [{ to: PERSON, ausdUnits: priced.ausdUnits, nonce: refundNonce(priced.orderId) }]);
  assert.equal((await followPhoneTopUp({ account: PERSON, orderId: priced.orderId }, deps)).state, "refunded");
  assert.equal(w.refunds.length, 1, "never twice");
});

test("Bitrefill failing after the payment refunds, and a refund that could not be sent is tried again", async () => {
  let refundWorks = false;
  const { deps, w } = world({
    payInvoiceOnBase: async () => {
      for (const [id, invoice] of w.invoices) w.invoices.set(id, { ...invoice, status: "complete", orders: [{ id: "o", status: "failed" }] });
      return { hash: "0xpay" as Hex };
    },
    refundAusd: async (input) => {
      if (!refundWorks) throw new TreasuryError("REFUND_FAILED", "later");
      w.refunds.push(input);
      return { hash: "0xrefund" as Hex };
    },
  });
  const priced = await price(deps);
  assert.equal((await payPhoneTopUp({ account: PERSON, orderId: priced.orderId, authorization: authorization(priced.ausdUnits) }, deps)).state, "refund_pending");
  refundWorks = true;
  assert.equal((await followPhoneTopUp({ account: PERSON, orderId: priced.orderId }, deps)).state, "refunded");
  assert.equal(w.refunds.length, 1);
});

test("a relay that failed after it was sent is read from its own transaction, and an unconfirmed payment is followed, not refunded", async () => {
  const { deps, w } = world({
    relayToTreasury: async (_input, onSubmitted) => {
      await onSubmitted?.("0xrelayed" as Hex);
      throw new Error("finality timed out");
    },
    relayLanded: async () => "landed",
    payInvoiceOnBase: async () => {
      for (const [id, invoice] of w.invoices) w.invoices.set(id, { ...invoice, status: "complete", orders: [{ id: "o", status: "delivered" }] });
      throw new TreasuryError("PAYMENT_UNCONFIRMED", "later", { hash: "0xslow" as Hex });
    },
  });
  const priced = await price(deps);
  const status = await payPhoneTopUp({ account: PERSON, orderId: priced.orderId, authorization: authorization(priced.ausdUnits) }, deps);
  assert.equal(status.state, "delivered");
  assert.equal(w.refunds.length, 0);
  const row = await store.loadPhoneOrder(priced.orderId);
  assert.equal(row?.ausdTx, "0xrelayed");
  assert.equal(row?.paymentTx, "0xslow");
  const refusedRelay = world({ relayToTreasury: async () => { throw new Error("reverted"); } });
  const other = await price(refusedRelay.deps);
  await assert.rejects(payPhoneTopUp({ account: PERSON, orderId: other.orderId, authorization: authorization(other.ausdUnits) }, refusedRelay.deps), refused("INVALID_AUTHORIZATION"));
});

test("credit or data is read from Bitrefill's own product name", async () => {
  const { phoneKindOf } = await import("../src/client/phone");
  assert.equal(phoneKindOf({ id: "orange-senegal", name: "Orange Senegal" }), "credit");
  assert.equal(phoneKindOf({ id: "orange-data-senegal", name: "Orange Data Senegal" }), "data");
  assert.equal(phoneKindOf({ id: "orange-senegal-bundles", name: "Orange Senegal Bundles" }), "data");
  assert.equal(phoneKindOf({ id: "tigo-freedata-senegal", name: "Tigo Free Data Senegal" }), "data");
  assert.equal(phoneKindOf({ id: "expresso-senegal", name: "Expresso Senegal" }), "credit");
});

test("a gift card is priced like a top-up, and its code is sealed at rest and opened for its owner alone", async () => {
  const { priceGiftCard } = await import("../src/phone-order");
  const { deps } = world();
  const priced = await priceGiftCard({ account: PERSON, productId: "boomplay-senegal", packageId: "boomplay-senegal<&>1959" }, deps);
  assert.equal(priced.localAmount, "1959");
  assert.equal((await store.loadPhoneOrder(priced.orderId))?.phoneNumber, null, "no number for a gift card");
  const status = await payPhoneTopUp({ account: PERSON, orderId: priced.orderId, authorization: authorization(priced.ausdUnits) }, deps);
  assert.equal(status.kind, "gift_card");
  assert.equal(status.state, "delivered");
  assert.deepEqual(status.code, { code: "BOOM-1234-CODE", instructions: "Open Boomplay and redeem" });
  const row = await store.loadPhoneOrder(priced.orderId);
  assert.ok(row?.codeSealed?.startsWith("sealed:"), "never at rest in the clear");
  assert.ok(!String(row?.codeSealed).includes("BOOM-1234-CODE"));
  await assert.rejects(followPhoneTopUp({ account: TREASURY, orderId: priced.orderId }, deps), refused("NOT_YOURS"));
  assert.equal((await store.giftCardsOf(PERSON)).length, 1, "in its owner's history");
});

test("a gift card delivered before its code could be read is on its way until the code is there", async () => {
  const { priceGiftCard } = await import("../src/phone-order");
  let codeReady = false;
  const { deps } = world({ readOrderCode: async () => (codeReady ? { code: "LATE-CODE" } : undefined) });
  const priced = await priceGiftCard({ account: PERSON, productId: "boomplay-senegal", packageId: "boomplay-senegal<&>1959" }, deps);
  const first = await payPhoneTopUp({ account: PERSON, orderId: priced.orderId, authorization: authorization(priced.ausdUnits) }, deps);
  assert.equal(first.state, "on_its_way");
  codeReady = true;
  const later = await followPhoneTopUp({ account: PERSON, orderId: priced.orderId }, deps);
  assert.equal(later.state, "delivered");
  assert.equal(later.code?.code, "LATE-CODE");
});

test("the list puts the country's own cards first, then Bitrefill's own, then the rest, and says where each works in Bitrefill's words", async () => {
  const { orderGiftCards, worksIn } = await import("../src/bitrefill");
  const card = (id: string, name: string, countryCode: string, countryName: string, currency: string) => ({ id, name, countryCode, countryName, currency, packages: [], range: null });
  const listed = [card("disney-usa", "Disney USD International", "US", "United States", "USD"), card("bitrefill-giftcard-usd", "Bitrefill Gift Card (USD)", "", "International", "USD"), card("boomplay-senegal", "Boomplay", "SN", "Senegal", "XOF"), card("amazon-fr", "Amazon.fr", "FR", "France", "EUR")];
  assert.deepEqual(orderGiftCards(listed, "SN", "XOF").map((one) => one.id), ["boomplay-senegal", "bitrefill-giftcard-usd", "disney-usa", "amazon-fr"]);
  assert.deepEqual(orderGiftCards(listed, "CI", "XOF").map((one) => one.id), ["boomplay-senegal", "amazon-fr", "bitrefill-giftcard-usd", "disney-usa"], "the founder's Amazon.fr for Ivory Coast, and XOF cards");
  assert.equal(worksIn(listed[2]), "Works in: Senegal");
});

test("a gift card code in either of Bitrefill's two documented shapes", async () => {
  const { giftCardCodeOf } = await import("../src/bitrefill");
  assert.deepEqual(giftCardCodeOf({ code: "ABCD", pin: "12", expiration_date: "2027-01-01" }), { code: "ABCD", link: undefined, pin: "12", instructions: undefined, expires: "2027-01-01" });
  assert.deepEqual(giftCardCodeOf("Go to example.com and paste ABCD"), { instructions: "Go to example.com and paste ABCD" });
  assert.equal(giftCardCodeOf({}), undefined);
  assert.equal(giftCardCodeOf(null), undefined);
});

test("a data top-up is written as data, and the judges' count tells credit, data and gift cards apart", async () => {
  const { deps } = world({ operatorsFor: async () => [{ ...ORANGE, id: "orange-data-senegal", name: "Orange Data Senegal" }] });
  const priced = await pricePhoneTopUp({ account: PERSON, phoneNumber: "+221771234567", operatorId: "orange-data-senegal", value: 2000 }, deps);
  assert.equal((await store.loadPhoneOrder(priced.orderId))?.kind, "data");
  await payPhoneTopUp({ account: PERSON, orderId: priced.orderId, authorization: authorization(priced.ausdUnits) }, deps);
  const counts = await store.usesDelivered();
  assert.equal(counts?.data, 1);
  assert.equal((await store.usedToday(undefined, undefined, "phone")).items, 1, "a data top-up is a phone item to Bitrefill's limits");
});
