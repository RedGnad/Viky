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
  touchSameLook,
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

test("the same look again moves the newest row's moment and adds no row; anything else is a row of its own (the audit of 1 Oct 2026)", async () => {
  // A pass every five minutes wrote one identical row per gift each time: 288 a day for a rating that had not moved.
  const gift = "1000777";
  const look = { giftId: gift, purpose: "look", attested: false, username: "erik", playerId: "41", rating: 1911, ratedAt: 1_789_000_000, rd: 42, nullifier: null, outcome: "notYet", txHash: null } as const;
  const count = async () => Number((await db.query<{ n: number }>("SELECT count(*)::int AS n FROM viky_milestone_readings WHERE gift_id = $1", [gift])).rows[0].n);

  // Nothing read yet: there is no row to move, and the caller writes the look.
  assert.equal(await touchSameLook({ ...look, observedAt: 1_789_700_000 }), false);
  await recordReading({ ...look, observedAt: 1_789_700_000 });

  // Five minutes later, the same answer: no new row, and the gift counts as read at the later moment.
  assert.equal(await touchSameLook({ ...look, observedAt: 1_789_700_300 }), true);
  assert.equal(await count(), 1);
  assert.equal((await latestRating(gift))?.observedAt, 1_789_700_300);
  assert.equal(await readSince(gift, 1_789_700_200), true, "the pass after it still skips a gift read this recently");

  // The rating moved, or a game was played since: that is news, and a row of its own.
  assert.equal(await touchSameLook({ ...look, rating: 1920, observedAt: 1_789_700_600 }), false);
  assert.equal(await touchSameLook({ ...look, ratedAt: 1_789_700_500, observedAt: 1_789_700_600 }), false);
  assert.equal(await count(), 1, "nothing was changed by a look that was not the same");

  // The newest row is never moved when it is anything but an unattested "not yet": a start, a reach, a refusal stay
  // where and when they were, and the first reading the journal page reads is never touched.
  await recordReading({ ...look, purpose: "reach", attested: true, observedAt: 1_789_700_900, outcome: "notYet", nullifier: `0x${"ee".repeat(32)}` });
  assert.equal(await touchSameLook({ ...look, observedAt: 1_789_701_200 }), false, "the newest row is an attested reading");
  assert.equal(await touchSameLook({ ...look, purpose: "reach", attested: true, observedAt: 1_789_701_200 }), false, "and an attested reading is never folded into another");
  assert.equal(await count(), 2);
});
