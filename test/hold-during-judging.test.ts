import { PGlite } from "@electric-sql/pglite";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, test } from "node:test";
import { parseEther, type Hex } from "viem";
import { accountsAreMadeAt, accountsAreMadeOn } from "../src/account/passkey-support";
import { COUNTING_PASS, dailyPass, type DailyPassDeps } from "../src/daily-pass";
import { configurePassGuard, claimPass, lastGuardedPass } from "../src/frequent-pass";
import { GiftApiError } from "../src/gift-api";
import { PASS_LATE_AFTER_SECONDS, readHealth, RELAYER_ALERT_BELOW, type HealthDeps } from "../src/health";
import { configureJudgeCreditStore, ensureJudgeCreditSchema, giveJudgeCredit, judgeAlert, judgeCreditsStanding, standingInWords, JUDGE_CREDIT_ENDS, type JudgeNews } from "../src/judge-credit";
import { tellAboutDays, type TellingDeps } from "../src/morning-send";
import { configurePassLog, ensurePassSchema, lastPasses, recordPass } from "../src/pass-log";
import { gatheringNotes, passNote } from "../src/pass-notes";
import { cronOf, WATCH_UTC } from "../src/pass-schedule";
import type { SqlExecutor } from "../src/proof-session-store";
import { sendAlert } from "../src/provider-alert";
import { endpointOf } from "../src/push-endpoint";
import { READING_FINGERPRINT } from "../src/reading-fingerprint";
import { admitJudgeTry, JUDGE_TRIES_PER_CONNECTION } from "../src/relay-admission";
import { configureRelayCeilingStore, ensureRelayCeilingSchema } from "../src/relay-ceiling-store";
import { absentPassAlert, evidenceKeyAlert, pinAlert, relayerAlert, testAlert, watchAfterMorning, watchAtPassStart, type Alert, type WatchDeps } from "../src/watch";

/**
 * Holding during the judging (the audit of 1 Oct 2026, PR 6): the health answer, the alerts, the judge credit's ceiling
 * under two requests at once, and the doors that were open (any host as a push address, any site framing Viky).
 */

let db: PGlite;
function pgliteExecutor(database: PGlite): SqlExecutor {
  return async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    return (await database.query<Record<string, unknown>>(text, values)).rows;
  };
}

before(async () => {
  db = new PGlite();
  const executor = pgliteExecutor(db);
  configureJudgeCreditStore(executor);
  configureRelayCeilingStore(executor);
  configurePassLog(executor);
  configurePassGuard(executor);
  await ensureJudgeCreditSchema();
  await ensureRelayCeilingSchema();
  await ensurePassSchema();
});
beforeEach(async () => {
  await db.query("DELETE FROM viky_judge_credits");
  await db.query("UPDATE viky_judge_credit_total SET units = 0");
  await db.query("DELETE FROM viky_relay_counts");
  await db.query("DELETE FROM viky_passes");
});
after(async () => {
  configureJudgeCreditStore(undefined);
  configureRelayCeilingStore(undefined);
  configurePassLog(undefined);
  configurePassGuard(undefined);
  await db.close();
});

const NOW = Date.parse("2026-10-02T02:10:00Z");
const A = "0x00000000000000000000000000000000000000A1" as Hex;
const B = "0x00000000000000000000000000000000000000B2" as Hex;
const KEY = "0x85702Eaaa6B8694A61a6FbBff2634FCd7E644d9a" as Hex;
const PINNED = "0x2f84FB8982073f39Ba47c7fcC29119aF074AbbcB" as Hex;

// --- the health answer ---------------------------------------------------------------------------------------------

function standingDeps(over: Partial<HealthDeps> = {}): HealthDeps {
  return {
    database: async () => {},
    block: async () => 51_000_000n,
    workerFingerprint: async () => READING_FINGERPRINT,
    relayerBalance: async () => parseEther("52.8"),
    exitPin: async () => ({ pinned: PINNED, pointsAt: PINNED.toLowerCase() as Hex }),
    evidenceKeys: async () => ({ ours: KEY, named: [{ contract: A, signer: KEY }, { contract: B, signer: KEY.toLowerCase() as Hex }] }),
    lastPasses: async () => ({ counting: new Date(NOW - 3_600_000), settling: new Date(NOW - 19 * 3_600_000), milestones: new Date(NOW - 120_000) }),
    now: () => NOW,
    log: () => {},
    ...over,
  };
}

test("everything standing answers ok, with a balance, a block and the times of the last passes, and nothing else", async () => {
  const health = await readHealth(standingDeps());
  assert.equal(health.ok, true);
  assert.equal(health.relayer.mon, "52.80");
  assert.equal(health.relayer.underAlert, false);
  assert.equal(health.rpc.block, "51000000");
  assert.equal(health.passes.counting.last, new Date(NOW - 3_600_000).toISOString());
  // No account, no contract, no key and no gift: nothing in the answer is forty hex figures long.
  assert.doesNotMatch(JSON.stringify(health), /0x[0-9a-fA-F]{40}/);
});

test("each thing that does not hold makes the whole answer fail, and says which in a fixed word", async () => {
  const failing = async () => {
    throw new Error("postgres://user:secret@host refused the connection");
  };
  const cases: Array<[string, Partial<HealthDeps>, (health: Awaited<ReturnType<typeof readHealth>>) => unknown, string]> = [
    ["database", { database: failing }, (h) => h.database.fault, "unreachable"],
    ["rpc", { block: failing }, (h) => h.rpc.fault, "unreachable"],
    ["a worker that does not answer", { workerFingerprint: failing }, (h) => h.worker.fault, "unreachable"],
    ["a worker running other sources", { workerFingerprint: async () => "0xother" }, (h) => h.worker.fault, "differs"],
    ["a relayer under its own floor", { relayerBalance: async () => parseEther("11.9") }, (h) => h.relayer.fault, "low"],
    ["an exchange that moved", { exitPin: async () => ({ pinned: PINNED, pointsAt: A }) }, (h) => h.exitPin.fault, "differs"],
    ["another evidence key", { evidenceKeys: async () => ({ ours: KEY, named: [{ contract: A, signer: B }] }) }, (h) => h.evidenceKey.fault, "differs"],
    ["a counting pass two days old", { lastPasses: async () => ({ counting: new Date(NOW - 48 * 3_600_000), settling: new Date(NOW), milestones: new Date(NOW) }) }, (h) => h.passes.counting.fault, "late"],
    ["a settling pass that never ran", { lastPasses: async () => ({ counting: new Date(NOW), settling: null, milestones: new Date(NOW) }) }, (h) => h.passes.settling.fault, "never ran"],
    ["a milestones pass half an hour old", { lastPasses: async () => ({ counting: new Date(NOW), settling: new Date(NOW), milestones: new Date(NOW - 30 * 60_000) }) }, (h) => h.passes.milestones.fault, "late"],
    ["a journal that cannot be read", { lastPasses: failing }, (h) => h.passes.counting.fault, "unreachable"],
  ];
  for (const [name, over, fault, expected] of cases) {
    const logged: string[] = [];
    const health = await readHealth(standingDeps({ ...over, log: (line) => logged.push(line) }));
    assert.equal(health.ok, false, name);
    assert.equal(fault(health), expected, name);
    // The reason is for the logs: an error's own words can name a host or a password, and are never answered.
    assert.doesNotMatch(JSON.stringify(health), /secret|postgres/, name);
  }
});

test("a relayer under the alert line still works: it is said, and it is not a failure", async () => {
  const health = await readHealth(standingDeps({ relayerBalance: async () => parseEther("20") }));
  assert.equal(health.ok, true);
  assert.equal(health.relayer.underAlert, true);
});

test("a pass is late after the longest gap its schedule allows", () => {
  // The nightly passes run inside the hour their schedule names, once a day: two runs are at most 25 hours apart.
  assert.equal(PASS_LATE_AFTER_SECONDS.counting, 26 * 3_600);
  assert.equal(PASS_LATE_AFTER_SECONDS.settling, 26 * 3_600);
  assert.equal(PASS_LATE_AFTER_SECONDS.milestones, 20 * 60);
});

test("the route answers 503 when a check fails, needs no secret, and keeps one answer for half a minute", () => {
  const route = readFileSync("app/api/health/route.ts", "utf8");
  assert.match(route, /status: kept\.health\.ok \? 200 : 503/);
  assert.match(route, /KEPT_MS = 30_000/);
  assert.doesNotMatch(route, /CRON_SECRET|authorization/);
});

test("the last passes are read from the journal and from the guard of the frequent pass", async () => {
  assert.deepEqual(await lastPasses(), { counting: null, settling: null, recount: null });
  const row = { readingsAttempted: 0, readingsSucceeded: 0, holds: [], failures: {}, refusals: {} };
  await recordPass({ plan: "counting", startedAt: new Date("2026-10-01T00:40:00Z"), endedAt: new Date("2026-10-01T00:41:00Z"), ...row });
  await recordPass({ plan: "counting", startedAt: new Date("2026-10-02T00:35:00Z"), endedAt: new Date("2026-10-02T00:36:00Z"), ...row });
  await recordPass({ plan: "settling", startedAt: new Date("2026-10-01T07:44:00Z"), endedAt: new Date("2026-10-01T07:45:00Z"), ...row });
  const last = await lastPasses();
  assert.equal(last.counting?.toISOString(), "2026-10-02T00:35:00.000Z");
  assert.equal(last.settling?.toISOString(), "2026-10-01T07:44:00.000Z");
  assert.equal(await lastGuardedPass("milestones"), null);
  await claimPass("milestones", 240, NOW);
  assert.equal((await lastGuardedPass("milestones"))?.getTime(), NOW);
});

// --- the alerts ----------------------------------------------------------------------------------------------------

function watchDeps(sent: Alert[], over: Partial<WatchDeps> = {}): WatchDeps {
  return {
    exitPin: async () => ({ pinned: PINNED, pointsAt: PINNED }),
    evidenceKeys: async () => ({ ours: KEY, named: [{ contract: A, signer: KEY }] }),
    lastCountingPass: async () => new Date("2026-10-02T00:35:00Z"),
    alert: async (alert) => {
      sent.push(alert);
      return "sent";
    },
    now: () => NOW,
    log: () => {},
    ...over,
  };
}

test("the relayer is told of under 25 MON, with what it holds, and not above", () => {
  assert.equal(RELAYER_ALERT_BELOW, parseEther("25"));
  assert.equal(relayerAlert({ address: "0xrelayer", balance: parseEther("25") }, "counting"), null);
  const low = relayerAlert({ address: "0xrelayer", balance: parseEther("24.99") }, "counting");
  assert.equal(low?.subject, "Relayer under 25.00 MON: 24.99 MON left");
  assert.match(String(low?.text), /0xrelayer holds 24\.99 MON at the start of the counting pass/);
  const refused = relayerAlert({ refused: "The relayer holds 9 MON, below the 10 MON reserve plus margin" }, "settling");
  assert.equal(refused?.subject, "The settling pass did not start");
  assert.match(String(refused?.text), /pnpm keeper --settle/);
});

test("a pin that differs, another evidence key and an absent morning pass each make one alert", () => {
  assert.equal(pinAlert({ pinned: PINNED, pointsAt: PINNED.toLowerCase() as Hex }), null);
  assert.match(String(pinAlert({ pinned: PINNED, pointsAt: A })?.text), new RegExp(`pinned ${PINNED} for the exchange, and the exchange now answers ${A}`));
  assert.equal(evidenceKeyAlert({ ours: KEY, named: [{ contract: A, signer: KEY }] }), null);
  const key = evidenceKeyAlert({ ours: KEY, named: [{ contract: A, signer: KEY }, { contract: B, signer: A }] });
  assert.match(String(key?.text), new RegExp(`${B} names ${A}`));
  assert.doesNotMatch(String(key?.text), new RegExp(`${A} names ${KEY}`), "a contract that agrees is not listed");
  // At 02:10 UTC on 2 Oct: a pass begun at 00:35 that day is there, one begun the day before is not.
  assert.equal(absentPassAlert(new Date("2026-10-02T00:35:00Z"), NOW), null);
  assert.equal(absentPassAlert(new Date("2026-10-02T00:00:00Z"), NOW), null);
  assert.equal(absentPassAlert(new Date("2026-10-01T00:40:00Z"), NOW)?.subject, "The morning pass has not run today");
  assert.match(String(absentPassAlert(null, NOW)?.text), /scheduled at 00:30 UTC\. The journal holds none at all\./);
});

test("the watch after the morning sends what it sees, and what it cannot read never throws", async () => {
  const quiet: Alert[] = [];
  assert.deepEqual(await watchAfterMorning(watchDeps(quiet)), [
    { watched: "morning pass", result: "holds" },
    { watched: "exit pin", result: "holds" },
    { watched: "evidence key", result: "holds" },
  ]);
  assert.equal(quiet.length, 0);
  const sent: Alert[] = [];
  const lines = await watchAfterMorning(
    watchDeps(sent, {
      lastCountingPass: async () => new Date("2026-10-01T00:40:00Z"),
      exitPin: async () => {
        throw new Error("the network did not answer");
      },
      evidenceKeys: async () => ({ ours: KEY, named: [{ contract: A, signer: B }] }),
    }),
  );
  assert.deepEqual(lines.map((line) => line.result), ["alert sent", "not read", "alert sent"]);
  assert.deepEqual(sent.map((alert) => alert.subject), ["The morning pass has not run today", "The evidence key of this environment is not the one the contracts name"]);
});

test("the watch's cron is the one vercel.json sets, behind the cron secret", () => {
  const crons = (JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: Array<{ path: string; schedule: string }> }).crons;
  assert.equal(crons.find((cron) => cron.path === "/api/cron/watch")?.schedule, cronOf(WATCH_UTC));
  assert.equal(cronOf(WATCH_UTC), "0 2 * * *");
  assert.match(readFileSync("app/api/cron/watch/route.ts", "utf8"), /CRON_SECRET/);
});

test("a test alert asked by hand says only that alerts leave, and answers what became of it", async () => {
  const sent: Alert[] = [];
  assert.equal(await testAlert(watchDeps(sent)), "sent");
  assert.deepEqual(sent, [{ subject: "Test alert from Viky", text: "Asked for by hand at 2026-10-02T02:10:00.000Z. Nothing is wrong: this only shows that Viky's alerts reach you." }]);
  assert.equal(await testAlert({ alert: async () => "not configured" }), "not configured");
  // Behind the same secret as the watch itself: the check of the bearer comes before anything is sent.
  const route = readFileSync("app/api/cron/watch/route.ts", "utf8");
  assert.ok(route.indexOf("Not allowed") < route.indexOf("testAlert()"));
});

function passDeps(over: Partial<DailyPassDeps> = {}): DailyPassDeps {
  const sentHash = async () => ({ hash: "0x1" });
  return {
    boundGifts: async () => [],
    allGifts: async () => [],
    read: async () => {
      throw new Error("no gift to read");
    },
    count: async (giftId) => ({ kind: "already", giftId, reason: "counted_today" }),
    drain: sentHash,
    finalise: sentHash,
    refund: sentHash,
    start: async () => ({ address: "0xrelayer", balance: parseEther("20") }),
    ...over,
  };
}

test("a pass tells the operator of a low relayer at its start, and goes on whatever the watch meets", async () => {
  const sent: Alert[] = [];
  const report = await dailyPass(COUNTING_PASS, passDeps({ watch: (relayer, pass) => watchAtPassStart(relayer, pass, watchDeps(sent)) }));
  assert.deepEqual(sent.map((alert) => alert.subject), ["Relayer under 25.00 MON: 20.00 MON left"]);
  assert.deepEqual(report.watch.map((line) => line.result), ["alert sent", "holds", "holds"]);
  const broken = await dailyPass(
    COUNTING_PASS,
    passDeps({
      watch: async () => {
        throw new Error("the watch itself broke");
      },
    }),
  );
  assert.deepEqual(broken.watch, []);
  assert.deepEqual(broken.lines, []);
});

test("a pass the relayer refuses to start tells the operator before it fails", async () => {
  const sent: Alert[] = [];
  const refusing = passDeps({
    start: async () => {
      throw new Error("The relayer holds 9 MON, below the 10 MON reserve plus margin");
    },
    watch: (relayer, pass) => watchAtPassStart(relayer, pass, watchDeps(sent)),
  });
  await assert.rejects(dailyPass(COUNTING_PASS, refusing), /below the 10 MON reserve/);
  assert.equal(sent[0]?.subject, "The counting pass did not start");
});

// --- what did not leave is in the report ---------------------------------------------------------------------------

function tellingDeps(answer: () => { ok: true } | { ok: false; gone: boolean; status?: number }, logged: string[]): TellingDeps {
  return {
    subscriptions: async (giftId) => [{ endpoint: "https://fcm.googleapis.com/fcm/send/one", giftId, account: A, p256dh: "p", auth: "a" }] as never,
    claim: async () => true,
    forgetEndpoint: async () => {},
    facts: async () => ({ funder: A, names: { recipientName: "Boo", funderName: "Maman" }, perDayDisplay: "$3.57", amountDisplay: "$25.00", words: { yesterday: "yesterday's lesson" } }),
    send: async () => answer(),
    log: (line) => logged.push(line),
  };
}

test("a morning message a push service refuses is logged, whether or not the browser is gone", async () => {
  const day = [{ day: 20_727, outcome: "earned" as const }];
  const gone: string[] = [];
  assert.equal(await tellAboutDays("7", day as never, tellingDeps(() => ({ ok: false, gone: true, status: 410 }), gone)), 0);
  assert.deepEqual(gone, ["morning message refused for gift 7: the push service answered 410, that browser no longer listens and is forgotten"]);
  const busy: string[] = [];
  await tellAboutDays("7", day as never, tellingDeps(() => ({ ok: false, gone: false, status: 503 }), busy));
  assert.deepEqual(busy, ["morning message refused for gift 7: the push service answered 503"]);
  const silent: string[] = [];
  await tellAboutDays("7", day as never, tellingDeps(() => ({ ok: false, gone: false, status: 0 }), silent));
  assert.deepEqual(silent, ["morning message refused for gift 7: the push service did not answer"]);
});

test("the pass's report carries what did not leave while it ran, and only that", async () => {
  // A note written outside a pass goes nowhere: the report is the run's own.
  passNote("written before any pass");
  const report = await dailyPass(
    COUNTING_PASS,
    passDeps({
      milestones: async () => {
        await tellAboutDays("7", [{ day: 20_727, outcome: "earned" }] as never, tellingDeps(() => ({ ok: false, gone: false, status: 503 }), []));
        return [];
      },
    }),
  );
  assert.deepEqual(report.unsent, ["morning message refused for gift 7: the push service answered 503"]);
  assert.match(readFileSync("src/morning-send-live.ts", "utf8"), /gone: status === 404 \|\| status === 410, status \}/);
});

test("an alert Resend refuses is logged and noted in the pass under way, and never throws", async () => {
  const realFetch = globalThis.fetch;
  const realError = console.error;
  const logged: string[] = [];
  console.error = (line: unknown) => void logged.push(String(line));
  globalThis.fetch = (async () => new Response(JSON.stringify({ name: "validation_error", message: "The domain is not verified", statusCode: 403 }), { status: 403, headers: { "content-type": "application/json" } })) as typeof fetch;
  try {
    const { value, notes } = await gatheringNotes(() => sendAlert({ subject: "A test", text: "Nothing happened." }, { RESEND_API_KEY: "re_test_key" }));
    assert.equal(value, "failed");
    assert.equal(notes.length, 1);
    assert.match(notes[0], /^alert not sent \("A test"\): /);
    // Resend's own client logs a line of its own; ours is the one that says which alert it was.
    assert.deepEqual(logged.filter((line) => line.startsWith("alert not sent")), notes);
    assert.equal(await sendAlert({ subject: "A test", text: "Nothing happened." }, {}), "not configured");
  } finally {
    globalThis.fetch = realFetch;
    console.error = realError;
  }
});

// --- the judge credit ----------------------------------------------------------------------------------------------

const CODE = "judge-code-for-the-test";
const CREDIT_NOW = Date.parse("2026-10-01T12:00:00Z");
const plenty = async () => 10n ** 18n;

function creditDeps(config: { code: string; units: bigint; capUnits: bigint }, over: Record<string, unknown> = {}) {
  const sent: Hex[] = [];
  const told: JudgeNews[] = [];
  const deps = {
    config,
    nowMs: CREDIT_NOW,
    spendable: plenty,
    send: async (input: { to: Hex; ausdUnits: bigint; nonce: Hex }) => {
      // The transfer takes a moment, as it does on the network: the other request arrives while this one is out.
      await new Promise((resolve) => setTimeout(resolve, 5));
      sent.push(input.to);
      return { hash: `0x${"ab".repeat(32)}` as Hex };
    },
    tell: async (news: JudgeNews) => void told.push(news),
    ...over,
  };
  return { sent, told, deps };
}

const capRefusal = (error: unknown) => error instanceof GiftApiError && error.code === "JUDGE_CREDIT_CAP";

test("two requests at once under a ceiling of one credit: one is paid, the other is refused, never both", async () => {
  const { sent, told, deps } = creditDeps({ code: CODE, units: 25_000_000n, capUnits: 25_000_000n });
  const both = await Promise.allSettled([giveJudgeCredit({ account: A, code: CODE }, deps), giveJudgeCredit({ account: B, code: CODE }, deps)]);
  assert.deepEqual(both.map((one) => one.status).sort(), ["fulfilled", "rejected"]);
  assert.ok(capRefusal((both.find((one) => one.status === "rejected") as PromiseRejectedResult).reason));
  assert.equal(sent.length, 1);
  assert.equal((await db.query<{ units: string }>("SELECT units::text FROM viky_judge_credit_total")).rows[0].units, "25000000");
  // Each is said to the operator: the credit, and the judge who met the ceiling.
  assert.deepEqual(told.map((news) => news.kind).sort(), ["ceiling", "given"]);
});

test("two requests at once when the treasury holds one credit and the ceiling allows ten: one is paid", async () => {
  const { sent, deps } = creditDeps({ code: CODE, units: 25_000_000n, capUnits: 250_000_000n }, { spendable: async () => 30_000_000n });
  const both = await Promise.allSettled([giveJudgeCredit({ account: A, code: CODE }, deps), giveJudgeCredit({ account: B, code: CODE }, deps)]);
  assert.deepEqual(both.map((one) => one.status).sort(), ["fulfilled", "rejected"]);
  assert.equal(sent.length, 1);
});

test("the same account asking twice at once is paid once", async () => {
  const { sent, deps } = creditDeps({ code: CODE, units: 25_000_000n, capUnits: 250_000_000n });
  await Promise.allSettled([giveJudgeCredit({ account: A, code: CODE }, deps), giveJudgeCredit({ account: A, code: CODE }, deps)]);
  assert.equal(sent.length, 1);
  assert.equal((await db.query<{ units: string }>("SELECT units::text FROM viky_judge_credit_total")).rows[0].units, "25000000");
});

test("the standing is counted: credits given, and how many the ceiling still allows", async () => {
  const config = { code: CODE, units: 25_000_000n, capUnits: 60_000_000n };
  assert.deepEqual(await judgeCreditsStanding(config), { given: 0, left: 2 });
  const { told, deps } = creditDeps(config);
  await giveJudgeCredit({ account: A, code: CODE }, deps);
  assert.deepEqual(await judgeCreditsStanding(config), { given: 1, left: 1 });
  const given = told.find((news) => news.kind === "given");
  assert.deepEqual(given && given.kind === "given" ? given.standing : null, { given: 1, left: 1 });
  assert.equal(standingInWords({ given: 1, left: 1 }), "1 credit has been given so far, 1 is left under the ceiling.");
  assert.equal(standingInWords({ given: 3, left: 0 }), "3 credits have been given so far, 0 are left under the ceiling.");
  assert.equal(standingInWords(null), "How many credits are left could not be read right now.");
  assert.equal(await judgeCreditsStanding(null), null);
  const page = readFileSync("app/judges/page.tsx", "utf8");
  assert.match(page, /standingInWords\(judgeStanding\)/);
  assert.match(page, /judgeCreditsStanding\(judgeCredit\)\.catch\(\(\) => null\)/);
});

test("the two emails name the account and the amount, and never the code", () => {
  const given = judgeAlert({ kind: "given", account: A, units: 25_000_000n, hash: `0x${"ab".repeat(32)}`, standing: { given: 2, left: 3 } });
  assert.match(given.subject, /^Judge credit given: \$25\.00 to 0x0000…00A1$/);
  assert.match(given.text, /Given so far: 2\. Left under the ceiling: 3\./);
  const ceiling = judgeAlert({ kind: "ceiling", account: B });
  assert.equal(ceiling.subject, "Judge credits: the ceiling is reached");
  assert.doesNotMatch(given.text + ceiling.text, new RegExp(CODE));
});

test("a connection may try the judge code ten times a day, and the eleventh is refused", async () => {
  assert.equal(JUDGE_TRIES_PER_CONNECTION, 10);
  const from = (ip: string) => new Request("https://viky.test/api/judge/credit", { method: "POST", headers: { "x-forwarded-for": ip } });
  for (let tries = 0; tries < 10; tries += 1) await admitJudgeTry(from("203.0.113.9"), CREDIT_NOW);
  await assert.rejects(admitJudgeTry(from("203.0.113.9"), CREDIT_NOW), (error: unknown) => error instanceof GiftApiError && error.code === "JUDGE_TOO_MANY_TRIES" && error.status === 429);
  // Another connection, and the same one the next day, start from nothing.
  await admitJudgeTry(from("203.0.113.10"), CREDIT_NOW);
  await admitJudgeTry(from("203.0.113.9"), CREDIT_NOW + 86_400_000);
  assert.match(readFileSync("app/api/judge/credit/route.ts", "utf8"), /await admitJudgeTry\(request\)/);
});

test("the credit still ends on 28 Oct 2026 UTC: its date moves only on the founder's word", () => {
  assert.equal(JUDGE_CREDIT_ENDS, Date.UTC(2026, 9, 28));
});

// --- the doors that were open --------------------------------------------------------------------------------------

test("a push address is one of the four push services, over https, and nothing else", () => {
  for (const good of [
    "https://fcm.googleapis.com/fcm/send/abc",
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
    "https://web.push.apple.com/abc",
    "https://db5p.notify.windows.com/w/?token=abc",
  ]) {
    assert.equal(endpointOf(good), good);
  }
  for (const bad of [
    "http://fcm.googleapis.com/fcm/send/abc",
    "https://fcm.googleapis.com.evil.example/abc",
    "https://evil.example/fcm.googleapis.com",
    "https://push.apple.com.evil.example/abc",
    "https://a.b.push.apple.com/abc",
    "https://fcm.googleapis.com:8443/abc",
    "https://user:pass@fcm.googleapis.com/abc",
    "https://169.254.169.254/latest/meta-data",
    "https://localhost/abc",
    `https://fcm.googleapis.com/${"a".repeat(1_100)}`,
    42,
    null,
  ]) {
    assert.equal(endpointOf(bad), null, String(bad).slice(0, 60));
  }
  const route = readFileSync("app/api/gift/[id]/notify/route.ts", "utf8");
  assert.match(route, /assertSameOrigin\(request\)/);
  assert.match(route, /endpointOf\(/);
  assert.match(readFileSync("src/morning-send-live.ts", "utf8"), /\{ timeout: PUSH_TIMEOUT_MS \}/);
});

test("every page forbids framing, type guessing and the framework's name, and frames only the card service", async () => {
  // Named in a variable: the file is plain JavaScript and carries no types of its own.
  const file = "../next.config.mjs";
  const config = ((await import(file)) as { default: unknown }).default as { poweredByHeader?: boolean; headers: () => Promise<Array<{ source: string; headers: Array<{ key: string; value: string }> }>> };
  assert.equal(config.poweredByHeader, false);
  const all = (await config.headers()).find((entry) => entry.source === "/:path*");
  const header = (key: string) => all?.headers.find((entry) => entry.key === key)?.value;
  assert.equal(header("X-Content-Type-Options"), "nosniff");
  assert.equal(header("X-Frame-Options"), "DENY");
  assert.equal(header("Referrer-Policy"), "strict-origin");
  assert.equal(header("Content-Security-Policy"), "frame-ancestors 'none'; frame-src 'self' https://deposit.swapper.finance");
});

test("an account is made on viky.cash and on a development host, and nowhere else", () => {
  for (const host of ["viky.cash", "localhost", "127.0.0.1", "[::1]", "app.localhost", "viky.test"]) assert.equal(accountsAreMadeOn(host), true, host);
  for (const host of ["viky-two.vercel.app", "viky-git-main-redgnad.vercel.app", "www.viky.cash", "viky.cash.evil.example", "evilviky.cash"]) assert.equal(accountsAreMadeOn(host), false, host);
  assert.equal(accountsAreMadeAt("https://viky.cash"), true);
  assert.equal(accountsAreMadeAt("http://localhost:3000"), true);
  assert.equal(accountsAreMadeAt("https://viky-two.vercel.app"), false);
  assert.equal(accountsAreMadeAt(""), false);
  // Sign in stays everywhere; only making an account is sent to the main site.
  assert.match(readFileSync("src/account/mera.ts", "utf8"), /MADE_ELSEWHERE/);
  assert.match(readFileSync("app/kit/AccountDoor.tsx", "utf8"), /MadeOnTheMainSite/);
});

test("a page that does not exist, and a page that failed, say one sentence and lead home", () => {
  const missing = readFileSync("app/not-found.tsx", "utf8");
  assert.match(missing, /<Notice>\{W\.missing\}<\/Notice>/);
  assert.match(missing, /href="\/"/);
  const failed = readFileSync("app/error.tsx", "utf8");
  assert.match(failed, /^"use client";/);
  assert.match(failed, /\{W\.failed\}/);
  assert.match(failed, /href="\/"/);
});

test("the Safe's raw mode refuses renounceOwnership by its selector", () => {
  // The actions live in src/safe-actions.ts since the review of 2 Oct 2026, where each is pinned by a test; the
  // script asks there and builds nothing itself.
  const actions = readFileSync("src/safe-actions.ts", "utf8");
  assert.match(actions, /RENOUNCE_OWNERSHIP = "0x715018a6"/);
  assert.match(actions, /data\.toLowerCase\(\)\.startsWith\(RENOUNCE_OWNERSHIP\)\) throw new Error/);
  assert.match(readFileSync("scripts/safe-action.ts", "utf8"), /const call = safeActionCall\(process\.env\);/);
});

test("the judges page guards its one unguarded database read", () => {
  assert.match(readFileSync("app/judges/JudgesVerify.tsx", "utf8"), /exampleForJudges\(accounts\)\.catch\(\(\) => null\)/);
});
