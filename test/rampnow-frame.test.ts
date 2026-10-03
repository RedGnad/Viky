import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { rampnowPage } from "../src/rails";
import { PAY } from "../src/sentences";
import { FRAME_HEIGHT, frameHeightFor, LATE_WAY_OUT_AFTER_MS, orderUidOf, PAYMENT_POSSIBLE_AFTER_MS, RAMPNOW_EVENTS, RAMPNOW_FRAME_ALLOW, RAMPNOW_ORDERS_PAGE, rampnowEventOf, rampnowFinishPage, rampnowFrameAddress, rampnowFrameOn, rampnowOrderPage, rampnowSays } from "../src/rampnow-frame";

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

test("its address is the public locked page without its Buy and Sell tabs, with the partner's public key added when there is one, and never a key that is not public", () => {
  const LOCKED = [["orderType", "buy"], ["srcChain", "fiat"], ["srcCurrency", "EUR"], ["srcAmount", "30"], ["paymentMode", "card"], ["dstCurrency", "USDC"], ["dstChain", "monad"], ["walletAddress", ACCOUNT]] as const;
  // Without a key (the founder, 3 Oct 2026: the Partner Dashboard has no sign-up): the page the way in already opens.
  // `hideOrderTabs` is read by the page's own script, and measured on the page on 4 Oct 2026: two tabs without it, none with it.
  const keyless = rampnowFrameAddress({ account: ACCOUNT, euros: 30 }, "");
  assert.equal(keyless, `${rampnowPage({ account: ACCOUNT, euros: 30 })}&hideOrderTabs=true`);
  assert.equal(new URL(rampnowPage({ account: ACCOUNT, euros: 30 })).searchParams.has("hideOrderTabs"), false, "the page beside, in a tab of its own, stays as the real payment went through it");
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

test("nothing counts on the frame's messages: the money arriving closes it, and the judges page says the frame with its limit", () => {
  // The screen that waits under the sheet closes it as soon as the account holds something to act on, and forgets the payment it waited for.
  const paying = readFileSync("app/components/PayGift.tsx", "utf8");
  assert.match(paying, /const next = nextFundingStep\(\{[^}]*arrivingUsdc: read\.usdc[^}]*\}\);\n(\s*\/\/[^\n]*\n)*\s*if \(next\.do !== "wait"\) \{\n\s*setFrame\(null\);\n(\s*\/\/[^\n]*\n)*\s*if \(readRampnowPending\(address\)\) noteInRampnowJournal\("Viky: the money arrived in the account"\);\n\s*clearRampnowPending\(address\);/);
  // No message of the frame closes the sheet: it has no handler that would, and the screen closes it on four things only.
  const sheet = readFileSync("app/kit/offer/RampnowSheet.tsx", "utf8");
  assert.doesNotMatch(sheet, /onArrived|onClose\b(?!=\{nothing\})/);
  assert.equal(paying.match(/setFrame\(null\)/g)?.length, 5, "the money arriving, not paid, failed, the late way out, the page beside");
  // The route gives an address whether or not a key is set, once the frame is switched on.
  const route = readFileSync("app/api/fund/rampnow-frame/route.ts", "utf8");
  assert.match(route, /const url = rampnowFrameOn\(\) \? rampnowFrameAddress\(\{ account: getAddress\(auth\.account\), euros: [^}]+\}, key\) : null;/);
  // A real payment has gone through the frame (the founder's, 3 Oct 2026), and the page says the frame with what that payment showed.
  const judges = readFileSync("app/judges/page.tsx", "utf8").replace(/\s+/g, " ");
  assert.ok(judges.includes("? \"Rampnow's page opens in a frame inside Viky. Its limit: Rampnow finishes a payment from its own page (the card buys USDC on Base, and its page then sends it on to Monad), so the frame has to stay open until the money arrives."));
  assert.ok(judges.includes("The frame has no cross: its way out is for somebody who says they have not paid, or after five minutes without the money."));
  assert.ok(judges.includes("Left before the end, the payment waits at Rampnow, and the screen that waits leads back to it and starts no second one."));
  assert.ok(judges.includes("6 EUR paid at 21:23 UTC, the frame closed, the money held on Base for 14 minutes, then 5.60 USDC on the account at 21:38 UTC"));
  assert.equal(LATE_WAY_OUT_AFTER_MS, 5 * 60_000, "the five minutes the page says");
});

test("one gift, one payment: what an event says of a payment", () => {
  // An order alone is not a payment; a payment under way or made is known; a failed payment took nothing.
  assert.equal(rampnowSays({ type: "ORDER_CREATED" }, false), "ordered");
  for (const type of ["ORDER_PAYMENT_PROCESSING", "ORDER_PAYMENT_COMPLETED", "ORDER_COMPLETED"] as const) assert.equal(rampnowSays({ type }, false), "paying", type);
  assert.equal(rampnowSays({ type: "ORDER_PAYMENT_FAILED" }, false), "failed");
  assert.equal(rampnowSays({ type: "ORDER_PAYMENT_FAILED" }, true), "failed");
  // A failed order took nothing only while no payment is known: after its card paid, nothing is said that could be false.
  assert.equal(rampnowSays({ type: "ORDER_FAILED" }, false), "failed");
  assert.equal(rampnowSays({ type: "ORDER_FAILED" }, true), null);
  // Ready, signed in, an identity check, an error, a widget closed: none is about money, and none changes anything.
  for (const type of RAMPNOW_EVENTS) {
    if (type.startsWith("ORDER_")) continue;
    assert.equal(rampnowSays({ type }, false), null, type);
    assert.equal(rampnowSays({ type }, true), null, type);
  }
  // The order an event names, kept to open it again; nothing that does not look like an identifier goes into an address.
  assert.equal(orderUidOf({ type: "ORDER_CREATED", payload: { orderUid: "ord_123-AbC" } }), "ord_123-AbC");
  assert.equal(orderUidOf({ type: "ORDER_PAYMENT_PROCESSING", payload: { orderUid: "../quote?x=1" } }), null);
  assert.equal(orderUidOf({ type: "WIDGET_READY" }), null);
  assert.equal(rampnowOrderPage("ord_123-AbC"), "https://app.rampnow.io/order/dapp/ord_123-AbC");
  for (const not of [null, undefined, "", "a/b", "a?b", "a b", "x".repeat(81)]) assert.equal(rampnowOrderPage(not), null, String(not));
  // Where a payment already started is finished: its order, or the person's list of orders. Never the page that pays.
  assert.equal(RAMPNOW_ORDERS_PAGE, "https://app.rampnow.io/order/list");
  assert.equal(rampnowFinishPage("ord_123-AbC"), "https://app.rampnow.io/order/dapp/ord_123-AbC");
  for (const not of [null, undefined, "", "a/b"]) assert.equal(rampnowFinishPage(not), RAMPNOW_ORDERS_PAGE, String(not));
  assert.equal(PAYMENT_POSSIBLE_AFTER_MS, 20_000);
});

test("the sheet is held, and what stands under the frame is the way out", () => {
  const sheet = readFileSync("app/kit/offer/RampnowSheet.tsx", "utf8");
  assert.match(sheet, /<Sheet open=\{open\} title=\{W\.card\.title\} onClose=\{nothing\} tall held>/);
  // A held sheet: no cross, no handle, and Escape, the backdrop and a pull do nothing; closed by the browser all the same, it opens again.
  const kit = readFileSync("app/kit/Sheet.tsx", "utf8");
  assert.match(kit, /\{held \? null : \(\n\s*<button\n\s*type="button"\n\s*onClick=\{\(\) => dialog\.current\?\.close\(\)\}\n\s*aria-label="Close"/, "no cross");
  assert.match(kit, /\{held \? null : <span aria-hidden className="mx-auto h-\[5px\]/, "no handle");
  assert.match(kit, /if \(held\) return event\.preventDefault\(\);/, "Escape");
  assert.match(kit, /if \(event\.target === dialog\.current && !held\) dialog\.current\?\.close\(\);/, "the backdrop");
  assert.match(kit, /if \(held \|\| \(event\.target as Element\)\.closest\("button"\)\) return;/, "a pull");
  assert.match(kit, /if \(asked\.current\.held && asked\.current\.open\) return dialog\.current\?\.showModal\(\);/, "a second Escape");
  // The founder's sentences, word for word.
  assert.equal(PAY.rampnow.notPaidBack, "I have not paid: go back");
  assert.equal(PAY.rampnow.keepOpen, "Keep this window open: Rampnow is finishing your payment.");
  assert.equal(PAY.rampnow.failed, "The payment did not go through. Nothing was taken.");
  assert.equal(PAY.rampnow.finish, "Finish my payment");
  assert.equal(PAY.rampnow.notPaid, "I have not paid");
  assert.equal(PAY.rampnow.cantSignIn, "Can't sign in here?");
  // A payment known: the sentence and nothing that leads out. None known: the way out and the page beside.
  assert.match(sheet, /\{known \? \(\n\s*<p className=\{`\$\{BODY\} font-medium`\} role="status" data-rampnow-keep-open="">\n\s*\{W\.rampnow\.keepOpen\}/);
  assert.match(sheet, /data-rampnow-not-paid=""[\s\S]*?\{W\.rampnow\.notPaidBack\}/);
  assert.match(sheet, /<p className=\{HELP\}>\{unreachable \? W\.rampnow\.notShowing : W\.rampnow\.cantSignIn\}<\/p>/);
  assert.match(sheet, /\{known \? null : <CardTermsLine way=\{WAY_IN_USDC\} \/>\}/);
  // The page beside is the payment to finish when there is one, never a new payment in its place.
  assert.match(sheet, /href=\{finishing \? rampnowFinishPage\(orderUid\) : rampnowPage\(\{ account, euros \}\)\}/);
  // A payment is possible once the frame has stood long enough, and the late way out comes five minutes after the
  // frame opened or after a payment became known.
  assert.match(sheet, /const timer = setTimeout\(\(\) => now\.current\.onSaid\("possible", null\), PAYMENT_POSSIBLE_AFTER_MS\);/);
  assert.match(sheet, /const timer = setTimeout\(\(\) => setLateFor\(waitKey\), LATE_WAY_OUT_AFTER_MS\);\n\s*return \(\) => clearTimeout\(timer\);\n\s*\}, \[open, waitKey\]\);/);
  // Everything Rampnow's origin posts is written down before it is believed or not.
  assert.match(sheet, /const listen = \(message: MessageEvent\) => \{\n\s*noteRampnowMessage\(message\);\n\s*const event = rampnowEventOf\(message\);/);
});

test("the wait, Home and Gifts say the payment is at Rampnow and lead back to it; paying starts again only on 'I have not paid'", () => {
  const paying = readFileSync("app/components/PayGift.tsx", "utf8");
  const from = paying.indexOf(") : wayIn === WAY_IN_USDC && rampnowFrameOn() && rampnowPending ? (");
  const waiting = paying.slice(from, paying.indexOf(") : wayIn === WAY_IN_USDC && rampnowFrameOn() ? (", from));
  assert.ok(from > 0);
  assert.match(waiting, /says=\{rampnowPending\.known \? P\.rampnow\.atRampnow : P\.rampnow\.maybeAtRampnow\}/);
  assert.match(waiting, /onFinish=\{\(\) => setFrame\(\{ mode: "finish", orderUid: rampnowPending\.orderUid \}\)\}/, "the payment opened again in our frame");
  assert.match(waiting, /clearRampnowPending\(address\);/, "not paid: nothing is waited for");
  assert.doesNotMatch(waiting, /openCard\b|openCardAgain|payByCard|mode: "new"/, "never a new payment here");
  // The pay press that arrives with a payment already waited for opens nothing; "Finish my payment" from Home opens that payment.
  assert.match(paying, /if \(arrival === "new" && !rampnowPending\) setFrame\(\{ mode: "new" \}\);/);
  assert.match(paying, /if \(arrival === "finish" && rampnowPending\?\.via === "frame"\) setFrame\(\{ mode: "finish", orderUid: rampnowPending\.orderUid \}\);/);
  // Paying, when nothing is waited for: "Pay €X by card", and the failure said once above it.
  assert.match(paying, /\{rampnowFailed \? <FieldRefusal id="rampnow-failed">\{P\.rampnow\.failed\}<\/FieldRefusal> : null\}/);
  assert.match(paying, /\{toBuy \? P\.payByCard\(moneyIn\(toBuy, "EUR"\)\) : W\.waiting\.openCard\}/);
  assert.equal(PAY.payByCard("€6.00"), "Pay €6.00 by card");
  // The block itself: the wheel, since when, the way back, and the small way to start again.
  const block = readFileSync("app/kit/offer/RampnowWaiting.tsx", "utf8");
  assert.match(block, /<span className="working-ring shrink-0" aria-hidden="true" \/>/);
  assert.match(block, /\{W\.rampnow\.needsItsPage\} <span data-rampnow-since="">\{W\.rampnow\.since\(minutes\)\}<\/span>/);
  assert.match(block, /pending\.via === "tab" \? \(\n\s*<a href=\{rampnowFinishPage\(pending\.orderUid\)\} target="_blank" rel="noopener noreferrer"/, "a payment started in a tab is finished in a tab");
  assert.match(block, /<Link href="\/fund\?step=paying&finish=1" className=\{action\}>/);
  assert.equal(PAY.rampnow.since(0), "Started less than a minute ago.");
  assert.equal(PAY.rampnow.since(1), "Started 1 minute ago.");
  assert.equal(PAY.rampnow.since(14), "Started 14 minutes ago.");
  assert.equal(PAY.rampnow.since(60), "Started 1 hour ago.");
  assert.equal(PAY.rampnow.since(200), "Started 3 hours ago.");
  // Home and Gifts, where "not made yet" stood, for a gift whose payment went by Rampnow.
  const kept = readFileSync("app/kit/FinishTheGift.tsx", "utf8");
  assert.match(kept, /if \(waiting\.byRampnow && rampnowFrameOn\(\) && pending\) \{/);
  assert.match(kept, /says=\{\(pending\.known \? PAY\.rampnow\.giftAtRampnow : PAY\.rampnow\.giftMaybeAtRampnow\)\(waiting\.amount, waiting\.recipient\)\}/);
  assert.equal(PAY.rampnow.giftAtRampnow("$5.00", "Boo"), "$5.00 for Boo: your payment is at Rampnow.");
  assert.equal(PAY.rampnow.giftMaybeAtRampnow("$5.00", ""), "$5.00: if you paid, your payment is at Rampnow.");
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

test("the frame allows what the SDK allows, the camera and the payment among it, and the site lets it be drawn", () => {
  assert.equal(RAMPNOW_FRAME_ALLOW, "camera; microphone; payment; clipboard-write; publickey-credentials-get");
  const sdk = 'iframeAllow:"camera; microphone; payment; clipboard-write; publickey-credentials-get"';
  assert.ok(sdk.includes(RAMPNOW_FRAME_ALLOW));
  const sheet = readFileSync("app/kit/offer/RampnowSheet.tsx", "utf8");
  assert.match(sheet, /\{open && shown \? <iframe src=\{shown\} title=\{W\.card\.frame\} allow=\{RAMPNOW_FRAME_ALLOW\}/);
  assert.match(readFileSync("next.config.mjs", "utf8"), /frame-src 'self' https:\/\/deposit\.swapper\.finance https:\/\/app\.rampnow\.io/);
  // The key is read on the server, and the account is the session's.
  const route = readFileSync("app/api/fund/rampnow-frame/route.ts", "utf8");
  assert.match(route, /const key = process\.env\.RAMPNOW_API_KEY \?\? "";/);
  assert.match(route, /account: getAddress\(auth\.account\)/);
  assert.doesNotMatch(readFileSync("app/kit/offer/RampnowSheet.tsx", "utf8"), /RAMPNOW_API_KEY/);
});

test("the frame is as tall as the sheet has room for: whole inside it on a laptop of 700, and never shorter than a form can be used in", () => {
  assert.deepEqual(FRAME_HEIGHT, { most: 600, least: 360 });
  // A sheet stops at 82 % of the window (app/globals.css, dialog.sheet-tall); its head and the air of its body are measured on the page.
  const sheet = (windowHeight: number, under = 0) => frameHeightFor({ cap: windowHeight * 0.82, head: 70, padding: 32, under });
  assert.equal(sheet(1200), 600, "Rampnow's own height when there is room");
  assert.equal(sheet(844), 590, "a phone: a little under it, whole in the sheet");
  assert.equal(sheet(700), 472, "a laptop of 700: the fixed 600 stood 128 pixels out of the sheet");
  assert.equal(sheet(844, 150), 440, "the link under it takes its own room from the frame, so both are in sight");
  assert.equal(sheet(700, 150), 360, "and on a short window the frame stops at its least: the sheet scrolls for the rest");
  // The sheet reads its own cap, head and air, and what stands under the frame, and reads them again when they change.
  const sheetSource = readFileSync("app/kit/offer/RampnowSheet.tsx", "utf8");
  assert.match(sheetSource, /const cap = parseFloat\(getComputedStyle\(dialog\)\.maxHeight\);/);
  assert.match(sheetSource, /window\.addEventListener\("resize", fit\);\n\s*const watch = new ResizeObserver\(fit\);\n\s*if \(frame\.current\?\.parentElement\) watch\.observe\(frame\.current\.parentElement\);/);
  // What stands under the frame is taken from the frame's room, as it is drawn.
  assert.match(sheetSource, /under: around\.getBoundingClientRect\(\)\.height - frame\.current\.getBoundingClientRect\(\)\.height,/);
  assert.match(sheetSource, /ref=\{frame\} style=\{\{ height \}\}/);
  assert.doesNotMatch(sheetSource, /h-\[600px\]/, "no fixed height");
});
