// The currency a gift speaks, and the picture and the words its link travels with (the founder, 1 Oct 2026).

import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import test, { after, before } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { conditionById } from "../src/conditions";
import { markOf } from "../src/currencies";
import { previewOf } from "../src/gift-preview";
import { configureGiftStore, ensureGiftSchema, keepFunderCurrency, loadGift, newClaimToken, saveGift } from "../src/gift-store";
import { morningSentence } from "../src/morning-message";
import { tellAboutDays, type TellingDeps } from "../src/morning-send";
import { previewLine, sharedWith } from "../src/preview-line";
import type { SqlExecutor } from "../src/proof-session-store";
import type { Rates } from "../src/rates";

const FUNDER = "0x000000000000000000000000000000000000A11C";
const RATES: Rates = { date: "2026-09-30", usdPerEur: 1.25, eurPerUsd: 0.8, xofPerUsd: 0.8 * 655.957, eurPer: { USD: 1.25, EUR: 1, XOF: 655.957, KRW: 1_600, GBP: 0.86 }, readAtMs: Date.now() };

let db: PGlite;
before(async () => {
  db = new PGlite();
  const executor: SqlExecutor = async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    return (await db.query<Record<string, unknown>>(text, values)).rows;
  };
  configureGiftStore(executor);
  await ensureGiftSchema();
  await saveGift({ giftId: "21", funder: FUNDER, contactHash: `0x${"51".repeat(32)}`, claimToken: newClaimToken(), goalType: 1, dailyTarget: 10, durationDays: 7, amount: 25_000_000n, createdTx: `0x${"21".repeat(32)}`, escrow: "0x00000000000000000000000000000000000000e1", recipientName: "Léa", funderName: "Maman" });
});
after(async () => {
  configureGiftStore(undefined);
  await db.close();
});

test("a gift keeps the currency its funder was reading in when they made it, once", async () => {
  assert.equal((await loadGift("21"))!.funderCurrency ?? null, null, "a gift made before keeps none");
  assert.equal(await keepFunderCurrency("21", "0x000000000000000000000000000000000000B0B0", "EUR"), false, "only its funder's creation writes it");
  assert.equal(await keepFunderCurrency("21", FUNDER, "eur"), false, "a code, or nothing");
  assert.equal(await keepFunderCurrency("21", FUNDER, "EUR"), true);
  assert.equal((await loadGift("21"))!.funderCurrency, "EUR");
  // The funder reads in another currency later: the gift goes on speaking the one it was made in.
  assert.equal(await keepFunderCurrency("21", FUNDER, "GBP"), false);
  assert.equal((await loadGift("21"))!.funderCurrency, "EUR");
  // The three routes that make a gift write it, from the same decision the funder's page was drawn with.
  for (const route of ["app/api/gift/create/route.ts", "app/api/gift/milestone/create/route.ts", "app/api/gift/certificate/create/route.ts"]) {
    assert.match(readFileSync(route, "utf8"), /await readingCurrency\(auth\.account\)\.then\(\(currency\) => keepFunderCurrency\(created\.giftId, auth\.account, currency\)\)\.catch\(\(\) => undefined\);/, route);
  }
  // And the link's title reads it before the account's choice of today.
  assert.match(readFileSync("src/gift-preview.ts", "utf8"), /const currency = record\.funderCurrency \?\? \(await loadPreferences\(record\.funder\)/);
});

test("the title names its amount in any currency, so the picture can set it in the text face", () => {
  const record = { amount: 25_000_000n, funderName: "Maman", goalType: 1 };
  assert.deepEqual(previewOf(record, true, {}, { currency: "EUR", rates: RATES }).amount, "€20.00");
  assert.match(previewOf(record, true, {}, { currency: "XOF", rates: RATES }).amount!, /^F\sCFA\s13,119$/);
  assert.equal(previewOf(record, true, {}, { currency: "KRW", rates: RATES }).amount, "₩32,000");
  assert.equal(previewOf(record, true).amount, "$25.00");
  assert.equal(previewOf(record, false, {}, { currency: "EUR", rates: RATES }).amount, "$25.00", "a link without its key says dollars, and names nobody");
  for (const currency of ["EUR", "XOF", "KRW"]) {
    const preview = previewOf(record, true, {}, { currency, rates: RATES });
    assert.ok(preview.title.includes(preview.amount!), `${currency}: the amount is in the title as written`);
  }
  const picture = readFileSync("app/og/preview.tsx", "utf8");
  assert.doesNotMatch(picture, /title\.match\(/, "no longer found by looking for a dollar sign");
  assert.match(picture, /const at = amount \? title\.indexOf\(amount\) : -1;/);
  assert.match(readFileSync("app/api/gift/[id]/preview-image/route.tsx", "utf8"), /amount: preview\.amount,/);
});

test("the picture keeps everything a person reads inside the central square", async () => {
  const { PREVIEW_COLUMN, PREVIEW_SIZE, PREVIEW_SQUARE } = await import("../app/og/preview");
  assert.deepEqual(PREVIEW_SIZE, { width: 1200, height: 630 });
  assert.deepEqual(PREVIEW_SQUARE, { left: 285, width: 630 }, "what Instagram on a computer keeps");
  assert.deepEqual(PREVIEW_COLUMN, { left: 320, width: 560, bottom: 40 }, "the founder's mockup of 1 Oct 2026");
  assert.equal(PREVIEW_COLUMN.left - PREVIEW_SQUARE.left, 35, "35 of air on the left");
  assert.equal(PREVIEW_SQUARE.left + PREVIEW_SQUARE.width - (PREVIEW_COLUMN.left + PREVIEW_COLUMN.width), 35, "and on the right");
  const picture = readFileSync("app/og/preview.tsx", "utf8");
  // The figure, the name and the card are all inside the column; only the decoration is placed outside it.
  const column = picture.slice(picture.indexOf("left: PREVIEW_COLUMN.left"));
  for (const inside of ["<img src={drawing}", ">Viky</div>", "{words(before", "{under}</div>"]) assert.ok(column.includes(inside), inside);
  assert.equal((picture.match(/\{circle\(/g) ?? []).length, 6, "a sun, two hills, three dots, and nothing to read among them");
  // One layout for the site's link and for a gift's.
  assert.match(readFileSync("app/opengraph-image.tsx", "utf8"), /previewImage\(\{ title: HOME\.promise, under: HOME\.promiseUnder/);
});

test("the faces carry the sign of every currency offered, and names in Cyrillic and Greek", () => {
  for (const file of ["app/fonts/Fredoka-SemiBold.ttf", "app/fonts/DMSans-Bold.ttf", "app/fonts/NotoSans-Bold.ttf", "app/fonts/NotoSansThai-Baht.ttf"]) assert.ok(existsSync(file), file);
  assert.ok(statSync("app/fonts/NotoSans-Bold.ttf").size > 400_000, "the whole face, not a Latin cut of it");
  const picture = readFileSync("app/og/preview.tsx", "utf8");
  assert.match(picture, /\{ name: "Noto Sans", data: wide, weight: 700, style: "normal" \},\s*\{ name: "Noto Sans Thai", data: baht, weight: 700, style: "normal" \},/);
  // The signs of the currencies offered in production on 1 Oct 2026, as the title writes them.
  const signs = ["AUD", "BRL", "GBP", "CAD", "XAF", "CZK", "DKK", "EUR", "HKD", "HUF", "ISK", "INR", "IDR", "JPY", "MYR", "MXN", "NZD", "NOK", "PHP", "PLN", "RON", "SGD", "ZAR", "KRW", "SEK", "CHF", "THB", "TRY", "USD", "XOF"].map((code) => markOf(code).sign);
  assert.ok(signs.includes("₩") && signs.includes("₱") && signs.includes("₺") && signs.includes("₹") && signs.includes("฿"), "the five the look's two faces do not carry");
  // The files travel with the two routes that draw.
  const config = readFileSync("next.config.mjs", "utf8");
  assert.match(config, /"\/opengraph-image": \["\.\/app\/fonts\/\*\.ttf"/);
  assert.match(readFileSync("app/fonts/README.md", "utf8"), /NotoSans-Bold\.ttf[^]*NotoSansThai-Baht\.ttf/);
});

test("a link is shared with who gave it, how much in their own currency, and what it is", () => {
  const lesson = conditionById("duolingo-daily");
  assert.equal(sharedWith("Maman", "about €21.67", previewLine(lesson, false)), `Maman put about €21.67 in your name. ${previewLine(lesson, false)}`);
  assert.equal(sharedWith("  ", "$25.00", "It becomes yours as you go."), "This is for you: $25.00 in your name. It becomes yours as you go.");
  assert.equal(sharedWith(null, "$25.00", previewLine(undefined, true)), "This is for you: $25.00 in your name. It becomes yours when you reach it.");
  // The link follows the words: it is the share's own address, on both screens that share one.
  assert.match(readFileSync("app/components/PayGift.tsx", "utf8"), /text: sharedWith\(made\.funderName, spokenAmount\(led\), previewLine\(madeCondition, madeMilestone\)\), url: made\.claimUrl \}/);
  assert.match(readFileSync("app/kit/LinkAgain.tsx", "utf8"), /navigator\.share\(\{ title: "Viky", text: shareText, url: link \}\)/);
});

test("no address is published for a gift's page without its key: the exact link, or nothing", () => {
  const page = readFileSync("app/g/[id]/page.tsx", "utf8");
  const metadata = page.slice(page.indexOf("export async function generateMetadata"), page.indexOf("async function giftOnTheServer"));
  assert.doesNotMatch(metadata, /\burl: `[^`]*\/g\/\$\{id\}`|alternates|canonical/, "nothing names the page by an address that lost its key");
  assert.doesNotMatch(metadata, /openGraph: \{[^}]*\burl:/, "and og:url is not written at all");
  // The picture's own address carries the key, so it names the funder exactly where the page does.
  assert.match(metadata, /preview-image\$\{linkKey \? `\?t=\$\{encodeURIComponent\(linkKey\)\}` : ""\}/);
});

test("a message sent outside the app speaks the currency of the account it is sent to", async () => {
  const sent: Array<{ account: string; message: string }> = [];
  const deps: TellingDeps = {
    subscriptions: async () => [
      { endpoint: "https://push.example/funder", giftId: "21", account: FUNDER, p256dh: "p", auth: "a" },
      { endpoint: "https://push.example/recipient", giftId: "21", account: "0x000000000000000000000000000000000000B0B0", p256dh: "p", auth: "a" },
    ] as never,
    claim: async () => true,
    forgetEndpoint: async () => undefined,
    facts: async () => ({ funder: FUNDER, names: { recipientName: "Léa", funderName: "Maman" }, perDayDisplay: "$3.57", amountDisplay: "$25.00", perDayUnits: 3_570_000n, amountUnits: 25_000_000n, words: { yesterday: "yesterday's lesson" } }),
    send: async (subscription, payload) => {
      sent.push({ account: subscription.account, message: (JSON.parse(payload) as { message: string }).message });
      return { ok: true };
    },
    // The funder's account reads in euros, the recipient's keeps none.
    speak: async (account, units) => (account === FUNDER ? `about €${((Number(units) / 1_000_000) * 0.8).toFixed(2)}` : `$${(Number(units) / 1_000_000).toFixed(2)}`),
    log: () => {},
  };
  assert.equal(await tellAboutDays("21", [{ day: 20_000, outcome: "earned" }] as never, deps), 2);
  assert.deepEqual(sent, [
    { account: FUNDER, message: "Léa did yesterday's lesson. About €2.86 is theirs." },
    { account: "0x000000000000000000000000000000000000B0B0", message: "Yesterday counted. $3.57 is yours." },
  ]);
  // An amount that opens its sentence takes a capital; one inside a sentence does not.
  assert.equal(morningSentence("funder", { kind: "day", outcome: "returned", amount: "about €2.86" }, { recipientName: null, funderName: null }), "Yesterday came back to you: about €2.86.");
  // The real thing reads the account's own currency and the day's rate.
  const live = readFileSync("src/morning-send-live.ts", "utf8");
  assert.match(live, /speak: spokenFor,/);
  assert.match(live, /const currency = await loadPreferences\(account\)\.then\(\(kept\) => kept\.displayCurrency\)/);
});

test("the privacy page says where the proposed currency comes from, and where it is kept", () => {
  const privacy = readFileSync("app/privacy/page.tsx", "utf8");
  assert.match(privacy, /proposed, never asked, from the country your connection comes from, and from your device&apos;s language/);
  assert.match(privacy, /a cookie, viky\.currency, one year/);
  assert.match(privacy, /a gift keeps the currency its giver was reading in/);
});
