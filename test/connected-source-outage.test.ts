import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fitbitGiftOf } from "../src/connect-fitbit";
import { stravaGiftOf } from "../src/connect-strava";
import { COUNTING_PASS, dailyPass, type DailyPassDeps } from "../src/daily-pass";
import { GiftApiError } from "../src/gift-api";
import type { NewPass } from "../src/pass-log";

/**
 * A connected source that does not answer is not a person who took their connection back (the audit of 1 Oct 2026,
 * F-23). Until then any answer but 200 to the token refresh, a limit met or an hour's outage, erased the connection as
 * if the person had revoked it. The refresh itself is held by test/strava.test.ts and test/fitbit.test.ts; here, what
 * the reading and the pass do with it.
 */

const ESCROW = "0x00000000000000000000000000000000000000e1" as const;
const ACCOUNT = "0x000000000000000000000000000000000000b0b0";

test("a source that did not answer the refresh keeps the connection, and its code is one the pass holds the gift for", async () => {
  const reading = readFileSync("src/connected-checkin.ts", "utf8");
  // The connection is erased in one place only, and only when the source says the key itself is refused.
  assert.equal(reading.match(/eraseConnection\(giftId\)/g)?.length, 1);
  assert.match(reading, /if \(line\.keyRefused\(error\)\) \{[^}]*await eraseConnection\(giftId\);/);
  assert.match(reading, /keyRefused: \(error\) => error instanceof StravaError && error\.code === "REFRESH_REFUSED"/);
  assert.match(reading, /keyRefused: \(error\) => error instanceof FitbitError && error\.code === "REFRESH_REFUSED"/);
  assert.match(reading, /error\.code === "REFRESH_UNAVAILABLE"\) return refusal\(giftId, "REFRESH_UNAVAILABLE", `\$\{line\.name\} could not be reached just now\.`\)/);

  // And the pass treats that refusal as ours: the gift is held, not settled against a reading nobody could take.
  const calls: string[] = [];
  const rows: NewPass[] = [];
  const deps: DailyPassDeps = {
    boundGifts: async () => [{ giftId: "1" }],
    allGifts: async () => [{ giftId: "1", escrow: ESCROW }],
    read: async () => ({ cancelled: false, finalised: false, startDay: 20_708, recipient: ACCOUNT as `0x${string}`, fundedAt: 1, claimedAt: 2 }),
    count: async (giftId) => ({ kind: "refused", giftId, code: "REFRESH_UNAVAILABLE", message: "Strava could not be reached just now." }),
    drain: async (giftId) => (calls.push(`drain:${giftId}`), { hash: "0xd" }),
    finalise: async (giftId) => (calls.push(`finalise:${giftId}`), { hash: "0xf" }),
    refund: async (giftId) => (calls.push(`refund:${giftId}`), { hash: "0xr" }),
    start: async () => ({ address: "0xrelayer", balance: 12n }),
    journal: async (pass) => void rows.push(pass),
  };
  await dailyPass(COUNTING_PASS, deps);
  assert.deepEqual(calls, []);
  assert.deepEqual(rows[0].failures, { REFRESH_UNAVAILABLE: 1 });
  assert.equal(rows[0].holds.length, 1);
});

test("a milestone gift is never connected to Strava or Fitbit, whatever its goal's number", async () => {
  // Milestone gifts count their goals apart: a goal number there is another condition. The refusal comes before the
  // gift is even looked up, so no store is asked (none is configured here: a lookup would throw something else).
  for (const giftOf of [stravaGiftOf, fitbitGiftOf]) {
    await assert.rejects(giftOf("1000000", ACCOUNT), (error: unknown) => error instanceof GiftApiError && error.code === "NOT_THIS_CONDITION" && error.status === 400);
    await assert.rejects(giftOf("not a number", ACCOUNT), (error: unknown) => error instanceof GiftApiError && error.code === "UNKNOWN_GIFT");
  }
});
