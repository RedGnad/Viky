// What is erased when a gift on a connected source is over (the founder, 2 Oct 2026): the access, the account's name
// and id, the rows of the morning readings. The store's SQL runs against a real Postgres (PGlite in-process).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after, before } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Connection } from "../src/connection-store";
import { COUNTING_PASS, dailyPass, SETTLING_PASS, type DailyPassDeps } from "../src/daily-pass";
import { eraseAtGiftEnd, erasedSomething, erasureLine, type EndErasureDeps } from "../src/gift-end-erasure";
import { GOAL_TYPE_DUOLINGO_XP, GOAL_TYPE_FITBIT_ACTIVITY, GOAL_TYPE_STRAVA_DISTANCE } from "../src/gift-terms";
import { configureProofSessionStore, consumeAndSaveVerification, deleteConnectedReadings, ensureProofSessionSchema, saveProofSession, type SqlExecutor } from "../src/proof-session-store";

const CONNECTION: Connection = { giftId: "7", source: "strava", externalId: "12345", accessToken: "v1.sealed.access", refreshToken: "v1.sealed.refresh", expiresAt: new Date("2026-10-01T00:00:00Z"), scope: "activity:read", connectedAt: new Date("2026-09-25T00:00:00Z"), refreshedAt: null };

function fake(over: Partial<{ goalType: number; goalUsername: string | null; goalProfileId: string | null; connection: Connection | null; revokeFails: boolean; readings: number }> = {}) {
  const state = { goalType: GOAL_TYPE_STRAVA_DISTANCE, goalUsername: "12345" as string | null, goalProfileId: "12345" as string | null, connection: CONNECTION as Connection | null, revokeFails: false, readings: 3, ...over };
  const calls: string[] = [];
  const deps: EndErasureDeps = {
    gift: async () => ({ goalType: state.goalType, goalUsername: state.goalUsername, goalProfileId: state.goalProfileId }),
    connection: async () => state.connection,
    revoke: async (connection) => {
      calls.push(`revoke:${connection.source}`);
      if (state.revokeFails) throw new Error("Strava did not revoke the key (503)");
    },
    eraseConnection: async () => {
      calls.push("erase the access");
      state.connection = null;
      return true;
    },
    forgetAccount: async () => {
      calls.push("forget the account");
      state.goalUsername = null;
      state.goalProfileId = null;
      return true;
    },
    deleteReadings: async () => {
      calls.push("delete the readings");
      const deleted = state.readings;
      state.readings = 0;
      return deleted;
    },
  };
  return { deps, calls, state };
}

test("at a gift's end the key is given back first, then the access, the account's name and id and the morning readings go", async () => {
  const { deps, calls } = fake();
  assert.deepEqual(await eraseAtGiftEnd("7", deps), { giftId: "7", access: "revoked", accountForgotten: true, readingsDeleted: 3 });
  assert.deepEqual(calls, ["revoke:strava", "erase the access", "forget the account", "delete the readings"]);
});

test("a source that does not confirm never keeps the access here: the row goes, and the report says the source did not answer", async () => {
  const { deps, calls, state } = fake({ revokeFails: true });
  const erasure = await eraseAtGiftEnd("7", deps);
  assert.equal(erasure?.access, "unconfirmed");
  assert.equal(state.connection, null);
  assert.ok(calls.includes("erase the access"));
  assert.equal(await erasureLine("7", fake({ revokeFails: true }).deps), "the access erased, its source did not confirm; the account's name and id cleared; 3 morning readings deleted");
});

test("asked again it erases nothing and says nothing: the pass can ask every morning", async () => {
  const { deps, calls } = fake();
  await eraseAtGiftEnd("7", deps);
  calls.length = 0;
  const again = await eraseAtGiftEnd("7", deps);
  assert.deepEqual(again, { giftId: "7", access: "none", accountForgotten: false, readingsDeleted: 0 });
  assert.equal(erasedSomething(again!), false);
  assert.deepEqual(calls, ["delete the readings"], "no key is asked back twice, and no row is rewritten");
  assert.equal(await erasureLine("7", deps), null);
});

test("a gift on a public page is left as it is: the name its funder gave is the gift's own term", async () => {
  const { deps, calls } = fake({ goalType: GOAL_TYPE_DUOLINGO_XP, goalUsername: "boo", connection: null });
  assert.equal(await eraseAtGiftEnd("7", deps), null);
  assert.deepEqual(calls, []);
  const unknown: EndErasureDeps = { ...deps, gift: async () => null };
  assert.equal(await eraseAtGiftEnd("999", unknown), null);
});

test("an erasing that fails is one line of the report and never an exception", async () => {
  const { deps } = fake();
  const broken: EndErasureDeps = { ...deps, connection: async () => Promise.reject(new Error("relation \"viky_connections\" does not exist\nat somewhere")) };
  assert.equal(await erasureLine("7", broken), 'failed: relation "viky_connections" does not exist');
});

// --- the rows of the morning readings, against Postgres -------------------------------------------------------------

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
  configureProofSessionStore(pgliteExecutor(db));
  await ensureProofSessionSchema();
});

after(async () => {
  configureProofSessionStore(undefined);
  await db.close();
});

const ACCOUNT = "0x000000000000000000000000000000000000a11c";

async function morning(giftId: string, sessionId: string): Promise<void> {
  await saveProofSession({ sessionId, conditionId: "strava-daily", account: ACCOUNT, giftId, goalType: GOAL_TYPE_STRAVA_DISTANCE, phase: "check-in", dayIndex: 1 });
  await consumeAndSaveVerification({
    sessionId,
    evidence: { source: "connected", service: "strava", day: "2026-10-01", met: true, observedAt: 1_790_000_000 },
    attestation: { message: { giftId }, signature: "0x00" },
    proofs: null,
  } as unknown as Parameters<typeof consumeAndSaveVerification>[0]);
}

test("only the gift's own morning readings are deleted: another gift's, and a proof the person showed, stay", async () => {
  await morning("7", "connected:7:check-in:20727:aaaaaaaaaaaaaaaa");
  await morning("7", "connected:7:check-in:20728:bbbbbbbbbbbbbbbb");
  await morning("70", "connected:70:check-in:20727:cccccccccccccccc");
  await saveProofSession({ sessionId: "shown-session-of-gift-7", conditionId: "duolingo-daily", account: ACCOUNT, giftId: "7", goalType: GOAL_TYPE_DUOLINGO_XP, phase: "check-in", dayIndex: 1 });
  const left = async () => (await db.query<{ session_id: string }>("SELECT session_id FROM viky_proof_sessions ORDER BY session_id")).rows.map((row) => row.session_id);
  assert.equal((await left()).length, 4);
  assert.equal(await deleteConnectedReadings("7"), 2);
  // Gift 70 is another gift, though its number begins the same; and a proof the person showed is not a morning reading.
  assert.deepEqual(await left(), ["connected:70:check-in:20727:cccccccccccccccc", "shown-session-of-gift-7"]);
  assert.equal(await deleteConnectedReadings("7"), 0);
  assert.equal(await deleteConnectedReadings("7' OR '1'='1"), 0, "a gift number is digits, or nothing is asked");
});

// --- where it is asked ----------------------------------------------------------------------------------------------

const ESCROW = "0x00000000000000000000000000000000000000e1" as const;
const CLOSED = { cancelled: false, finalised: true, startDay: 20_708, recipient: "0x000000000000000000000000000000000000b0b0" as `0x${string}` | null, fundedAt: 1_789_000_000, claimedAt: 1_789_000_060, refundable: 0n, refundedToFunder: 0n };

function pass(gifts: ReadonlyArray<{ giftId: string; escrow: `0x${string}`; goalType?: number }>, state: typeof CLOSED, erased: (giftId: string) => string | null = () => "the access given back and erased; the account's name and id cleared; 2 morning readings deleted") {
  const calls: string[] = [];
  const deps: DailyPassDeps = {
    boundGifts: async () => gifts.map(({ giftId }) => ({ giftId })),
    allGifts: async () => gifts,
    read: async () => state,
    count: async (giftId) => ({ kind: "already", giftId, reason: "counted_today" }),
    drain: async () => ({ hash: "0xd" }),
    finalise: async (giftId) => {
      calls.push(`finalise:${giftId}`);
      return { hash: "0xf" };
    },
    refund: async () => ({ hash: "0xr" }),
    start: async () => ({ address: "0xrelayer", balance: 12n }),
    eraseAtEnd: async (giftId) => {
      calls.push(`erase:${giftId}`);
      return erased(giftId);
    },
  };
  return { deps, calls };
}

test("the settling pass erases a connected gift that is over, every morning, and says so only when something was there", async () => {
  const gifts = [
    { giftId: "7", escrow: ESCROW, goalType: GOAL_TYPE_STRAVA_DISTANCE },
    { giftId: "8", escrow: ESCROW, goalType: GOAL_TYPE_FITBIT_ACTIVITY },
    { giftId: "9", escrow: ESCROW, goalType: GOAL_TYPE_DUOLINGO_XP },
  ];
  const { deps, calls } = pass(gifts, CLOSED, (giftId) => (giftId === "7" ? "the access given back and erased; the account's name and id cleared; 2 morning readings deleted" : null));
  const report = await dailyPass(SETTLING_PASS, deps);
  assert.deepEqual(calls, ["erase:7", "erase:8"], "a gift on a public page is never asked");
  assert.deepEqual(report.lines.filter((line) => line.step === "erase"), [{ giftId: "7", step: "erase", result: "the access given back and erased; the account's name and id cleared; 2 morning readings deleted" }]);
  // The counting pass moves no money and erases nothing.
  const counting = pass(gifts, CLOSED);
  await dailyPass(COUNTING_PASS, counting.deps);
  assert.deepEqual(counting.calls, []);
});

test("a gift the settling pass has just closed is erased by that pass, and a gift still running is never erased", async () => {
  const running = { ...CLOSED, finalised: false };
  const { deps, calls } = pass([{ giftId: "7", escrow: ESCROW, goalType: GOAL_TYPE_STRAVA_DISTANCE }], running);
  await dailyPass(SETTLING_PASS, deps);
  assert.deepEqual(calls, ["finalise:7", "erase:7"]);
  // The contract refuses to close a gift whose days are not over: nothing is erased.
  const early = pass([{ giftId: "7", escrow: ESCROW, goalType: GOAL_TYPE_STRAVA_DISTANCE }], running);
  early.deps.finalise = async () => Promise.reject(Object.assign(new Error("reverted"), { code: "OTHER" }));
  const report = await dailyPass(SETTLING_PASS, early.deps);
  assert.deepEqual(early.calls, []);
  assert.equal(report.lines.some((line) => line.step === "erase"), false);
});

test("the person's own ending erases at once, the key given back is the refresh key, and a refused key takes the ids with it", () => {
  const end = readFileSync("app/api/gift/[id]/end/route.ts", "utf8");
  assert.match(end, /const result = await countedIfSent\([\s\S]*?const erased = await erasureLine\(id\);[\s\S]*?return NextResponse\.json\(\{ giftId: id, ended: true/, "after the ending is sent, before the answer, and never able to fail it");
  const erasure = readFileSync("src/gift-end-erasure.ts", "utf8");
  assert.match(erasure, /const key = openSecret\(connection\.refreshToken\);/);
  for (const file of ["src/connect-strava.ts", "src/connect-fitbit.ts"]) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /openSecret\(connection\.refreshToken\)/, `${file}: the person's own disconnect gives the refresh key back too`);
    assert.doesNotMatch(source, /Token\(openSecret\(connection\.accessToken\)\)/, file);
  }
  assert.match(readFileSync("src/connected-checkin.ts", "utf8"), /await eraseConnection\(giftId\);[\s\S]{0,260}await forgetConnectedAccount\(giftId\);\s*return refusal\(giftId, "KEY_REFUSED"/);
  // The privacy page says what goes and what stays, in the words of this module.
  const privacy = readFileSync("app/privacy/page.tsx", "utf8").replace(/\s+/g, " ");
  assert.ok(privacy.includes("the access you gave is returned to Fitbit or Strava and erased, with the name of that account, its id at the source, and the rows of the morning readings"));
  assert.ok(privacy.includes("What stays is the record of each day, earned or gone back, your signed yes and stop, and what is on the public ledger."));
});
