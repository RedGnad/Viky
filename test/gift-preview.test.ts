import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after, before } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { giftPreview, previewOf } from "../src/gift-preview";
import { configureGiftStore, ensureGiftSchema, newClaimToken, saveGift } from "../src/gift-store";
import { configureMilestoneStore, ensureMilestoneSchema, saveMilestoneGift } from "../src/milestone-store";
import type { SqlExecutor } from "../src/proof-session-store";

/**
 * The preview a messaging app draws from a gift's link. Three cases, and the rule behind all of them: the funder's
 * name only with the link's key, never without it.
 */

let db: PGlite;
const NAMED_KEY = newClaimToken();
const UNNAMED_KEY = newClaimToken();
const MILESTONE_KEY = newClaimToken();
const LOST_KEY = newClaimToken();

before(async () => {
  db = new PGlite();
  const executor: SqlExecutor = async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    return (await db.query<Record<string, unknown>>(text, values)).rows;
  };
  configureGiftStore(executor);
  configureMilestoneStore(executor);
  await ensureGiftSchema();
  await ensureMilestoneSchema();
  const common = {
    funder: "0x000000000000000000000000000000000000A11C",
    contactHash: `0x${"51".repeat(32)}` as const,
    goalType: 1,
    dailyTarget: 10,
    durationDays: 7,
    amount: 25_000_000n,
    escrow: "0x00000000000000000000000000000000000000e1" as const,
  };
  await saveGift({ ...common, giftId: "10", claimToken: NAMED_KEY, createdTx: `0x${"10".repeat(32)}`, recipientName: "Léa", funderName: "Mom" });
  await saveGift({ ...common, giftId: "11", claimToken: UNNAMED_KEY, createdTx: `0x${"11".repeat(32)}` });
  // A milestone gift, numbered as its contract numbers them, with the same goal type 1 that means a Duolingo lesson
  // on the daily contract: the gift the founder created on 18 Sep 2026, and the one that read the wrong condition.
  await saveGift({ ...common, giftId: "1000000", claimToken: MILESTONE_KEY, createdTx: `0x${"12".repeat(32)}`, funderName: "Red", recipientName: "Sevy" });
  await saveMilestoneGift({ giftId: "1000000", conditionId: "chess-rating", mode: "rapid", standingAtOffer: 383, standingReadAt: new Date("2026-09-18T20:01:36Z") });
  // A milestone gift whose record was never written: its number is all the preview knows about it.
  await saveGift({ ...common, giftId: "1000001", claimToken: LOST_KEY, createdTx: `0x${"13".repeat(32)}`, funderName: "Red" });
});

after(async () => {
  configureGiftStore(undefined);
  configureMilestoneStore(undefined);
  await db.close();
});

test("with the link's key and the names, the preview names the funder, with the register's line under it", async () => {
  const preview = await giftPreview("10", NAMED_KEY);
  assert.equal(preview.title, "Mom put $25.00 in your name");
  assert.equal(preview.description, "A Duolingo lesson each day: each day you do one, that day's share becomes yours.");
});

test("with the link's key but no names, it is someone", async () => {
  assert.equal((await giftPreview("11", UNNAMED_KEY)).title, "Someone put $25.00 in your name");
});

test("without the key, or with a wrong one, a gift with names still says someone and never a name", async () => {
  for (const key of [null, "", `${NAMED_KEY}x`, UNNAMED_KEY]) {
    const preview = await giftPreview("10", key);
    assert.equal(preview.title, "Someone put $25.00 in your name", String(key));
    assert.doesNotMatch(`${preview.title} ${preview.description}`, /Mom|Léa/);
  }
  // The pure rule, the same way round.
  assert.equal(previewOf({ amount: 7_000_000n, funderName: "Mom", goalType: 1 }, false).title, "Someone put $7.00 in your name");
  assert.equal(previewOf({ amount: 7_000_000n, funderName: "Mom", goalType: 1 }, true).title, "Mom put $7.00 in your name");
});

const RATES = { date: "2026-09-29", usdPerEur: 1.25, eurPerUsd: 0.8, xofPerUsd: 0.8 * 655.957, eurPer: { USD: 1.25, EUR: 1, XOF: 655.957 }, readAtMs: Date.now() };

test("with the link's key, the amount is said about, in the funder's own currency, and in dollars without it", () => {
  const record = { amount: 25_000_000n, funderName: "Mom", goalType: 1 };
  assert.equal(previewOf(record, true, {}, { currency: "EUR", rates: RATES }).title, "Mom put about €20.00 in your name");
  // The CFA franc has no subunit, and its sign stands apart from the figure as Intl writes it (spaces vary by runtime).
  assert.match(previewOf(record, true, {}, { currency: "XOF", rates: RATES }).title, /^Mom put about F\sCFA\s13,119 in your name$/);
  // A guessed number names nobody, so it does not say where the funder lives either.
  assert.equal(previewOf(record, false, {}, { currency: "EUR", rates: RATES }).title, "Someone put $25.00 in your name");
  // A currency the day's file does not carry is not guessed at.
  assert.equal(previewOf(record, true, {}, { currency: "JPY", rates: RATES }).title, "Mom put $25.00 in your name");
});

test("a milestone gift's line is its own condition's, not the one its goal type means on the daily contract", async () => {
  const preview = await giftPreview("1000000", MILESTONE_KEY);
  assert.equal(preview.title, "Red put $25.00 in your name");
  assert.equal(preview.description, "A chess rating on Chess.com: the gift is yours when you reach it.");
  assert.doesNotMatch(preview.description, /Duolingo/);
});

test("a milestone gift whose condition cannot be read says what is true of every milestone, and never a daily line", async () => {
  const preview = await giftPreview("1000001", LOST_KEY);
  assert.equal(preview.description, "It becomes yours when you reach it.");
  // The pure rule, both ways round: a number alone never sends a milestone to the daily register.
  const record = { amount: 25_000_000n, funderName: "Red", goalType: 1 };
  assert.equal(previewOf(record, true, { milestone: true }).description, "It becomes yours when you reach it.");
  assert.equal(previewOf(record, true, { milestone: true, conditionId: "chess-rating" }).description, "A chess rating on Chess.com: the gift is yours when you reach it.");
  assert.equal(previewOf(record, true).description, "A Duolingo lesson each day: each day you do one, that day's share becomes yours.");
});

test("a gift nobody has says no more than the link itself, and the page asks for the preview with the link's key", async () => {
  assert.equal((await giftPreview("999", NAMED_KEY)).title, "A gift on Viky");
  const page = readFileSync("app/g/[id]/page.tsx", "utf8");
  assert.match(page, /export async function generateMetadata/);
  assert.match(page, /giftPreview\(id, keyOf\(t\)\)/);
  assert.match(page, /title: \{ absolute: preview\.title \}/);
});
