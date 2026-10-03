import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { RAMPNOW_FRAME_ALLOW, rampnowEventOf, rampnowFrameAddress, rampnowFrameOn, rampnowOutcome } from "../src/rampnow-frame";

/**
 * Rampnow in a frame of our own (the founder, 3 Oct 2026), from its official widget mode and the code of its SDK
 * (`@rampnow/sdk` 0.0.8, read 3 Oct 2026). Off until `NEXT_PUBLIC_RAMPNOW_FRAME=on`.
 */

const ACCOUNT = "0x00000000000000000000000000000000000A11CE";

test("the frame is off unless switched on", () => {
  assert.equal(rampnowFrameOn({}), false);
  assert.equal(rampnowFrameOn({ NEXT_PUBLIC_RAMPNOW_FRAME: "1" }), false);
  assert.equal(rampnowFrameOn({ NEXT_PUBLIC_RAMPNOW_FRAME: "on" }), true);
});

test("its address is the locked page with the partner's public key, and a key that is not a public one is never put in it", () => {
  const address = rampnowFrameAddress({ account: ACCOUNT, euros: 30 }, "pk_live_test123");
  assert.ok(address);
  const url = new URL(address);
  assert.equal(url.origin + url.pathname, "https://app.rampnow.io/order/quote");
  for (const [name, value] of [["apiKey", "pk_live_test123"], ["orderType", "buy"], ["srcChain", "fiat"], ["srcCurrency", "EUR"], ["srcAmount", "30"], ["paymentMode", "card"], ["dstCurrency", "USDC"], ["dstChain", "monad"], ["walletAddress", ACCOUNT], ["prefill", "true"]]) {
    assert.equal(url.searchParams.get(name), value, name);
  }
  assert.equal(url.searchParams.get("lockFields"), "srcAsset,srcAmount,dstAsset,paymentMode,walletAddress");
  // Rampnow's other key, its secret, signs its webhooks: an address a browser shows never carries it.
  assert.equal(rampnowFrameAddress({ account: ACCOUNT }, "sk_live_secret"), null);
  assert.equal(rampnowFrameAddress({ account: ACCOUNT }, ""), null);
  assert.equal(rampnowFrameAddress({ account: ACCOUNT }, "pk_live&walletAddress=0xother"), null);
});

test("a message is believed only from Rampnow's origin, in the SDK's shape, with a type it knows", () => {
  const from = (data: unknown, origin = "https://app.rampnow.io") => rampnowEventOf({ origin, data });
  assert.deepEqual(from({ source: "RAMPNOW_WIDGET", type: "ORDER_COMPLETED", payload: { orderUid: "o1" } }), { type: "ORDER_COMPLETED", payload: { orderUid: "o1" } });
  assert.deepEqual(from({ source: "RAMPNOW_WIDGET", type: "WIDGET_READY" }), { type: "WIDGET_READY" });
  assert.equal(from({ source: "RAMPNOW_WIDGET", type: "ORDER_COMPLETED" }, "https://evil.example"), null);
  assert.equal(from({ source: "RAMPNOW_SDK", type: "ORDER_COMPLETED" }), null, "our own commands' source is not the widget's");
  assert.equal(from({ source: "RAMPNOW_WIDGET", type: "SOMETHING" }), null);
  assert.equal(from("ORDER_COMPLETED"), null);
  assert.equal(from(null), null);
});

test("completed closes the sheet on the wait, closed closes it, and a failure offers the page beside", () => {
  assert.equal(rampnowOutcome({ type: "ORDER_COMPLETED" }), "arrived");
  assert.equal(rampnowOutcome({ type: "WIDGET_CLOSED" }), "closed");
  for (const type of ["ORDER_PAYMENT_FAILED", "ORDER_FAILED", "ERROR"] as const) assert.equal(rampnowOutcome({ type }), "failed");
  // A payment processing, a payment completed, an identity check: the frame goes on, nothing is decided here.
  for (const type of ["ORDER_PAYMENT_COMPLETED", "ORDER_PAYMENT_PROCESSING", "KYC_STARTED", "ORDER_CREATED"] as const) assert.equal(rampnowOutcome({ type }), null);
});

test("the frame allows what the SDK allows, the camera and the payment among it, and the site lets it be drawn", () => {
  assert.equal(RAMPNOW_FRAME_ALLOW, "camera; microphone; payment; clipboard-write; publickey-credentials-get");
  const sdk = 'iframeAllow:"camera; microphone; payment; clipboard-write; publickey-credentials-get"';
  assert.ok(sdk.includes(RAMPNOW_FRAME_ALLOW));
  const sheet = readFileSync("app/kit/offer/RampnowSheet.tsx", "utf8");
  assert.match(sheet, /\{open && address \? <iframe src=\{address\} title=\{W\.card\.frame\} allow=\{RAMPNOW_FRAME_ALLOW\}/);
  // The fallback is the page beside, the one the way in already opens.
  assert.match(sheet, /<a href=\{rampnowPage\(\{ account, euros \}\)\} target="_blank" rel="noopener noreferrer"/);
  assert.match(readFileSync("next.config.mjs", "utf8"), /frame-src 'self' https:\/\/deposit\.swapper\.finance https:\/\/app\.rampnow\.io/);
  // The key is read on the server, and the account is the session's.
  const route = readFileSync("app/api/fund/rampnow-frame/route.ts", "utf8");
  assert.match(route, /const key = process\.env\.RAMPNOW_API_KEY \?\? "";/);
  assert.match(route, /account: getAddress\(auth\.account\)/);
  assert.doesNotMatch(readFileSync("app/kit/offer/RampnowSheet.tsx", "utf8"), /RAMPNOW_API_KEY/);
});
