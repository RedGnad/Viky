import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { GiftApiError } from "../src/gift-api";
import type { SqlExecutor } from "../src/proof-session-store";
import { admitRelay, admitTopUp, admitWayOut, assertNotTooSmall, countedIfSent, nothingWasSent } from "../src/relay-admission";
import { RelayerError } from "../src/relayer";
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

async function refused(action: () => Promise<unknown>): Promise<GiftApiError> {
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
  assert.deepEqual(DEFAULT_RELAY_CEILINGS, { perHour: 20, perDay: 100, minimumUnits: 1_000_000n, topUpsPerMinute: 1, topUpsPerGift: 2, perDayAll: 500, reservedForWaysOut: 100 });
  assert.deepEqual(relayCeilings({ RELAY_PER_HOUR: "5", RELAY_PER_DAY: "40", RELAY_MINIMUM_CENTS: "250", TOP_UPS_PER_MINUTE: "2", TOP_UPS_PER_GIFT: "3", RELAY_PER_DAY_ALL: "300", RELAY_RESERVED_FOR_WAYS_OUT: "60" }), { perHour: 5, perDay: 40, minimumUnits: 2_500_000n, topUpsPerMinute: 2, topUpsPerGift: 3, perDayAll: 300, reservedForWaysOut: 60 });
  // The part kept for the ways out is never more than half of everybody's count, whatever is asked.
  assert.equal(relayCeilings({ RELAY_PER_DAY_ALL: "40" }).reservedForWaysOut, 20);
  assert.equal(relayCeilings({ RELAY_RESERVED_FOR_WAYS_OUT: "9000" }).reservedForWaysOut, 250);
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

test("five counts for a relayed action, three for a top-up, and the first over its ceiling is the one refused", () => {
  const scopes = relayScopes(ACCOUNT, "203.0.113.9", DEFAULT_RELAY_CEILINGS);
  assert.deepEqual(
    scopes.map((one) => [one.scope, one.window, one.limit]),
    [
      [`relay:hour:account:${ACCOUNT.toLowerCase()}`, "hour", 20],
      [`relay:day:account:${ACCOUNT.toLowerCase()}`, "day", 100],
      ["relay:hour:ip:203.0.113.9", "hour", 20],
      ["relay:day:ip:203.0.113.9", "day", 100],
      // One count for everybody together (the audit of 1 Oct 2026): many accounts on many connections had none. A
      // hundred of its five hundred are kept for the ways out of a gift (the review of 2 Oct 2026, R-16).
      ["relay:day:all", "day", 400],
    ],
  );
  assert.deepEqual(relayScopes(ACCOUNT, "203.0.113.9", DEFAULT_RELAY_CEILINGS, true).map((one) => one.limit), [20, 100, 20, 100, 500], "a way out is held against the whole of it");
  assert.equal(relayCeilings({ RELAY_PER_DAY_ALL: "40" }).perDayAll, 40);
  const everybody = overTheCeiling(scopes.map((one, index) => ({ ...one, count: index === 4 ? 501 : 1 })));
  assert.equal(everybody?.scope, "relay:day:all");
  assert.equal(ceilingSentence(everybody!, NOW), "Viky has sent as many actions as it sends in a day, for everybody. Nothing of yours was changed. Try again tomorrow.");
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
    ["app/api/fund/convert/relay/route.ts", /relayExit\(/],
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
    // A way out, of a gift or to a bank, goes through the door that keeps its part of everybody's count (`admitWayOut`).
    const door = Math.max(source.indexOf("await admitRelay(request, auth.account)"), source.indexOf("admitWayOut(request, auth.account)"));
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

test("the part kept for the ways out is drawn on by the ways out of a gift and the way out to a bank, and by nothing else", () => {
  const door = (file: string) => {
    const source = readFileSync(file, "utf8");
    return { kept: source.includes("admitWayOut(request, auth.account)"), other: /admitRelay\(request, (auth\.)?account\)/.test(source) };
  };
  // Opening, ending, taking out, the funder taking back, and the way out of the account to a bank (the founder, 2 Oct 2026).
  for (const file of ["app/api/gift/claim/route.ts", "app/api/gift/[id]/end/route.ts", "app/api/gift/withdraw/route.ts", "app/api/gift/[id]/cancel/route.ts", "app/api/exit/relay/route.ts"]) {
    assert.deepEqual(door(file), { kept: true, other: false }, `${file}: a way out`);
  }
  // Making a gift, counting a day, writing an agreement down, the way in from another coin, a send, a phone top-up.
  for (const file of ["app/api/gift/create/route.ts", "app/api/gift/milestone/create/route.ts", "app/api/gift/certificate/create/route.ts", "app/api/gift/check-in/route.ts", "app/api/proof/verify/route.ts", "app/api/gift/[id]/consent/route.ts", "app/api/fund/convert/relay/route.ts", "app/api/send/route.ts", "app/api/phone/pay/route.ts"]) {
    assert.deepEqual(door(file), { kept: false, other: true }, `${file}: not a way out`);
  }
});

/**
 * The review of 2 Oct 2026, R-16. Everybody's count for the day was used up for nothing: a request was counted before
 * it was checked, so twenty-five free accounts asking twenty times each for a gift that does not exist reached five
 * hundred, spent no gas, and nobody could open a gift, end one or be paid until midnight UTC.
 */
test("the ways out keep a part of everybody's count: a day used up by everything else still opens, ends, pays out and reaches a bank", async () => {
  // Four hundred actions of every other kind, by twenty accounts on twenty connections: everybody's count is at what
  // is not kept, and nobody is near their own ceiling.
  for (let who = 0; who < 20; who += 1) {
    const account = `0x${(who + 1).toString(16).padStart(40, "0")}`;
    for (let i = 0; i < 20; i += 1) await admitRelay(from(`10.0.0.${who + 1}`), account, NOW + i);
  }
  const all = async () => Number((await db.query<{ count: number }>("SELECT count FROM viky_relay_counts WHERE scope = 'relay:day:all'")).rows[0].count);
  assert.equal(await all(), 400);
  // One more gift to make, one more day to count: refused for everybody, and not counted.
  const full = await refused(() => admitRelay(from("10.0.9.9"), OTHER, NOW + 50));
  assert.equal(full.code, "RELAY_CEILING");
  assert.equal(full.message, "Viky has sent as many actions as it sends in a day, for everybody. Nothing of yours was changed. Try again tomorrow.");
  assert.equal(await all(), 400);
  // The person holding a link still opens their gift, ends it, takes out what is theirs, and sends it to their bank: a
  // hundred times that day.
  for (let i = 0; i < 100; i += 1) await admitWayOut(from(`10.1.${Math.floor(i / 20)}.${i % 20}`), `0x${(i + 100).toString(16).padStart(40, "0")}`, NOW + 100 + i);
  assert.equal(await all(), 500);
  assert.equal((await refused(() => admitWayOut(from("10.2.0.1"), OTHER, NOW + 300))).code, "RELAY_CEILING", "and the whole count is still a ceiling");
});

test("only what the relayer pays for stays counted: a call the contract refuses when run for nothing is taken back", async () => {
  const request = from("203.0.113.40");
  const count = async (scope: string) => Number((await db.query<{ count: number }>("SELECT count FROM viky_relay_counts WHERE scope = $1", [scope])).rows[0]?.count ?? 0);
  const mine = `relay:day:account:${ACCOUNT.toLowerCase()}`;
  // Sent: counted.
  assert.equal(await countedIfSent(await admitRelay(request, ACCOUNT, NOW), async () => "sent"), "sent");
  assert.deepEqual([await count(mine), await count("relay:day:all")], [1, 1]);
  // Refused by the contract in simulation, before anything was sent: the failure goes on as it was, the count comes back.
  const unsent = new RelayerError("REVERTED", "The contract refused: InvalidIntentNonce", "InvalidIntentNonce", undefined, true);
  await assert.rejects(countedIfSent(await admitRelay(request, ACCOUNT, NOW), async () => Promise.reject(unsent)), (error: unknown) => error === unsent);
  assert.deepEqual([await count(mine), await count("relay:day:all"), await count("relay:hour:ip:203.0.113.40")], [1, 1, 1]);
  // The relayer could not send at all: the same.
  for (const code of ["RESERVE_TOO_LOW", "WRONG_CHAIN", "NOT_CONFIGURED"] as const) {
    await assert.rejects(countedIfSent(await admitRelay(request, ACCOUNT, NOW), async () => Promise.reject(new RelayerError(code, "no"))));
    assert.equal(await count("relay:day:all"), 1, code);
  }
  // Sent and then reverted, or not known final: the relayer paid, and it stays counted.
  await assert.rejects(countedIfSent(await admitRelay(request, ACCOUNT, NOW), async () => Promise.reject(new RelayerError("REVERTED", "reverted once mined"))));
  await assert.rejects(countedIfSent(await admitRelay(request, ACCOUNT, NOW), async () => Promise.reject(new Error("not final within the wait"))));
  assert.deepEqual([await count(mine), await count("relay:day:all")], [3, 3]);
  assert.equal(nothingWasSent(unsent), true);
  assert.equal(nothingWasSent(new RelayerError("REVERTED", "reverted once mined")), false);
  assert.equal(nothingWasSent(new GiftApiError("NOT_ENOUGH", "no", 409)), false);
  // A count is taken back once, however often it is asked.
  const admitted = await admitWayOut(request, ACCOUNT, NOW);
  await admitted.takeBack();
  await admitted.takeBack();
  assert.equal(await count("relay:day:all"), 3);
  // The relayer itself says which refusals cost nothing: the one it meets when it runs the call for nothing first.
  assert.match(readFileSync("src/relayer.ts", "utf8"), /"The contract refused the transaction", name, raw, true\);/);
});

test("a request is counted last: after the gift is known, the account is its own, and the signature is theirs over what is sent", () => {
  // The reviewer's flood: withdrawals for a gift that does not exist. Nothing of it reaches the door any more.
  const withdraw = readFileSync("app/api/gift/withdraw/route.ts", "utf8");
  const order = (source: string, steps: string[]) => steps.map((step) => source.indexOf(step));
  const inOrder = (positions: number[]) => positions.every((at, index) => at >= 0 && (index === 0 || at > positions[index - 1]));
  assert.ok(inOrder(order(withdraw, ['throw new GiftApiError("UNKNOWN_GIFT", "Unknown gift", 404);\n    const escrow', 'throw new GiftApiError("NOT_YOURS"', 'throw new GiftApiError("NOT_ENOUGH_EARNED"', "await assertWithdrawStands(", "await countedIfSent(await admit(), () => relayWithdraw("])), "the daily withdrawal");
  const milestone = readFileSync("src/milestone-routes.ts", "utf8");
  assert.ok(inOrder(order(milestone, ['if (!record) throw new GiftApiError("UNKNOWN_GIFT", "Unknown gift", 404);\n  if (!isAddress(input.to))', "Only the person the gift is for can take it", "await assertWithdrawStands(", "await countedIfSent(await admit(), () => relayMilestoneWithdraw("])), "the milestone withdrawal");
  const end = readFileSync("app/api/gift/[id]/end/route.ts", "utf8");
  assert.ok(inOrder(order(end, ['throw new GiftApiError("NOT_YOURS"', 'throw new GiftApiError("END_CHANGED"', "await assertEndStands(", "await countedIfSent(await admitWayOut(request, auth.account), () =>"])), "the ending");
  const opening = readFileSync("src/v2-opening.ts", "utf8");
  assert.ok(inOrder(order(opening, ["signer.toLowerCase() !== state.openingKey.toLowerCase()", "return admit ? countedIfSent(await admit(), relayIt) : relayIt();"])), "the opening");
  const send = readFileSync("app/api/send/route.ts", "utf8");
  assert.ok(inOrder(order(send, ["simulateContract(", "await admitRelay(request, auth.account);", "writeContract("])), "a send is counted once the token itself would take it");
  // Every other relaying route takes its count back when nothing was sent.
  for (const [file, relays] of [
    ["app/api/gift/create/route.ts", "countedIfSent(admitted, () => makeGift("],
    ["app/api/gift/milestone/create/route.ts", "countedIfSent(admitted, () => makeMilestoneGift("],
    ["app/api/gift/certificate/create/route.ts", "countedIfSent(admitted, () => makeMilestoneGift("],
    ["app/api/exit/relay/route.ts", "countedIfSent(admitted, () => relayExit("],
    ["app/api/fund/convert/relay/route.ts", "countedIfSent(admitted, () => relayExit("],
    ["app/api/phone/pay/route.ts", "countedIfSent(admitted, () => payPhoneTopUp("],
    ["app/api/gift/check-in/route.ts", "countedIfSent(admitted, () => relayCheckIn("],
    ["app/api/proof/verify/route.ts", "countedIfSent(admitted, () => relayCheckIn("],
    ["app/api/gift/claim/route.ts", "countedIfSent(admitted, () => relayClaim("],
  ] as const) {
    assert.ok(readFileSync(file, "utf8").includes(relays), file);
  }
});
