import assert from "node:assert/strict";
import test from "node:test";
import { bitrefillAuthorization, bitrefillConfigured, BitrefillError, createInvoice, e164Of, operatorsFor, outcomeOf, readInvoice, usdcUnits } from "../src/bitrefill";

/** Bitrefill's answers below follow its documented shapes (docs.bitrefill.com, read 25 Sep 2026); no key was used. */
const env = { BITREFILL_API_KEY: "k" } as unknown as NodeJS.ProcessEnv;
function answering(status: number, body: unknown, seen: Array<{ url: string; init: RequestInit }> = []) {
  return {
    env,
    fetch: async (url: string, init: RequestInit) => {
      seen.push({ url, init });
      return new Response(JSON.stringify(body), { status });
    },
  };
}
const refused = (code: string) => (error: unknown) => error instanceof BitrefillError && error.code === code;

test("the key is the Personal API's Bearer, or the Business API's pair, and nothing is configured without either", () => {
  assert.equal(bitrefillAuthorization(env), "Bearer k");
  assert.equal(bitrefillAuthorization({ BITREFILL_API_ID: "id", BITREFILL_API_SECRET: "s" } as unknown as NodeJS.ProcessEnv), `Basic ${Buffer.from("id:s").toString("base64")}`);
  assert.equal(bitrefillConfigured({} as unknown as NodeJS.ProcessEnv), false);
  assert.throws(() => bitrefillAuthorization({} as unknown as NodeJS.ProcessEnv), refused("NOT_CONFIGURED"));
});

test("a number in international form, and nothing else", () => {
  assert.equal(e164Of("+221 77 123 45 67"), "+221771234567");
  assert.equal(e164Of("00221771234567"), "+221771234567");
  assert.equal(e164Of("77 123 45 67"), undefined, "a number without its country is not guessed");
  assert.equal(e164Of("+0221771234567"), undefined);
});

test("the operators for a number, and a country Bitrefill does not serve refused by name", async () => {
  const seen: Array<{ url: string; init: RequestInit }> = [];
  // Bitrefill's documented answer when it recognises the number: `data` is the operator's product, one object.
  const operators = await operatorsFor("+221 77 123 45 67", answering(200, { meta: { phone_number: "+221771234567" }, operator_found: true, data:
    { id: "orange-senegal", name: "Orange Senegal", currency: "XOF", packages: [{ id: "orange-senegal<&>1000", value: "1000", price: 1.9 }], range: { min: 500, max: 50000, step: 1, price_rate: 0.0019 } },
  }, seen));
  assert.equal(seen[0].url, "https://api-bitrefill.com/v2/check_phone_number?phone_number=%2B221771234567");
  assert.equal((seen[0].init.headers as Record<string, string>).authorization, "Bearer k");
  assert.deepEqual(operators.map((operator) => operator.id), ["orange-senegal"]);
  assert.equal(operators[0].range?.priceRate, 0.0019);
  // When it does not recognise the number: the list of the products that may serve it, the broken one left out.
  const candidates = await operatorsFor("+221771234567", answering(200, { operator_found: false, data: [
    { id: "orange-senegal", name: "Orange Senegal", currency: "XOF", packages: [], range: { min: 500, max: 50000, step: 1, price_rate: 0.0019 } },
    { id: "free-senegal", name: "Free Senegal", currency: "XOF", packages: [], range: null },
    { id: "broken" },
  ] }));
  assert.deepEqual(candidates.map((operator) => operator.id), ["orange-senegal", "free-senegal"]);
  await assert.rejects(operatorsFor("+221771234567", answering(200, { operator_found: false, data: [] })), refused("COUNTRY_NOT_SERVED"));
  await assert.rejects(operatorsFor("771234567", answering(200, {})), refused("INVALID_PHONE_NUMBER"));
  await assert.rejects(operatorsFor("+221771234567", answering(400, { error_code: "unsupported_operator", message: "no" })), refused("UNSUPPORTED_OPERATOR"));
  await assert.rejects(operatorsFor("+221771234567", answering(429, {})), refused("RATE_LIMITED"));
  await assert.rejects(operatorsFor("+221771234567", answering(401, {})), refused("NOT_CONFIGURED"));
});

test("an invoice for one product, priced in USDC on Base, with the treasury as the refund address, and paid by nobody here", async () => {
  const seen: Array<{ url: string; init: RequestInit }> = [];
  const invoice = await createInvoice(
    { productId: "orange-senegal", value: 2000, phoneNumber: "+221771234567", refundAddress: "0x1111111111111111111111111111111111111111" },
    answering(200, { data: { id: "c2b27180-610e-4132-af77-ad42fc0ac444", status: "unpaid", payment: { method: "usdc_base", address: "0x2222222222222222222222222222222222222222", price: 3.812345, currency: "USDC" }, orders: [{ id: "o1", status: "created" }] } }, seen),
  );
  const body = JSON.parse(String(seen[0].init.body));
  assert.deepEqual(body, { products: [{ product_id: "orange-senegal", quantity: 1, value: 2000, phone_number: "+221771234567" }], payment_method: "usdc_base", refund_address: "0x1111111111111111111111111111111111111111", auto_pay: false });
  assert.equal(invoice.payment.price, "3.812345");
  // What Bitrefill really answers for an USDC invoice: its smallest unit, six decimals (production, 28 Sep 2026).
  const micro = await createInvoice({ productId: "orange-senegal", packageId: "orange-senegal<&>2000", phoneNumber: "+221771234567", refundAddress: "0x1" }, answering(200, { data: { id: "196d1041-5be9-48f8-a5f9-f2ab24eb9c65", status: "unpaid", payment: { method: "usdc_base", address: "0x2222222222222222222222222222222222222222", price: "3500000", currency: "USDC" }, orders: [] } }));
  assert.equal(micro.payment.price, "3.500000");
  assert.equal(usdcUnits(micro.payment.price), 3_500_000n, "3.50 USDC, not three and a half million");
  await assert.rejects(createInvoice({ productId: "x", refundAddress: "0x1" }, answering(200, {})), refused("INVOICE_REFUSED"));
  await assert.rejects(createInvoice({ productId: "x", value: 1, refundAddress: "0x1" }, answering(200, { data: { id: "i", payment: { method: "bitcoin", address: "bc1", price: 1 } } })), refused("BAD_ANSWER"));
  await assert.rejects(readInvoice("../x", answering(200, {})), refused("BAD_ANSWER"));
});

test("an invoice's outcome: delivered only when every order is, failed on Bitrefill's refusals, waiting otherwise", () => {
  const invoice = (status: string, orders: string[]) => ({ id: "i", status, payment: { method: "usdc_base", address: "a", price: "1", currency: "USDC" }, orders: orders.map((s, i) => ({ id: String(i), status: s })) });
  assert.equal(outcomeOf(invoice("complete", ["delivered"])), "delivered");
  assert.equal(outcomeOf(invoice("complete", [])), "waiting");
  assert.equal(outcomeOf(invoice("pending", ["processing"])), "waiting");
  assert.equal(outcomeOf(invoice("denied", ["created"])), "failed");
  assert.equal(outcomeOf(invoice("complete", ["failed"])), "failed");
});

test("a USDC price in six-decimal units, rounded up so Viky never underpays", () => {
  assert.equal(usdcUnits("3.812345"), 3_812_345n);
  assert.equal(usdcUnits("3.8123451"), 3_812_346n);
  assert.equal(usdcUnits("10"), 10_000_000n);
  assert.throws(() => usdcUnits("1e-7"), refused("BAD_ANSWER"));
});
