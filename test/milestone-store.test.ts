import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { configureGiftStore, ensureGiftSchema, loadGift, markBound, saveGift } from "../src/gift-store";
import {
  attestedReadings,
  configureMilestoneStore,
  ensureMilestoneSchema,
  followRename,
  latestRating,
  loadMilestoneGift,
  loadMilestoneGifts,
  readSince,
  recordReading,
  saveMilestoneGift,
  setMilestoneCode,
} from "../src/milestone-store";
import type { SqlExecutor } from "../src/proof-session-store";

let db: PGlite;

function pgliteExecutor(database: PGlite): SqlExecutor {
  return async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    const result = await database.query<Record<string, unknown>>(text, values);
    return result.rows;
  };
}

before(async () => {
  db = new PGlite();
  configureGiftStore(pgliteExecutor(db));
  configureMilestoneStore(pgliteExecutor(db));
  await ensureGiftSchema();
  await ensureMilestoneSchema();
  // Twice, as a migration run again would.
  await ensureMilestoneSchema();
});

after(async () => {
  configureGiftStore(undefined);
  configureMilestoneStore(undefined);
  await db.close();
});

const GIFT = "1000000";
const CONTRACT = "0x8dc281ac8a1c789fdb65a063b9225e98ec522f0e" as const;

async function aGift(giftId = GIFT) {
  await saveGift({
    giftId,
    funder: "0x000000000000000000000000000000000000A11C",
    contactHash: `0x${"51".repeat(32)}`,
    claimToken: "a-claim-token-of-some-length",
    goalType: 1,
    dailyTarget: 0,
    durationDays: 30,
    amount: 25_000_000n,
    createdTx: `0x${"aa".repeat(32)}`,
    escrow: CONTRACT,
    goalUsername: "erik",
    recipientName: "Erik",
    funderName: "Sam",
  });
}

test("a milestone gift keeps its condition, its cadence and where they stood when it was offered", async () => {
  await aGift();
  const readAt = new Date("2026-09-17T14:00:00Z");
  await saveMilestoneGift({ giftId: GIFT, conditionId: "chess-rating", mode: "rapid", standingAtOffer: 1904, standingReadAt: readAt });
  await saveMilestoneGift({ giftId: GIFT, conditionId: "chess-rating", mode: "blitz", standingAtOffer: 1, standingReadAt: readAt });
  const record = await loadMilestoneGift(GIFT);
  assert.deepEqual(record, { giftId: GIFT, conditionId: "chess-rating", mode: "rapid", standingAtOffer: 1904, standingReadAt: readAt, portal: null, course: null, gradeScale: null, subjectKey: null }, "the first record stands, and a gift on no portal says so");
  assert.equal((await loadGift(GIFT))?.usernameSource, "funder");
  const many = await loadMilestoneGifts([GIFT, "999"]);
  assert.deepEqual([...many.keys()], [GIFT]);
});

test("the code goes on the name the funder gave, and only until the gift is connected", async () => {
  const expiresAt = new Date(Date.now() + 3_600_000);
  assert.equal(await setMilestoneCode(GIFT, "KXQPRT", expiresAt), true);
  const coded = await loadGift(GIFT);
  assert.equal(coded?.bindingCode, "KXQPRT");
  assert.equal(coded?.goalUsername, "erik", "the name is part of what the funder signed for");
  assert.equal(coded?.usernameSource, "funder");
  await markBound(GIFT, "41");
  assert.equal(await setMilestoneCode(GIFT, "ZZZZZZ", expiresAt), false);
});

test("a rename is followed only for the same player", async () => {
  assert.equal(await followRename(GIFT, "999", "someone"), false);
  assert.equal((await loadGift(GIFT))?.goalUsername, "erik");
  assert.equal(await followRename(GIFT, "41", "erik_renamed"), true);
  assert.equal((await loadGift(GIFT))?.goalUsername, "erik_renamed");
});

test("readings are kept with what became of them, the latest is today, and a recent one is not read again", async () => {
  const base = { giftId: GIFT, username: "erik", playerId: "41", ratedAt: 1_789_000_000, nullifier: null, txHash: null } as const;
  await recordReading({ ...base, purpose: "start", attested: true, rating: 1904, observedAt: 1_789_600_000, outcome: "started", txHash: `0x${"51".repeat(32)}`, nullifier: `0x${"ee".repeat(32)}`, proofs: [{ claimData: { identifier: "0x01" } }] });
  await recordReading({ ...base, purpose: "look", attested: false, rating: 1911, observedAt: 1_789_650_000, outcome: "notYet" });
  await recordReading({ ...base, purpose: "reach", attested: true, rating: null, observedAt: 1_789_660_000, outcome: "refused:FETCH_FAILED" });
  const latest = await latestRating(GIFT);
  assert.equal(latest?.rating, 1911, "a reading with no rating is not today");
  assert.equal(latest?.attested, false);
  const proven = await attestedReadings(GIFT);
  assert.deepEqual(proven.map((reading) => reading.outcome), ["started", "refused:FETCH_FAILED"]);
  assert.equal(await readSince(GIFT, 1_789_649_000), true, "a look counts as a reading of this pass");
  assert.equal(await readSince(GIFT, 1_789_670_000), false);
  assert.equal(await readSince(GIFT, 1_789_590_000), true);
  const rows = await db.query<{ proofs: unknown }>("SELECT proofs FROM viky_milestone_readings WHERE purpose = 'start'");
  assert.deepEqual(rows.rows[0].proofs, [{ claimData: { identifier: "0x01" } }], "the proofs that moved money are kept");
});
