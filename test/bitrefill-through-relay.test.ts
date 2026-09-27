// A phone or gift card order paid with the person's own AUSD through Relay, with no float (the founder, 28 Sep 2026):
// the price includes Relay's fee and says so, the treasury passes the order's AUSD to Relay's strict deposit address,
// and every failure either never sent it or sends it back.

import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Hex } from "viem";
import type { BitrefillInvoice } from "../src/bitrefill";
import { bridgeNonce, followPhoneTopUp, payPhoneTopUp, PhoneOrderError, pricePhoneTopUp, type PhoneDeps } from "../src/phone-order";
import * as store from "../src/phone-order-store";
import type { SqlExecutor } from "../src/proof-session-store";
import { BASE_USDC, quoteAusdToBaseUsdc } from "../src/relay-bridge";
import { PHONE_OUT } from "../src/sentences";

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
const DEPOSIT = "0x3547C74e631e61895CAADF8B90542AEeCC2FA9C0" as Hex;
const PAY_TO = "0x4444444444444444444444444444444444444444";
let count = 0;

function world(over: Partial<PhoneDeps> = {}) {
  const invoices = new Map<string, BitrefillInvoice>();
  const w = { paidOnBase: 0, toBridge: [] as Array<{ to: Hex; ausdUnits: bigint; nonce: Hex }>, refunds: [] as unknown[], relayed: 0, used: false as boolean | null, bridge: "pending" as const as string };
  const deps: PhoneDeps = {
    operatorsFor: async () => [{ id: "orange-senegal", name: "Orange Senegal", currency: "XOF", packages: [], range: { min: 500, max: 50000, step: 1, priceRate: 0.0019 } }],
    createInvoice: async () => {
      const invoice: BitrefillInvoice = { id: `inv-${++count}`, status: "unpaid", payment: { method: "usdc_base", address: PAY_TO, price: "1", currency: "USDC" }, orders: [{ id: "o", status: "created" }] };
      invoices.set(invoice.id, invoice);
      return invoice;
    },
    readInvoice: async (id) => invoices.get(id)!,
    treasuryAddress: () => TREASURY,
    // No float on Base: the Relay path must not need one.
    treasuryCovers: async () => false,
    payInvoiceOnBase: async () => {
      w.paidOnBase += 1;
      return { hash: "0xbase" as Hex };
    },
    refundAusd: async (input) => {
      w.refunds.push(input);
      return { hash: `0xrefund${++count}` as Hex };
    },
    heldAusd: async () => 100_000_000n,
    relayToTreasury: async (_input, onSubmitted) => {
      w.relayed += 1;
      const hash = `0xin${++count}` as Hex;
      await onSubmitted?.(hash);
      return { hash };
    },
    relayLanded: async () => "landed",
    authorizationUsed: async () => {
      if (w.used === null) throw new Error("the token did not answer");
      return w.used;
    },
    store,
    giftCardById: async () => {
      throw new Error("none");
    },
    readOrderCode: async () => undefined,
    seal: (text) => text,
    open: (sealed) => sealed,
    sleep: async () => undefined,
    quoteBridge: async ({ usdcUnits, payTo, treasury }) => {
      assert.equal(payTo, PAY_TO, "Relay pays Bitrefill's own address");
      assert.equal(treasury, TREASURY, "refunds come back to the treasury");
      return { depositAddress: DEPOSIT, ausdUnits: usdcUnits + 26_300n, requestId: "0xrequest" };
    },
    sendToBridge: async (input) => {
      w.toBridge.push(input);
      // Relay fills at once: Bitrefill sees its invoice paid.
      for (const [id, invoice] of invoices) if (invoice.status === "unpaid") invoices.set(id, { ...invoice, status: "complete", orders: [{ id: "o", status: "delivered" }] });
      return { hash: "0xbridge" as Hex };
    },
    bridgeStatus: async () => w.bridge as "pending",
    ...over,
  };
  return { deps, w, invoices };
}

const price = (deps: PhoneDeps) => pricePhoneTopUp({ account: PERSON, phoneNumber: "+221771234567", operatorId: "orange-senegal", value: 550 }, deps);
const signed = (value: bigint, nonce: string) => ({ value, validAfter: 0n, validBefore: 9_999_999_999n, nonce: `0x${nonce.repeat(32)}` as Hex, signature: "0x00" as Hex });

test("the price is the invoice plus Relay's fee, said as a fee, and needs no float", async () => {
  const { deps } = world();
  const priced = await price(deps);
  assert.equal(priced.ausdUnits, 1_026_300n);
  assert.equal(priced.feeUnits, 26_300n);
  const row = await store.loadPhoneOrder(priced.orderId);
  assert.equal(row?.bridgeTo, DEPOSIT);
  assert.equal(row?.usdcUnits, 1_000_000n);
  assert.equal(PHONE_OUT.costs("$1.03", "$98.97", "$0.03"), "It takes $1.03, including $0.03 in fees, and $98.97 stays with you.");
});

test("paid: the person's AUSD reaches the treasury, which passes exactly it to Relay under the order's nonce, and nothing is paid from Base", async () => {
  const { deps, w } = world();
  const priced = await price(deps);
  const status = await payPhoneTopUp({ account: PERSON, orderId: priced.orderId, authorization: signed(priced.ausdUnits, "a1") }, deps);
  assert.equal(status.state, "delivered");
  assert.equal(w.paidOnBase, 0);
  assert.deepEqual(w.toBridge, [{ to: DEPOSIT, ausdUnits: 1_026_300n, nonce: bridgeNonce(priced.orderId) }]);
  assert.equal(w.refunds.length, 0);
});

test("a transfer to Relay that failed: refunded when the token shows it never went, never refunded when it went", async () => {
  const failing = { sendToBridge: async () => { throw new Error("finality timed out"); } };
  const never = world(failing);
  never.w.used = false;
  const one = await price(never.deps);
  assert.equal((await payPhoneTopUp({ account: PERSON, orderId: one.orderId, authorization: signed(one.ausdUnits, "b2") }, never.deps)).state, "refunded");
  assert.equal(never.w.refunds.length, 1);

  const went = world(failing);
  went.w.used = true;
  const two = await price(went.deps);
  await payPhoneTopUp({ account: PERSON, orderId: two.orderId, authorization: signed(two.ausdUnits, "c3") }, went.deps);
  assert.equal(went.w.refunds.length, 0, "it went: the person is not refunded as well");
  assert.match(String((await store.loadPhoneOrder(two.orderId))?.paymentTx), /^authorization:0x/);

  const unknown = world(failing);
  unknown.w.used = null;
  const three = await price(unknown.deps);
  assert.equal((await payPhoneTopUp({ account: PERSON, orderId: three.orderId, authorization: signed(three.ausdUnits, "d4") }, unknown.deps)).state, "on_its_way");
  assert.equal(unknown.w.refunds.length, 0, "not known: nothing is sent back on a guess");
});

test("a fill Relay could not complete came back to the treasury, and the follow sends it back to the person", async () => {
  const { deps, w } = world({ sendToBridge: async (input) => ({ hash: `0xsent${input.nonce.slice(2, 6)}` as Hex }) });
  const priced = await price(deps);
  await payPhoneTopUp({ account: PERSON, orderId: priced.orderId, authorization: signed(priced.ausdUnits, "e5") }, deps);
  assert.equal(w.refunds.length, 0);
  w.bridge = "refund";
  assert.equal((await followPhoneTopUp({ account: PERSON, orderId: priced.orderId }, deps)).state, "refunded");
  assert.equal(w.refunds.length, 1);
});

test("no price from Relay is refused before anything is written or moved", async () => {
  const { deps } = world({ quoteBridge: async () => { throw new Error("Relay could not be reached"); } });
  await assert.rejects(price(deps), (error: unknown) => error instanceof PhoneOrderError && error.code === "UNAVAILABLE");
  assert.equal((await db.query("SELECT count(*)::int AS n FROM viky_phone_orders")).rows[0] && Number((await db.query<{ n: number }>("SELECT count(*)::int AS n FROM viky_phone_orders")).rows[0].n), 0);
});

test("Relay's quote is asked strict and exact, and refused when it is not the one asked for", async () => {
  let asked: Record<string, unknown> = {};
  const answer = (over: Record<string, unknown> = {}) => async (_url: string, init?: RequestInit) => {
    asked = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({
      steps: [{ id: "deposit", depositAddress: DEPOSIT, requestId: "0xrequest" }],
      details: {
        currencyIn: { amount: "1026300", currency: { address: "0x00000000efe302beaa2b3e6e1b18d08d69a9012a", chainId: 143 } },
        currencyOut: { amount: "1000000", minimumAmount: "1000000", currency: { address: BASE_USDC.toLowerCase(), chainId: 8453 } },
        recipient: PAY_TO,
        ...over,
      },
    }), { status: 200 });
  };
  const quote = await quoteAusdToBaseUsdc({ usdcUnits: 1_000_000n, payTo: PAY_TO, treasury: TREASURY }, answer());
  assert.deepEqual(quote, { depositAddress: DEPOSIT, ausdUnits: 1_026_300n, requestId: "0xrequest" });
  assert.equal(asked.tradeType, "EXACT_OUTPUT");
  assert.equal(asked.strict, true);
  assert.equal(asked.useDepositAddress, true);
  assert.equal(asked.refundTo, TREASURY);
  await assert.rejects(quoteAusdToBaseUsdc({ usdcUnits: 1_000_000n, payTo: PAY_TO, treasury: TREASURY }, answer({ recipient: "0x5555555555555555555555555555555555555555" })));
  await assert.rejects(quoteAusdToBaseUsdc({ usdcUnits: 1_000_000n, payTo: PAY_TO, treasury: TREASURY }, answer({ currencyOut: { amount: "990000", minimumAmount: "990000", currency: { address: BASE_USDC, chainId: 8453 } } })));
});
