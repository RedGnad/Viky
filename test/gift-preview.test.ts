import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after, before } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { giftPreview, previewOf } from "../src/gift-preview";
import { configureGiftStore, ensureGiftSchema, newClaimToken, saveGift } from "../src/gift-store";
import type { SqlExecutor } from "../src/proof-session-store";

/**
 * The preview a messaging app draws from a gift's link. Three cases, and the rule behind all of them: the funder's
 * name only with the link's key, never without it.
 */

let db: PGlite;
const NAMED_KEY = newClaimToken();
const UNNAMED_KEY = newClaimToken();

before(async () => {
  db = new PGlite();
  const executor: SqlExecutor = async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    return (await db.query<Record<string, unknown>>(text, values)).rows;
  };
  configureGiftStore(executor);
  await ensureGiftSchema();
  const common = {
    funder: "0x000000000000000000000000000000000000A11C",
    contactHash: `0x${"51".repeat(32)}` as const,
    goalType: 1,
    dailyTarget: 10,
    durationDays: 7,
    amount: 25_000_000n,
    escrow: "0x00000000000000000000000000000000000000e1" as const,
  };
  await saveGift({ ...common, giftId: "10", claimToken: NAMED_KEY, createdTx: `0x${"10".repeat(32)}`, recipientName: "Léa", funderName: "Maman" });
  await saveGift({ ...common, giftId: "11", claimToken: UNNAMED_KEY, createdTx: `0x${"11".repeat(32)}` });
});

after(async () => {
  configureGiftStore(undefined);
  await db.close();
});

test("with the link's key and the names, the preview names the funder, with the register's line under it", async () => {
  const preview = await giftPreview("10", NAMED_KEY);
  assert.equal(preview.title, "Maman put $25.00 in your name");
  assert.equal(preview.description, "A Duolingo lesson each day: each day you do one, that day's share becomes yours.");
});

test("with the link's key but no names, it is someone", async () => {
  assert.equal((await giftPreview("11", UNNAMED_KEY)).title, "Someone put $25.00 in your name");
});

test("without the key, or with a wrong one, a gift with names still says someone and never a name", async () => {
  for (const key of [null, "", `${NAMED_KEY}x`, UNNAMED_KEY]) {
    const preview = await giftPreview("10", key);
    assert.equal(preview.title, "Someone put $25.00 in your name", String(key));
    assert.doesNotMatch(`${preview.title} ${preview.description}`, /Maman|Léa/);
  }
  // The pure rule, the same way round.
  assert.equal(previewOf({ amount: 7_000_000n, funderName: "Maman", goalType: 1 }, false).title, "Someone put $7.00 in your name");
  assert.equal(previewOf({ amount: 7_000_000n, funderName: "Maman", goalType: 1 }, true).title, "Maman put $7.00 in your name");
});

test("a gift nobody has says no more than the link itself, and the page asks for the preview with the link's key", async () => {
  assert.equal((await giftPreview("999", NAMED_KEY)).title, "A gift on Viky");
  const page = readFileSync("app/g/[id]/page.tsx", "utf8");
  assert.match(page, /export async function generateMetadata/);
  assert.match(page, /giftPreview\(id, keyOf\(t\)\)/);
  assert.match(page, /title: \{ absolute: preview\.title \}/);
});
