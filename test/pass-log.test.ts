import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { COUNTING_PASS, dailyPass, SETTLING_PASS, type DailyPassDeps } from "../src/daily-pass";
import { configureGiftStore, ensureGiftSchema, recordSettledDays } from "../src/gift-store";
import { COUNTING_PASS_UTC, SETTLING_PASS_UTC } from "../src/pass-schedule";
import { configurePassLog, ensurePassSchema, heldDays, ON_TIME_TOLERANCE_SECONDS, passesSince, readingTotals, recordPass, refusalsByCode } from "../src/pass-log";
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
  configurePassLog(pgliteExecutor(db));
  await ensureGiftSchema();
  await ensurePassSchema();
  // Twice, as a migration run again would.
  await ensurePassSchema();
});

after(async () => {
  configureGiftStore(undefined);
  configurePassLog(undefined);
  await db.close();
});

beforeEach(async () => {
  await db.query("DELETE FROM viky_passes");
  await db.query("DELETE FROM viky_days");
});

const ESCROW = "0x00000000000000000000000000000000000000e1" as const;
const TX = `0x${"aa".repeat(32)}` as const;
/** A moment inside a gift's window, used as the pass's own clock so the day a hold is about is fixed. */
const NOW = 1_789_000_000;
const HELD_DAY = Math.floor(NOW / 86_400) - 1;
const LIVE = {
  cancelled: false,
  finalised: false,
  startDay: 20_708,
  recipient: "0x000000000000000000000000000000000000b0b0" as `0x${string}` | null,
  fundedAt: NOW - 86_400,
  claimedAt: NOW - 86_400,
};

/**
 * Three bound gifts: one read, one refused for a reason of ours (the reading is held), one refused about the person's
 * own account (which settles as any other day).
 */
function threeGifts(): DailyPassDeps {
  return {
    boundGifts: async () => [{ giftId: "1" }, { giftId: "2" }, { giftId: "3" }],
    allGifts: async () => [
      { giftId: "1", escrow: ESCROW },
      { giftId: "2", escrow: ESCROW },
      { giftId: "3", escrow: ESCROW },
    ],
    read: async () => LIVE,
    count: async (giftId: string) => {
      if (giftId === "1") return { kind: "counted", giftId, xp: 320, creditedDays: 1, hash: "0xc" } as const;
      if (giftId === "2") return { kind: "refused", giftId, code: "FETCH_FAILED", message: "the source could not be read" } as const;
      return { kind: "refused", giftId, code: "PROFILE_NOT_FOUND", message: "no public profile" } as const;
    },
    drain: async () => ({ hash: "0xd" }),
    finalise: async () => ({ hash: "0xf" }),
    refund: async () => ({ hash: "0xr" }),
    start: async () => ({ address: "0xrelayer", balance: 12n }),
    nowSeconds: () => NOW,
    journal: recordPass,
  };
}

async function passRows(): Promise<Record<string, unknown>[]> {
  return (await db.query<Record<string, unknown>>("SELECT * FROM viky_passes ORDER BY id")).rows;
}

test("a counting pass writes one row, with what it read and what it held", async () => {
  await dailyPass(COUNTING_PASS, threeGifts());

  const rows = await passRows();
  assert.equal(rows.length, 1, "one run, one row");
  assert.equal(rows[0].plan, "counting");
  assert.equal((rows[0].started_at as Date).getTime(), NOW * 1_000);
  assert.ok((rows[0].ended_at as Date).getTime() >= (rows[0].started_at as Date).getTime());
  assert.equal(rows[0].readings_attempted, 3);
  assert.equal(rows[0].readings_succeeded, 1, "only the reading that answered counts as one");
  assert.equal(rows[0].held_ours, 1);
  assert.equal(rows[0].errors, 1, "the refusal about the person's own account is not ours and is not an error");
  assert.deepEqual(rows[0].holds, [{ giftId: "2", day: HELD_DAY }]);
  assert.deepEqual(rows[0].failures, { FETCH_FAILED: 1 });
  // Both refusals are counted by their own code, ours or not: the journal used to keep only ours, so a morning of
  // refusals read as a silent one (the audit of 18 Sep, gap a).
  assert.deepEqual(rows[0].refusals, { FETCH_FAILED: 1, PROFILE_NOT_FOUND: 1 });

  assert.deepEqual(await readingTotals(), { attempted: 3, succeeded: 1 });
  assert.deepEqual(await refusalsByCode(), [
    { code: "FETCH_FAILED", times: 1 },
    { code: "PROFILE_NOT_FOUND", times: 1 },
  ]);
});

test("a morning of refusals is told apart from a quiet one, by code (the audit's gap a)", async () => {
  // Three gifts, three refusals the contract gives for a good reason: the day offered was already settled. Before
  // this, the row read "3 asked, 0 credited, 0 errors, nothing held", which is exactly what a quiet morning writes.
  await dailyPass(COUNTING_PASS, {
    ...threeGifts(),
    count: async (giftId: string) => ({ kind: "refused", giftId, code: "NothingToCredit", message: "nothing to credit" }) as const,
  });

  const rows = await passRows();
  assert.equal(rows[0].readings_attempted, 3);
  assert.equal(rows[0].readings_succeeded, 0);
  assert.equal(rows[0].errors, 0, "none of them was ours, so none is an error");
  assert.equal(rows[0].held_ours, 0, "and none is held: the gift can settle as any other day");
  assert.deepEqual(rows[0].refusals, { NothingToCredit: 3 }, "and the reason is written down, in the contract's own word");
  assert.deepEqual(await refusalsByCode(), [{ code: "NothingToCredit", times: 3 }]);
});

test("a run that met no refusal writes none, and the page has nothing to show", async () => {
  await dailyPass(COUNTING_PASS, {
    ...threeGifts(),
    count: async (giftId: string) => ({ kind: "counted", giftId, xp: 10, creditedDays: 1, hash: "0xc" }) as const,
  });
  assert.deepEqual((await passRows())[0].refusals, {});
  assert.deepEqual(await refusalsByCode(), []);
});

test("a gift the pass never asks the source about is not counted as a reading", async () => {
  // Three bound gifts, none of which is asked anything: one was already counted this morning, one is over, one has
  // nobody connected to it. Nothing was read, so the page must not say the source was asked three times.
  await dailyPass(COUNTING_PASS, {
    ...threeGifts(),
    count: async (giftId: string) =>
      ({ kind: "already", giftId, reason: giftId === "1" ? "counted_today" : giftId === "2" ? "finished" : "not_bound" }) as const,
  });

  const rows = await passRows();
  assert.equal(rows[0].readings_attempted, 0, "no reading was taken, whatever the pass looked at");
  assert.equal(rows[0].readings_succeeded, 0);
  assert.equal(rows[0].errors, 0, "a gift with nothing to read is not a failure");
  assert.deepEqual(await readingTotals(), { attempted: 0, succeeded: 0 });
});

test("a held day is open until it is settled, then caught up, or lost when it went back", async () => {
  await dailyPass(COUNTING_PASS, threeGifts());
  assert.deepEqual(await heldDays(), { caughtUp: 0, lost: 0, open: 1 }, "nothing settled that day yet");

  // The same day held again by the next pass is still one day.
  await dailyPass(COUNTING_PASS, threeGifts());
  assert.deepEqual(await heldDays(), { caughtUp: 0, lost: 0, open: 1 });

  await recordSettledDays("2", [{ day: HELD_DAY, outcome: "earned" }], TX);
  assert.deepEqual(await heldDays(), { caughtUp: 1, lost: 0, open: 0 }, "a later reading credited the day we could not read");

  // The same day settled the other way: a day held for a reason of ours and sent back all the same. The rule the
  // code follows (OURS_TO_FIX in src/daily-pass.ts) wants this number to stay zero.
  await db.query("DELETE FROM viky_days");
  await recordSettledDays("2", [{ day: HELD_DAY, outcome: "returned" }], TX);
  assert.deepEqual(await heldDays(), { caughtUp: 0, lost: 1, open: 0 });
});

test("a settling pass records no reading, because it takes none", async () => {
  const deps: DailyPassDeps = {
    ...threeGifts(),
    count: async () => {
      throw new Error("a settling pass never reads");
    },
  };
  await dailyPass(SETTLING_PASS, deps);

  const rows = await passRows();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].plan, "settling");
  assert.equal(rows[0].readings_attempted, 0);
  assert.equal(rows[0].readings_succeeded, 0);
  assert.equal(rows[0].held_ours, 0);
  assert.equal(rows[0].errors, 0);
});

test("a pass that falls over part way still writes what it did, and counts its own failure", async () => {
  const stopAt = (error: Error): DailyPassDeps => ({
    ...threeGifts(),
    count: async (giftId: string) => {
      if (giftId === "1") return { kind: "counted", giftId, xp: 320, creditedDays: 1, hash: "0xc" } as const;
      throw error;
    },
  });

  await assert.rejects(dailyPass(COUNTING_PASS, stopAt(new Error("the reader stopped answering"))), /the reader stopped answering/);
  await assert.rejects(dailyPass(COUNTING_PASS, stopAt(Object.assign(new Error("the relayer refused"), { code: "REVERTED" }))), /the relayer refused/);

  const rows = await passRows();
  assert.equal(rows.length, 2, "a run that threw is a run, and it is recorded");
  assert.equal(rows[0].readings_attempted, 2, "the reading it was taking when it stopped was attempted");
  assert.equal(rows[0].readings_succeeded, 1);
  assert.equal(rows[0].errors, 1);
  assert.deepEqual(rows[0].failures, { PASS_FAILED: 1 }, "a failure with no code of its own is named for what it is");
  assert.deepEqual(rows[1].failures, { REVERTED: 1 }, "a typed failure keeps its own code");
});

test("a journal that cannot be written does not break the pass", async () => {
  const told: string[] = [];
  const said = console.error;
  console.error = (...parts: unknown[]) => {
    told.push(parts.map(String).join(" "));
  };
  try {
    const report = await dailyPass(COUNTING_PASS, {
      ...threeGifts(),
      journal: async () => {
        throw new Error("the journal is unreachable");
      },
    });
    assert.ok(report.lines.length > 0, "the pass did its work");
  } finally {
    console.error = said;
  }
  assert.equal((await passRows()).length, 0);
  assert.match(told.join(" "), /pass not journalled: the journal is unreachable/);
});

test("passesSince says from when it speaks, and how many runs started on their own minute", async () => {
  const at = (day: number, hour: number, minute: number, second = 0) => new Date(Date.UTC(2026, 8, day, hour, minute, second));
  const ran = async (plan: "counting" | "settling", startedAt: Date) =>
    recordPass({ plan, startedAt, endedAt: new Date(startedAt.getTime() + 60_000), readingsAttempted: 1, readingsSucceeded: 1, holds: [], failures: {}, refusals: {} });

  const first = at(17, COUNTING_PASS_UTC.hour, COUNTING_PASS_UTC.minute, 4);
  await ran("counting", first);
  // Exactly the tolerance we chose, and a minute past it.
  await ran("counting", new Date(at(18, COUNTING_PASS_UTC.hour, COUNTING_PASS_UTC.minute).getTime() + ON_TIME_TOLERANCE_SECONDS * 1_000));
  await ran("counting", new Date(at(19, COUNTING_PASS_UTC.hour, COUNTING_PASS_UTC.minute).getTime() + (ON_TIME_TOLERANCE_SECONDS + 60) * 1_000));
  // The evening before, which is far from the counting minute even though it is close to midnight.
  await ran("counting", at(19, 23, 58));
  await ran("settling", at(18, SETTLING_PASS_UTC.hour, SETTLING_PASS_UTC.minute, 30));

  const since = await passesSince();
  assert.equal(since.firstPassAt?.toISOString(), first.toISOString());
  assert.deepEqual(since.plans, [
    { plan: "counting", runs: 4, onTime: 2 },
    { plan: "settling", runs: 1, onTime: 1 },
  ]);
});

test("an empty journal answers with nothing, not with a number it made up", async () => {
  assert.deepEqual(await passesSince(), { firstPassAt: null, plans: [] });
  assert.deepEqual(await readingTotals(), { attempted: 0, succeeded: 0 });
  assert.deepEqual(await heldDays(), { caughtUp: 0, lost: 0, open: 0 });
});
