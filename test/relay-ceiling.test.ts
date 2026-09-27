import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { GiftApiError } from "../src/gift-api";
import type { SqlExecutor } from "../src/proof-session-store";
import { admitRelay, admitTopUp, assertNotTooSmall } from "../src/relay-admission";
import { bucketOf, ceilingSentence, DEFAULT_RELAY_CEILINGS, minutesUntil, overTheCeiling, relayCeilings, relayScopes, tooSmallToRelay, topUpScopes, windowEndsMs } from "../src/relay-ceiling";
import { configureRelayCeilingStore, countKey, countRelays, ensureRelayCeilingSchema, forgetRelayCountsBefore, uncountRelays } from "../src/relay-ceiling-store";

/**
 * The ceilings on what the relayer pays for (D204): the numbers, the buckets, the counts in the database, the door
 * every relaying route goes through, and the sentence a refusal carries.
 */

let db: PGlite;

function pgliteExecutor(database: PGlite): SqlExecutor {
  return async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    return (await database.query<Record<string, unknown>>(text, values)).rows;
  };
}

const ACCOUNT = "0x00000000000000000000000000000000000A11cE";
const OTHER = "0x000000000000000000000000000000000000B0b0";
const NOW = Date.UTC(2026, 8, 23, 14, 20, 0);

const from = (ip: string) => new Request("https://viky.test/api/send", { method: "POST", headers: { "x-forwarded-for": ip } });

async function refused(action: () => Promise<void>): Promise<GiftApiError> {
  try {
    await action();
  } catch (error) {
    if (error instanceof GiftApiError) return error;
    throw error;
  }
  throw new Error("admitted");
}

before(async () => {
  db = new PGlite();
  configureRelayCeilingStore(pgliteExecutor(db));
  await ensureRelayCeilingSchema();
});

beforeEach(async () => {
  await db.query("DELETE FROM viky_relay_counts");
});

after(async () => {
  configureRelayCeilingStore(undefined);
  await db.close();
});

test("the founder's defaults, and the environment's numbers when it names them", () => {
  assert.deepEqual(relayCeilings({}), DEFAULT_RELAY_CEILINGS);
  assert.deepEqual(DEFAULT_RELAY_CEILINGS, { perHour: 20, perDay: 100, minimumUnits: 1_000_000n, topUpsPerMinute: 1, topUpsPerGift: 2 });
  assert.deepEqual(relayCeilings({ RELAY_PER_HOUR: "5", RELAY_PER_DAY: "40", RELAY_MINIMUM_CENTS: "250", TOP_UPS_PER_MINUTE: "2", TOP_UPS_PER_GIFT: "3" }), { perHour: 5, perDay: 40, minimumUnits: 2_500_000n, topUpsPerMinute: 2, topUpsPerGift: 3 });
  // Nonsense keeps the default rather than opening the door or closing it.
  assert.deepEqual(relayCeilings({ RELAY_PER_HOUR: "0", RELAY_PER_DAY: "many", RELAY_MINIMUM_CENTS: "-1" }), DEFAULT_RELAY_CEILINGS);
});

test("windows are UTC buckets every server agrees on, and the wait is said in whole minutes", () => {
  assert.equal(bucketOf("hour", NOW).toISOString(), "2026-09-23T14:00:00.000Z");
  assert.equal(bucketOf("day", NOW).toISOString(), "2026-09-23T00:00:00.000Z");
  assert.equal(bucketOf("minute", NOW + 30_000).toISOString(), "2026-09-23T14:20:00.000Z");
  assert.equal(windowEndsMs("hour", NOW), Date.UTC(2026, 8, 23, 15, 0, 0));
  assert.equal(minutesUntil("hour", NOW), 40);
  assert.equal(minutesUntil("hour", Date.UTC(2026, 8, 23, 14, 59, 30)), 1);
});

test("four counts for a relayed action, two for a top-up, and the first over its ceiling is the one refused", () => {
  const scopes = relayScopes(ACCOUNT, "203.0.113.9", DEFAULT_RELAY_CEILINGS);
  assert.deepEqual(
    scopes.map((one) => [one.scope, one.window, one.limit]),
    [
      [`relay:hour:account:${ACCOUNT.toLowerCase()}`, "hour", 20],
      [`relay:day:account:${ACCOUNT.toLowerCase()}`, "day", 100],
      ["relay:hour:ip:203.0.113.9", "hour", 20],
      ["relay:day:ip:203.0.113.9", "day", 100],
    ],
  );
  assert.equal(topUpScopes(ACCOUNT, "203.0.113.9", DEFAULT_RELAY_CEILINGS, "1").length, 3);
  assert.equal(overTheCeiling(scopes.map((one) => ({ ...one, count: one.limit }))), undefined, "at the ceiling is within it");
  const over = overTheCeiling(scopes.map((one, index) => ({ ...one, count: index === 3 ? 101 : 1 })));
  assert.equal(over?.scope, "relay:day:ip:203.0.113.9");
  assert.equal(ceilingSentence(over!, NOW), "That is as many actions as Viky sends for one connection in a day. Try again tomorrow.");
  assert.equal(ceilingSentence({ ...scopes[0], count: 21 }, NOW), "That is as many actions as Viky sends for one account in an hour. Try again in 40 minutes.");
});

test("below the smallest amount is refused, unless it is everything there is", () => {
  const least = DEFAULT_RELAY_CEILINGS.minimumUnits;
  assert.equal(tooSmallToRelay(least, 50_000_000n, least), false);
  assert.equal(tooSmallToRelay(least - 1n, 50_000_000n, least), true);
  assert.equal(tooSmallToRelay(400_000n, 400_000n, least), false, "the whole balance, however small, may go");
  assert.doesNotThrow(() => assertNotTooSmall("send", 1_000_000n, 5_000_000n, DEFAULT_RELAY_CEILINGS));
  assert.throws(() => assertNotTooSmall("send", 999_999n, 5_000_000n, DEFAULT_RELAY_CEILINGS), (error: unknown) => error instanceof GiftApiError && error.code === "TOO_SMALL_TO_RELAY" && error.status === 409 && error.message === "Viky sends $1.00 or more at a time. Below that, send everything you have at once.");
  assert.throws(() => assertNotTooSmall("takeOut", 10n, 5_000_000n, DEFAULT_RELAY_CEILINGS), (error: unknown) => error instanceof GiftApiError && error.message === "Viky takes out $1.00 or more at a time. Below that, take out everything that is yours at once.");
});

test("the store counts one statement at a time, takes a refusal back out, and forgets old buckets", async () => {
  const rows = [
    { scope: "relay:hour:account:a", bucket: bucketOf("hour", NOW) },
    { scope: "relay:day:account:a", bucket: bucketOf("day", NOW) },
  ];
  const first = await countRelays(rows);
  assert.equal(first.get(countKey(rows[0])), 1);
  assert.equal(first.get(countKey(rows[1])), 1);
  const second = await countRelays(rows);
  assert.equal(second.get(countKey(rows[0])), 2);
  await uncountRelays(rows);
  assert.equal((await countRelays(rows)).get(countKey(rows[1])), 2, "the refused one was not counted");
  await forgetRelayCountsBefore(new Date(NOW + 3 * 86_400_000));
  assert.equal((await countRelays(rows)).get(countKey(rows[0])), 1, "old buckets are gone");
});

test("the twenty-first action of an hour is refused by name and costs nothing; the day has its own ceiling", async () => {
  const request = from("203.0.113.9");
  for (let i = 0; i < 20; i += 1) await admitRelay(request, ACCOUNT, NOW + i * 1000);
  const error = await refused(() => admitRelay(request, ACCOUNT, NOW + 30_000));
  assert.equal(error.code, "RELAY_CEILING");
  assert.equal(error.status, 429);
  assert.match(error.message, /one account in an hour\. Try again in 40 minutes\.$/);
  // Refused, not counted: the next hour starts clean, and the day's count is what was admitted.
  const day = (await db.query<{ count: number }>("SELECT count FROM viky_relay_counts WHERE scope = $1", [`relay:day:account:${ACCOUNT.toLowerCase()}`])).rows[0];
  assert.equal(Number(day.count), 20);
  await admitRelay(request, ACCOUNT, NOW + 3_600_000);
  // The day: twenty, one, three hours of twenty and nineteen make a hundred; the hundred-and-first is refused for the day.
  for (let hour = 2; hour <= 4; hour += 1) for (let i = 0; i < 20; i += 1) await admitRelay(request, ACCOUNT, NOW + hour * 3_600_000 + i * 1000);
  for (let i = 0; i < 19; i += 1) await admitRelay(request, ACCOUNT, NOW + 5 * 3_600_000 + i * 1000);
  const dayFull = await refused(() => admitRelay(request, ACCOUNT, NOW + 6 * 3_600_000));
  assert.equal(dayFull.code, "RELAY_CEILING");
  assert.equal(dayFull.message, "That is as many actions as Viky sends for one account in a day. Try again tomorrow.");
});

test("a connection is counted on its own: a second account from the same connection shares its hour", async () => {
  const request = from("198.51.100.7");
  for (let i = 0; i < 20; i += 1) await admitRelay(request, ACCOUNT, NOW);
  const error = await refused(() => admitRelay(request, OTHER, NOW));
  assert.match(error.message, /one connection in an hour/);
  // The same other account from another connection is admitted.
  await admitRelay(from("198.51.100.8"), OTHER, NOW);
});

test("the ceilings are adjustable, and a top-up is one a minute", async () => {
  const request = from("192.0.2.1");
  const tight = { ...DEFAULT_RELAY_CEILINGS, perHour: 2 };
  await admitRelay(request, ACCOUNT, NOW, tight);
  await admitRelay(request, ACCOUNT, NOW, tight);
  assert.equal((await refused(() => admitRelay(request, ACCOUNT, NOW, tight))).code, "RELAY_CEILING");
  await admitTopUp(request, ACCOUNT, "1", NOW);
  const again = await refused(() => admitTopUp(request, ACCOUNT, "1", NOW + 20_000));
  assert.equal(again.code, "TOP_UP_TOO_SOON");
  assert.equal(again.message, "Viky readied this account for a cancel less than a minute ago. Try again in a moment.");
  await admitTopUp(request, ACCOUNT, "1", NOW + 61_000);
});

test("every route that asks the relayer to pay goes through the door first; the daily pass and the keeper do not", () => {
  const routes: Array<[string, RegExp]> = [
    ["app/api/send/route.ts", /writeContract\(/],
    ["app/api/gift/withdraw/route.ts", /relayWithdraw\(/],
    ["app/api/exit/relay/route.ts", /relayExit\(/],
    ["app/api/gift/[id]/cancel/route.ts", /sendTransaction\(/],
    ["app/api/gift/claim/route.ts", /relayClaim\(/],
    ["app/api/gift/check-in/route.ts", /relayCheckIn\(/],
    ["app/api/proof/verify/route.ts", /relayCheckIn\(/],
    ["app/api/gift/create/route.ts", /makeGift\(/],
    ["app/api/gift/milestone/create/route.ts", /makeMilestoneGift\(/],
    ["app/api/gift/certificate/create/route.ts", /makeMilestoneGift\(/],
  ];
  for (const [file, relays] of routes) {
    const source = readFileSync(file, "utf8");
    const door = source.indexOf("await admitRelay(request, auth.account)");
    const paid = source.search(relays);
    assert.ok(door > 0, `${file}: goes through the door`);
    assert.ok(paid > door, `${file}: the door comes before the relayer is asked`);
  }
  assert.match(readFileSync("app/api/gift/[id]/cancel/route.ts", "utf8"), /await admitTopUp\(request, auth\.account, id\);\n\s*sent = await clients\.walletClient\.sendTransaction/, "the top-up has its own door, right before the MON goes");
  assert.match(readFileSync("app/api/send/route.ts", "utf8"), /assertNotTooSmall\("send", value, held\)/);
  assert.match(readFileSync("app/api/gift/withdraw/route.ts", "utf8"), /assertNotTooSmall\("takeOut", amount, gift\.earnedBalance\)/);
  assert.match(readFileSync("src/milestone-routes.ts", "utf8"), /assertNotTooSmall\("takeOut", input\.amount, state\.earnedBalance\)/);
  for (const file of ["src/daily-pass.ts", "scripts/keeper.ts"]) assert.ok(!readFileSync(file, "utf8").includes("relay-admission"), `${file}: the operator's own relaying is not counted`);
});
