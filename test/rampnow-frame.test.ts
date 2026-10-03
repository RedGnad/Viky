import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { rampnowPage } from "../src/rails";
import { RAMPNOW_FRAME_ALLOW, RAMPNOW_FRAME_PAID_THROUGH, rampnowEventOf, rampnowFrameAddress, rampnowFrameOn, rampnowOutcome } from "../src/rampnow-frame";

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

test("its address is the public locked page as it is, with the partner's public key added when there is one, and never a key that is not public", () => {
  const LOCKED = [["orderType", "buy"], ["srcChain", "fiat"], ["srcCurrency", "EUR"], ["srcAmount", "30"], ["paymentMode", "card"], ["dstCurrency", "USDC"], ["dstChain", "monad"], ["walletAddress", ACCOUNT]] as const;
  // Without a key (the founder, 3 Oct 2026: the Partner Dashboard has no sign-up): the page the way in already opens.
  const keyless = rampnowFrameAddress({ account: ACCOUNT, euros: 30 }, "");
  assert.equal(keyless, rampnowPage({ account: ACCOUNT, euros: 30 }));
  assert.equal(rampnowFrameAddress({ account: ACCOUNT, euros: 30 }), keyless, "and with no key named at all");
  const bare = new URL(keyless);
  assert.equal(bare.origin + bare.pathname, "https://app.rampnow.io/order/quote");
  for (const [name, value] of LOCKED) assert.equal(bare.searchParams.get(name), value, name);
  assert.equal(bare.searchParams.get("lockFields"), "srcAsset,srcAmount,dstAsset,paymentMode,walletAddress");
  assert.equal(bare.searchParams.has("apiKey"), false);
  // With the partner's public key: the same page, and the key added.
  const keyed = rampnowFrameAddress({ account: ACCOUNT, euros: 30 }, "pk_live_test123");
  assert.equal(keyed, `${keyless}&apiKey=pk_live_test123`);
  // Rampnow's other key, its secret, signs its webhooks: an address a browser shows never carries it, nor anything
  // that is not a public key. The frame then takes the page without one.
  for (const notPublic of ["sk_live_secret", "pk_live&walletAddress=0xother", "  ", "live_123"]) {
    assert.equal(rampnowFrameAddress({ account: ACCOUNT, euros: 30 }, notPublic), keyless, notPublic);
  }
});

test("nothing counts on the frame's messages: the money arriving closes it, and no page says the frame is the way before a real payment", () => {
  // The screen that waits under the sheet closes it as soon as the account holds something to act on.
  const paying = readFileSync("app/components/PayGift.tsx", "utf8");
  assert.match(paying, /const next = nextFundingStep\(\{[^}]*arrivingUsdc: read\.usdc[^}]*\}\);\n(\s*\/\/[^\n]*\n)*\s*if \(next\.do !== "wait"\) setRampnowOpen\(false\);/);
  // The route gives an address whether or not a key is set, once the frame is switched on.
  const route = readFileSync("app/api/fund/rampnow-frame/route.ts", "utf8");
  assert.match(route, /const url = rampnowFrameOn\(\) \? rampnowFrameAddress\(\{ account: getAddress\(auth\.account\), euros: [^}]+\}, key\) : null;/);
  // The judges page: "opens in a frame inside Viky" only once a real payment has gone through it.
  assert.equal(RAMPNOW_FRAME_PAID_THROUGH, false, "the founder's first payment in the frame is still to come");
  const judges = readFileSync("app/judges/page.tsx", "utf8").replace(/\s+/g, " ");
  assert.ok(judges.includes('rampnowFrameOn() ? RAMPNOW_FRAME_PAID_THROUGH ? "Rampnow\'s page opens in a frame inside Viky. " : "Rampnow\'s page is being tried in a frame inside Viky, without a partner\'s key: no payment has gone through the frame end to end yet, and its own tab stays the way when the frame does not show. " : "Rampnow\'s page opens in a tab of its own. "'));
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
