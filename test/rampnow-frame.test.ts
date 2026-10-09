import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { rampnowPage } from "../src/rails";
import { FUND, PAY } from "../src/sentences";
import { FRAME_HEIGHT, frameHeightFor, LATE_WAY_OUT_AFTER_MS, orderUidOf, PAYMENT_POSSIBLE_AFTER_MS, RAMPNOW_EVENTS, RAMPNOW_FRAME_ALLOW, RAMPNOW_ORDERS_PAGE, rampnowEventOf, rampnowFinishPage, rampnowFrameAddress, rampnowFrameOn, rampnowOrderPage, rampnowSays, frameKeepsSignIn, safariEngineVersion } from "../src/rampnow-frame";

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
  assert.match(paying, /const next = nextFundingStep\(\{[^}]*arrivingUsdc: read\.usdc[^}]*\}\);\n\s*if \(next\.do === "takeFromGifts"\) \{[\s\S]*?\n          return;\n        \}\n(\s*\/\/[^\n]*\n)*\s*if \(next\.do !== "wait"\) \{\n\s*setFrame\(null\);\n(\s*\/\/[^\n]*\n)*\s*if \(readRampnowPending\(address\)\) noteInRampnowJournal\("Viky: the money arrived in the account"\);\n\s*clearRampnowPending\(address\);/);
  // No message of the frame closes the sheet: it has no handler that would, and the screen closes it on four things only.
  const sheet = readFileSync("app/kit/offer/RampnowSheet.tsx", "utf8");
  assert.doesNotMatch(sheet, /onArrived|onClose\b(?!=\{nothing\})/);
  assert.equal(paying.match(/setFrame\(null\)/g)?.length, 5, "the money arriving, the way back, failed, the late way out, the page beside");
  // The route gives an address whether or not a key is set, once the frame is switched on.
  const route = readFileSync("app/api/fund/rampnow-frame/route.ts", "utf8");
  assert.match(route, /const url = rampnowFrameOn\(\) \? rampnowFrameAddress\(\{ account: getAddress\(auth\.account\), euros: [^}]+\}, key\) : null;/);
  // In another currency when one is named with its amount (9 Oct 2026): a currency by its letters, an amount above zero.
  assert.match(route, /const ask = isCurrencyCode\(currency\) && Number\.isFinite\(amount\) && amount > 0 \? \{ currency, amount \} : undefined;/);
  const inDollars = new URL(rampnowFrameAddress({ account: ACCOUNT, ask: { currency: "USD", amount: 11.35 } }, "pk_live_test123"));
  assert.equal(inDollars.searchParams.get("srcCurrency"), "USD");
  assert.equal(inDollars.searchParams.get("srcAmount"), "11.35");
  assert.equal(inDollars.searchParams.get("apiKey"), "pk_live_test123");
  // A real payment has gone through the frame (the founder's, 3 Oct 2026), and the page says the frame with what that payment showed.
  const judges = readFileSync("app/judges/page.tsx", "utf8").replace(/\s+/g, " ");
  assert.ok(judges.includes("? \"Rampnow's page opens in a frame inside Viky. Its limit: Rampnow finishes a payment from its own page (the card buys USDC on Base, and its page then sends it on to Monad), so the frame has to stay open until the money arrives."));
  assert.ok(judges.includes("The frame has no cross: one way out under it while no payment is known, \\\"Go back without paying\\\", and one after five minutes without the money."));
  assert.ok(judges.includes("Left before the end, the payment waits at Rampnow: the screen that waits leads back to it, and opens another only when the person answers that they did not pay."));
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
  // The founder's sentences, word for word. A button says what its press does and never declares a state.
  assert.equal(PAY.rampnow.goBackWithoutPaying, "Go back without paying");
  assert.equal(PAY.rampnow.goBack, "Go back");
  assert.equal(PAY.rampnow.keepOpen, "Keep this window open: Rampnow is finishing your payment.");
  assert.equal(PAY.rampnow.failed, "The payment did not go through. Nothing was taken.");
  assert.equal(PAY.rampnow.finish, "Finish my payment");
  assert.equal(PAY.rampnow.didYouPay, "Did you pay by card?");
  assert.equal(PAY.rampnow.yesFinish, "Yes, finish my payment");
  assert.equal(PAY.rampnow.noPayNow, "No, pay now");
  assert.equal(PAY.rampnow.cantSignIn, "Can't sign in here?");
  for (const label of [PAY.rampnow.goBackWithoutPaying, PAY.rampnow.goBack, PAY.rampnow.finish, PAY.rampnow.yesFinish, PAY.rampnow.noPayNow, PAY.rampnow.lateOut, PAY.rampnow.openPage]) {
    assert.doesNotMatch(label, /\bI (have|am|did|paid|added)\b/i, `"${label}" says what the press does, never what the person is`);
  }
  // A payment known: the sentence and nothing that leads out. None known: the way out and the page beside.
  assert.match(sheet, /\{known \? \(\n\s*<p className=\{`\$\{BODY\} font-medium`\} role="status" data-rampnow-keep-open="">\n\s*\{W\.rampnow\.keepOpen\}/);
  assert.match(sheet, /data-rampnow-back=""[\s\S]*?\{finishing \? W\.rampnow\.goBack : W\.rampnow\.goBackWithoutPaying\}/);
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

test("the wait says a known payment and gives one button; with nothing known it asks, and only the answer 'No, pay now' pays again", () => {
  const paying = readFileSync("app/components/PayGift.tsx", "utf8");
  const from = paying.indexOf(") : wayIn === WAY_IN_USDC && rampnowFrameOn() && rampnowPending ? (");
  const waiting = paying.slice(from, paying.indexOf(") : wayIn === WAY_IN_USDC && rampnowBeside ? (", from));
  assert.ok(from > 0);
  assert.match(waiting, /onFinish=\{\(\) => setFrame\(\{ mode: "finish", orderUid: rampnowPending\.orderUid \}\)\}/, "the payment opened again in our frame");
  // "No, pay now": the payment is forgotten and the frame opens on a new one, in the same press.
  assert.match(waiting, /onPayNow=\{\(\) => \{\n\s*noteInRampnowJournal\("Viky: answered no, pay now"\);\n\s*clearRampnowPending\(address\);\n\s*setRampnowFailed\(false\);\n\s*if \(rampnowBeside\) payAtRampnowBeside\(address, wayInPage\(wayIn, \{ account: address, euros: toBuy \}\)\);\n\s*else setFrame\(\{ mode: "new" \}\);\n\s*\}\}/);
  assert.doesNotMatch(waiting, /openCard\b|openCardAgain|payByCard/, "never Pay by card here");
  // The pay press that arrives with a payment already waited for opens nothing.
  assert.match(paying, /if \(arrival && browser && address\) \{\n\s*setArrival\(false\);\n\s*if \(!rampnowPending && !rampnowBeside\) setFrame\(\{ mode: "new" \}\);\n\s*\}/);
  // Back from a new payment forgets it; back from a payment already started keeps it.
  assert.match(paying, /onBack=\{\(\) => \{\n(\s*\/\/[^\n]*\n)*\s*if \(frame\?\.mode !== "finish"\) clearRampnowPending\(address\);\n\s*setFrame\(null\);\n\s*\}\}/);
  // Paying, when nothing is waited for: "Pay €X by card", and the failure said once above it.
  assert.match(paying, /\{rampnowFailed \? <FieldRefusal id="rampnow-failed">\{P\.rampnow\.failed\}<\/FieldRefusal> : null\}/);
  assert.match(paying, /\{toBuy \? P\.payByCard\(moneyIn\(toBuy, "EUR"\)\) : W\.waiting\.openCard\}/);
  assert.equal(PAY.payByCard("€6.00"), "Pay €6.00 by card");
  // The title above it writes the amount as the button does: it said "30 EUR" over a button saying "€30.00".
  assert.match(paying, /step=\{W\.waiting\.title\(toBuy \? moneyIn\(toBuy, "EUR"\) : undefined\)\}/);
  assert.equal(FUND.waiting.title("€30.00"), "Waiting for your €30.00 payment");
  assert.equal(FUND.waiting.title(undefined), "Waiting for your payment");

  const block = readFileSync("app/kit/offer/RampnowWaiting.tsx", "utf8");
  const known = block.slice(block.indexOf("if (pending.known) {"), block.indexOf('data-rampnow-pending="asked"'));
  const asked = block.slice(block.indexOf('data-rampnow-pending="asked"'));
  // Known: the wheel, where it is, since when, and one button. No other button: the last way to a second payment was here.
  assert.match(known, /<span className="working-ring shrink-0" aria-hidden="true" \/>\n\s*<p className=\{BODY\}>\{W\.rampnow\.atRampnow\}<\/p>/);
  assert.match(known, /\{W\.rampnow\.needsItsPage\} <span data-rampnow-since="">\{W\.rampnow\.since\(minutes\)\}<\/span>/);
  assert.match(known, /\{finish\(W\.rampnow\.finish\)\}/);
  assert.doesNotMatch(known, /<button|onPayNow|noPayNow/, "one button, and it is the way back");
  // Not known: the question in the body's text, what makes it asked, and the two answers, which are actions.
  assert.match(asked, /<p className=\{BODY\}>\{W\.rampnow\.didYouPay\}<\/p>/);
  assert.match(asked, /\{W\.rampnow\.started\(minutes\)\}/);
  assert.match(asked, /\{finish\(W\.rampnow\.yesFinish\)\}\n\s*<button type="button" className=\{`\$\{SMALL_BUTTON\} self-start`\} onClick=\{onPayNow\}>\n\s*\{W\.rampnow\.noPayNow\}/);
  assert.doesNotMatch(asked, /working-ring/, "no wheel beside a question");
  // A payment started in a tab is finished in a tab; in the frame, in the frame.
  assert.match(block, /pending\.via === "tab" \? \(\n\s*<a href=\{rampnowFinishPage\(pending\.orderUid\)\} target="_blank" rel="noopener noreferrer" className=\{PRIMARY_BUTTON\}>/);
  assert.equal(PAY.rampnow.since(0), "Started less than a minute ago.");
  assert.equal(PAY.rampnow.since(1), "Started 1 minute ago.");
  assert.equal(PAY.rampnow.since(14), "Started 14 minutes ago.");
  assert.equal(PAY.rampnow.since(60), "Started 1 hour ago.");
  assert.equal(PAY.rampnow.since(200), "Started 3 hours ago.");
  assert.equal(PAY.rampnow.started(4), "A card payment was started 4 minutes ago.");
});

test("Home and Gifts say a card payment was started and give one button, which leads to the screen that waits", () => {
  const kept = readFileSync("app/kit/FinishTheGift.tsx", "utf8");
  const from = kept.indexOf("if (waiting.byRampnow && rampnowFrameOn() && pending) {");
  const started = kept.slice(from, kept.indexOf("  return (", kept.indexOf("</section>", from)));
  assert.ok(from > 0);
  assert.match(started, /<p className=\{BODY\}>\{PAY\.rampnow\.giftStarted\(waiting\.amount, waiting\.recipient, /);
  assert.match(started, /<Link href="\/fund\?step=paying" className=\{`\$\{SECONDARY_BUTTON\} block text-center no-underline`\}>\n\s*\{PAY\.rampnow\.finish\}/, "the weight of the button it replaces, and the way to the screen that waits");
  assert.equal(started.match(/<Link|<button|<a /g)?.length, 1, "one button");
  assert.doesNotMatch(started, /clearRampnowPending|working-ring|didYouPay/, "nothing here forgets the payment, and the question is asked on the screen that waits alone");
  assert.equal(PAY.rampnow.giftStarted("$30.00", "Boo", 4), "$30.00 for Boo: a card payment was started 4 minutes ago.");
  assert.equal(PAY.rampnow.giftStarted("$5.00", "", 0), "$5.00: a card payment was started less than a minute ago.");
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
  assert.match(sheet, /\{open && shown \? \(\n\s*<iframe\n\s*src=\{shown\}\n\s*title=\{W\.card\.frame\}\n\s*allow=\{RAMPNOW_FRAME_ALLOW\}/);
  // Each page the frame loads is written down, numbered: what it shows cannot be read, when it changes can.
  assert.match(sheet, /onLoad=\{\(\) => noteInRampnowJournal\(`Viky: the frame loaded a page \(\$\{\(loads\.current \+= 1\)\}\)`\)\}/);
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
  assert.match(sheetSource, /ref=\{frame\}\n\s*style=\{\{ height \}\}/);
  assert.doesNotMatch(sheetSource, /h-\[600px\]/, "no fixed height");
});

test("where the frame cannot keep the person signed in, it is never shown: Safari's engine before 18.4 and from 18.5 to 26.1", () => {
  const mac = (version: string) => `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${version} Safari/605.1.15`;
  const phone = (system: string, rest: string) => `Mozilla/5.0 (iPhone; CPU iPhone OS ${system} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) ${rest}`;
  // Safari on a Mac says its own version. The founder measured 17.6: the frame went back to its sign-in form.
  assert.equal(frameKeepsSignIn(mac("17.6")), false);
  assert.equal(frameKeepsSignIn(mac("18.3")), false);
  assert.equal(frameKeepsSignIn(mac("18.4")), true, "shipped in 18.4");
  assert.equal(frameKeepsSignIn(mac("18.4.1")), true);
  assert.equal(frameKeepsSignIn(mac("18.5")), false, "removed in 18.5");
  assert.equal(frameKeepsSignIn(mac("18.6")), false);
  assert.equal(frameKeepsSignIn(mac("26.0")), false);
  assert.equal(frameKeepsSignIn(mac("26.1")), false);
  assert.equal(frameKeepsSignIn(mac("26.2")), true, "shipped again in 26.2");
  assert.equal(frameKeepsSignIn(mac("27.0")), true);
  // On an iPhone every browser is Safari's engine. Safari writes its own version; since 26 it writes a system frozen
  // at 18_6 beside it, so the higher of the two is the engine's.
  assert.equal(frameKeepsSignIn(phone("17_6", "Version/17.6 Mobile/15E148 Safari/604.1")), false);
  assert.equal(frameKeepsSignIn(phone("18_4", "Version/18.4 Mobile/15E148 Safari/604.1")), true);
  assert.equal(frameKeepsSignIn(phone("18_6", "Version/26.0 Mobile/15E148 Safari/604.1")), false);
  assert.equal(frameKeepsSignIn(phone("18_6", "Version/26.2 Mobile/15E148 Safari/604.1")), true);
  assert.deepEqual(safariEngineVersion(phone("18_6", "Version/26.2 Mobile/15E148 Safari/604.1")), { major: 26, minor: 2 });
  // Chrome and Firefox there write the real system and no version of their own; Edge writes a version without its minor.
  assert.equal(frameKeepsSignIn(phone("17_6", "CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1")), false);
  assert.equal(frameKeepsSignIn(phone("26_2", "CriOS/143.0.0.0 Mobile/15E148 Safari/604.1")), true);
  assert.equal(frameKeepsSignIn(phone("26_1", "FxiOS/143.0 Mobile/15E148 Safari/605.1.15")), false);
  assert.deepEqual(safariEngineVersion(phone("17_5", "Version/17.0 EdgiOS/125.2535.60 Mobile/15E148 Safari/605.1.15")), { major: 17, minor: 5 });
  // An iPad asking for the desktop site says what a Mac says.
  assert.equal(frameKeepsSignIn(mac("17.6").replace("Macintosh", "Macintosh")), false);
  // Every other engine keeps the frame, whatever "Safari" its name carries.
  for (const other of [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:143.0) Gecko/20100101 Firefox/143.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
    "",
  ]) {
    assert.equal(safariEngineVersion(other), null, other);
    assert.equal(frameKeepsSignIn(other), true, other);
  }

  // The pay press: the frame where it can, Rampnow's page beside where it cannot, followed as started from a tab.
  const sheet = readFileSync("app/kit/offer/PaySheet.tsx", "utf8");
  assert.match(sheet, /if \(frameKeepsSignIn\(navigator\.userAgent\)\) return router\.push\("\/fund\?step=paying&rampnow=1"\);/);
  assert.match(sheet, /const beside = payAtRampnowBeside\(account, wayInPage\(way, \{ account, euros \}\)\);[\s\S]{0,400}return router\.push\("\/fund\?step=paying"\);/);
  const store = readFileSync("src/client/rampnow-pending.ts", "utf8");
  assert.match(store, /if \(!tab\) return false;[\s\S]{0,300}noteRampnowPending\(account, \{ via: "tab" \}\);\n\s*return true;/, "a tab the browser refused leaves nothing waited for");
  // The screen that waits never opens the frame there: its button that pays is a link to Rampnow's page in a tab.
  const wait = readFileSync("app/components/PayGift.tsx", "utf8");
  assert.match(wait, /const rampnowBeside = browser && rampnowFrameOn\(\) && !frameKeepsSignIn\(navigator\.userAgent\);/);
  assert.match(wait, /if \(!rampnowPending && !rampnowBeside\) setFrame\(\{ mode: "new" \}\);/);
  assert.match(wait, /pending=\{rampnowBeside \? \{ \.\.\.rampnowPending, via: "tab" \} : rampnowPending\}/);
  assert.match(wait, /if \(rampnowBeside\) payAtRampnowBeside\(address, wayInPage\(wayIn, \{ account: address, euros: toBuy \}\)\);\n\s*else setFrame\(\{ mode: "new" \}\);/);
  assert.match(wait, /data-rampnow-pay-beside=""\n\s*onClick=\{\(\) => \{\n\s*noteInRampnowJournal\("Viky: the card page was opened beside, from the wait"\);\n\s*noteRampnowPending\(address, \{ via: "tab" \}\);/);
  // And the judges page says the limit as it is, with what was measured and what was not.
  const judges = readFileSync("app/judges/page.tsx", "utf8");
  assert.match(judges, /Where the frame cannot keep the person signed in at Rampnow, it is never shown/);
  assert.match(judges, /Safari's engine before 18\.4 and from 18\.5 to 26\.1, so every browser on an iPhone at those versions/);
  assert.match(judges, /Measured on Safari 17\.6 on 4 Oct 2026, on a neutral page holding the same frame/);
  assert.match(judges, /it was not measured on viky\.cash in Safari, nor on the versions in between/);
});
