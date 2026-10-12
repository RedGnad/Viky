// Strava opens on request (the founder, 12 Oct 2026). Its developer program asks the owner of every application for a
// paid subscription since June 2026; the first real reading, gift 1002, was refused; the founder takes the subscription
// the day a gift asks for Strava, as a university is set up by its first gift. The line is offered and paid for like
// any other, its two people read a day two days after the gift, the operator is written to for each gift and again
// each morning while one waits, and until the operator's one line opens it nothing is asked of Strava or of Reclaim.

delete process.env.DATABASE_URL;

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after, before } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Hex } from "viem";
import { CONDITIONS, FITBIT_DAILY, liveConditions, ON_REQUEST_DAYS, stateOf, STATES, STRAVA_DAILY } from "../src/conditions";
import { newVaultKey, sealSecret } from "../src/connect-vault";
import { connectedLineOf, runConnectedCheckIn, type ConnectedCheckInDeps } from "../src/connected-checkin";
import { configureConnectionStore, ensureConnectionSchema, saveConnection } from "../src/connection-store";
import { NO_CONTACT_HASH } from "../src/contact-hash";
import { UNCLAIMED_REFUND_DELAY_SECONDS } from "../src/daily-pass";
import { liveOf, type LiveInput } from "../src/gift-live";
import { configureGiftStore, ensureGiftSchema, markClaimed, saveGift } from "../src/gift-store";
import { GOAL_TYPE_STRAVA_DISTANCE } from "../src/gift-terms";
import {
  beingOpenedInWords,
  configureOnRequest,
  giftsAsking,
  linesOnRequest,
  openOnRequest,
  remindersOfGiftsAsking,
  sourceAskedAlert,
  standingStateOf,
  tellOfGiftsAsking,
  waitingToBeOpened,
  waitsToBeOpened,
} from "../src/on-request";
import type { SqlExecutor } from "../src/proof-session-store";
import { GIFT_LIVE, ON_REQUEST } from "../src/sentences";

const ESCROW = "0x00000000000000000000000000000000000000D3" as Hex;
const FUNDER = "0x000000000000000000000000000000000000F0F0" as Hex;
const RECIPIENT = "0x000000000000000000000000000000000000b0b0" as Hex;
/** 12 Oct 2026, 08:32 UTC: the hour gift 1002 was funded. Two days later is 14 Oct 2026. */
const FUNDED = Math.floor(Date.UTC(2026, 9, 12, 8, 32) / 1_000);

process.env.CONNECT_TOKEN_KEY = newVaultKey();
let db: PGlite;
const executor: SqlExecutor = async (strings, ...values) => {
  const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
  return (await db.query<Record<string, unknown>>(text, values)).rows;
};
before(async () => {
  db = new PGlite();
  configureGiftStore(executor);
  configureConnectionStore(executor);
  configureOnRequest(executor);
  await ensureGiftSchema();
  await ensureConnectionSchema();
  // Gift 1002 as it stands: opened, Strava connected before the line went on request, never started.
  await saveGift({ giftId: "1002", funder: FUNDER, contactHash: NO_CONTACT_HASH, claimToken: "a-link-key-0123456789abcdef", goalType: GOAL_TYPE_STRAVA_DISTANCE, dailyTarget: 1, durationDays: 7, amount: 1_120_000n, createdTx: `0x${"a2".repeat(32)}`, escrow: ESCROW });
  await markClaimed("1002", RECIPIENT, null);
  await saveConnection({ giftId: "1002", source: "strava", externalId: "4242", accessToken: sealSecret("an access key"), refreshToken: sealSecret("a refresh key"), expiresAt: new Date(Date.now() + 3_600_000), scope: "read,activity:read" });
});
after(async () => {
  configureGiftStore(undefined);
  configureConnectionStore(undefined);
  configureOnRequest(undefined);
  delete process.env.CONNECT_TOKEN_KEY;
  await db.close();
});

test("the line is on request in the register: offered like the others, eighteen again, and the fourth state says what it is", () => {
  assert.equal(STRAVA_DAILY.live, true);
  assert.equal(STRAVA_DAILY.state, "on-request");
  assert.equal(stateOf(STRAVA_DAILY).title, "On request");
  assert.equal(STRAVA_DAILY.beforeItOpens, "Ready two days after a first gift.");
  assert.deepEqual(STATES.map((state) => state.title), ["Open", "Waiting for the source's answer", "No public page exists", "On request"]);
  assert.equal(liveConditions().length, 18);
  assert.equal(CONDITIONS.length, 18);
  assert.deepEqual(linesOnRequest().map((line) => line.id), ["strava-daily"]);
  assert.equal(ON_REQUEST_DAYS, 2);
  // "Closed", the state of a few hours that day, is gone from the register and from every file that held it.
  for (const file of ["src/conditions.ts", "src/gift-live.ts", "src/connected-checkin.ts", "app/kit/ConnectTheAccount.tsx", "app/components/GiftPage.tsx", "app/api/connect/strava/start/route.ts", "app/judges/JudgesConditions.tsx", "src/judges-ways.ts"]) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /closedLineOf|lineClosed|CONDITION_CLOSED|state === "closed"/, file);
  }
});

test("a line on request waits until the operator's line opens it, and then is open like the others, with no deployment", async () => {
  // Nothing opened yet: the line waits. A line in any other state never does, and asks no row.
  assert.deepEqual([...(await waitingToBeOpened())], ["strava-daily"]);
  assert.equal(await waitsToBeOpened("strava-daily"), true);
  assert.equal(await waitsToBeOpened(FITBIT_DAILY.id), false);
  assert.equal(await waitsToBeOpened(undefined), false);
  assert.equal(standingStateOf(STRAVA_DAILY, await waitingToBeOpened()), "on-request");
  assert.equal(standingStateOf(FITBIT_DAILY, await waitingToBeOpened()), "open");
  // Rows that cannot be read say nothing is opened: the line stays on request, which asks nothing of anybody.
  configureOnRequest(async () => {
    throw new Error("no database");
  });
  assert.equal(await waitsToBeOpened("strava-daily"), true);
  configureOnRequest(executor);
  // Only a line the register offers on request can be opened.
  await assert.rejects(() => openOnRequest("fitbit-daily", null), /not a line offered on request/);
});

test("while it waits, a gift is read for nothing: no key opened, nothing asked of Strava or of Reclaim, and it is told why", async () => {
  const reached: string[] = [];
  const never = (what: string) => async () => {
    reached.push(what);
    throw new Error(`${what} was reached`);
  };
  const line = connectedLineOf(GOAL_TYPE_STRAVA_DISTANCE)!;
  assert.equal(line.conditionId, "strava-daily");
  const deps: ConnectedCheckInDeps = {
    now: () => Math.floor(Date.now() / 1_000),
    configured: () => true,
    gift: never("the chain") as never,
    refresh: never("the refresh") as never,
    look: never("the look") as never,
    read: never("the proof") as never,
    // What production's own dependencies ask: the register and the rows of what was opened.
    beingOpened: async (asked) => ((await waitsToBeOpened(asked.conditionId)) ? beingOpenedInWords(STRAVA_DAILY) : null),
  };
  const said = "Strava is being opened. Nothing is asked of you until it is.";
  for (const purpose of ["bind", "count"] as const) {
    assert.deepEqual(await runConnectedCheckIn({ giftId: "1002", purpose }, deps), purpose === "bind" ? { kind: "refused", giftId: "1002", code: "CONDITION_ON_REQUEST", message: said } : { kind: "already", giftId: "1002", reason: "not_bound" });
  }
  assert.deepEqual(reached, []);
  // The default dependencies ask the same, and the check comes before the connection is even loaded.
  const checkIn = readFileSync("src/connected-checkin.ts", "utf8");
  assert.match(checkIn, /beingOpened: async \(line\) => \{\s+const condition = conditionById\(line\.conditionId\);\s+return condition && \(await waitsToBeOpened\(condition\.id\)\) \? beingOpenedInWords\(condition\) : null;/);
  assert.ok(checkIn.indexOf("const beingOpened = (await deps.beingOpened?.(line)) ?? null;") > 0 && checkIn.indexOf("const beingOpened = (await deps.beingOpened?.(line)) ?? null;") < checkIn.indexOf("const connection = await loadConnection(giftId);"));
  // Nobody is sent to Strava's page either.
  const start = readFileSync("app/api/connect/strava/start/route.ts", "utf8");
  assert.match(start, /if \(await waitsToBeOpened\(STRAVA_DAILY\.id\)\) throw new GiftApiError\("CONDITION_ON_REQUEST", beingOpenedInWords\(STRAVA_DAILY\), 409\);/);
  assert.ok(start.indexOf("waitsToBeOpened(STRAVA_DAILY.id)") < start.indexOf("startStravaConnection({"), "refused before any address of Strava's is made");
});

test("the operator is written to once for a gift that asks, and again each morning while one waits", async () => {
  const gifts = async () => [
    { giftId: "1002", goalType: GOAL_TYPE_STRAVA_DISTANCE, escrow: ESCROW },
    { giftId: "1003", goalType: GOAL_TYPE_STRAVA_DISTANCE, escrow: ESCROW },
    // Taken back, ended, on another line, or with no contract known: none of these waits for Strava.
    { giftId: "1004", goalType: GOAL_TYPE_STRAVA_DISTANCE, escrow: ESCROW },
    { giftId: "1005", goalType: GOAL_TYPE_STRAVA_DISTANCE, escrow: ESCROW },
    { giftId: "7", goalType: FITBIT_DAILY.goalType!, escrow: ESCROW },
    { giftId: "1006", goalType: GOAL_TYPE_STRAVA_DISTANCE, escrow: null },
  ];
  const onChain = async (_escrow: string, giftId: string) => ({ fundedAt: giftId === "1003" ? FUNDED + 86_400 : FUNDED, cancelled: giftId === "1004", finalised: giftId === "1005" });
  assert.deepEqual((await giftsAsking({ gifts, onChain })).map((gift) => gift.giftId), ["1002", "1003"]);

  // The founder's mockup, to the word: the gift, the day its two people read, the three steps and the line to run.
  const mail = sourceAskedAlert({ giftId: "1003", conditionId: "strava-daily", fundedAt: FUNDED });
  assert.equal(mail.subject, "Strava asked for: gift 1003, ready by 14 Oct 2026");
  assert.deepEqual(mail.text.split("\n"), [
    "A gift asks for Strava. Both people read that it is ready by 14 Oct 2026.",
    "",
    "1. Take Strava's subscription with the account that owns the application.",
    "2. In Strava's API settings, reactivate the application and raise it to ten athletes.",
    "3. Open Strava in Viky with the one line written here.",
    "",
    "pnpm source:open strava-daily",
    "In production, with the operator's environment: VIKY_ALLOW_PRODUCTION_DATABASE=1 before the command above.",
  ]);

  // Once for a gift: the pass that runs every five minutes tells each gift the first time it sees it, and never again.
  const sent: string[] = [];
  const send = async (alert: { subject: string }) => void sent.push(alert.subject);
  assert.deepEqual(await tellOfGiftsAsking({ gifts, onChain, send }), ["1002", "1003"]);
  assert.deepEqual(sent, ["Strava asked for: gift 1002, ready by 14 Oct 2026", "Strava asked for: gift 1003, ready by 15 Oct 2026"]);
  assert.deepEqual(await tellOfGiftsAsking({ gifts, onChain, send }), []);
  assert.equal(sent.length, 2);

  // Each morning while one waits: one mail a line, every waiting gift in it, the earliest day first.
  const reminders = await remindersOfGiftsAsking({ gifts, onChain });
  assert.equal(reminders.length, 1);
  assert.equal(reminders[0]!.conditionId, "strava-daily");
  assert.equal(reminders[0]!.alert.subject, "Strava still asked for: 2 gifts, ready by 14 Oct 2026");
  assert.deepEqual(reminders[0]!.alert.text.split("\n").slice(0, 3), ["2 gifts still ask for Strava, and it is not open.", "Gift 1002: both people read that it is ready by 14 Oct 2026.", "Gift 1003: both people read that it is ready by 15 Oct 2026."]);
  assert.match(reminders[0]!.alert.text, /pnpm source:open strava-daily/);

  // The two passes are wired: the frequent one tells, the settling one reminds once in a day for a line.
  const frequent = readFileSync("app/api/cron/milestones/route.ts", "utf8");
  assert.match(frequent, /const told = await tellOfGiftsAsking\(\{ gifts: loadAllGifts, onChain: giftOnChain, send: sendAlert \}\);/);
  const settle = readFileSync("app/api/cron/settle/route.ts", "utf8");
  assert.match(settle, /for \(const reminder of reminders\) await tellOnceToday\(`source-asked:\$\{reminder\.conditionId\}`, \(\) => reminder\.alert\);/);

  // The operator's line opens it: the first time it says so, afterwards nothing changes, and nothing waits any more.
  assert.equal(await openOnRequest("strava-daily", "0xoperator"), "opened");
  assert.equal(await openOnRequest("strava-daily", "0xoperator"), "already");
  assert.deepEqual([...(await waitingToBeOpened())], []);
  assert.equal(await waitsToBeOpened("strava-daily"), false);
  assert.equal(standingStateOf(STRAVA_DAILY, await waitingToBeOpened()), "open");
  assert.deepEqual(await giftsAsking({ gifts, onChain }), []);
  assert.deepEqual(await remindersOfGiftsAsking({ gifts, onChain }), []);
  assert.deepEqual(await tellOfGiftsAsking({ gifts: async () => [{ giftId: "1009", goalType: GOAL_TYPE_STRAVA_DISTANCE, escrow: ESCROW }], onChain, send }), []);
  assert.equal(sent.length, 2);
  const script = readFileSync("scripts/source-open.ts", "utf8");
  assert.match(script, /const outcome = await openOnRequest\(conditionId, process\.env\.PROVEN_BY\?\.trim\(\) \|\| null\);/);
  assert.equal((JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> }).scripts["source:open"], "tsx scripts/source-open.ts");
});

test("the gift's page says it is being opened, with the day it is ready by, and asks for no connection", () => {
  const input = (over: Partial<LiveInput>): LiveInput => ({
    moment: "openedNotConnected",
    voice: "recipient",
    funderName: "Mom",
    recipientName: "Boo",
    source: "Strava",
    amountDisplay: "$7.00",
    theirsDisplay: "$0.00",
    returnedDisplay: "$0.00",
    todayReading: null,
    target: null,
    started: false,
    lastJudged: null,
    openBy: null,
    connectBy: "26 Oct 2026",
    nextReadingInWords: null,
    cameBackOnInWords: null,
    beingOpened: true,
    readyByInWords: "14 Oct 2026",
    ...over,
  });
  // The founder's mockup, to the word, for who opened it and for who offered it.
  const yours = liveOf(input({}));
  assert.equal(yours.headline, "Strava is being opened for you.");
  assert.equal(yours.next, "Ready by 14 Oct 2026. The money is already in your name.");
  assert.deepEqual(yours.figure, { label: "In your name", value: "$7.00" });
  const theirs = liveOf(input({ voice: "funder" }));
  assert.equal(theirs.headline, "Strava is being opened.");
  assert.equal(theirs.next, "Ready by 14 Oct 2026.");
  // To a reader who is neither, the title alone; and once the day has passed, no day is said.
  assert.equal(liveOf(input({ voice: "reader" })).next, null);
  assert.equal(liveOf(input({ readyByInWords: null })).next, "The money is already in your name.");
  assert.equal(liveOf(input({ voice: "funder", readyByInWords: null })).next, null);
  // Once the line is open the page says what it always said of a gift opened and not connected.
  assert.equal(liveOf(input({ beingOpened: false })).headline, GIFT_LIVE.notConnected.yours("Strava"));
  // The day is the gift's day plus two, at the reader's clock, with its year; and the page asks the server whether
  // the line still waits, never the register alone.
  const page = readFileSync("app/components/GiftPage.tsx", "utf8");
  assert.match(page, /const beingOpened = Boolean\(daily\?\.onRequest\);\s+const readyByMs = \(status\.createdAtChain \+ ON_REQUEST_DAYS \* 86_400\) \* 1000;\s+const readyBy = !beingOpened \|\| \(nowMs !== 0 && onALaterDay\(nowMs, readyByMs, zone\)\) \? null : dateInWords\(readyByMs, zone\);/);
  assert.match(readFileSync("src/gift-status.ts", "utf8"), /onRequest: await waitsToBeOpened\(conditionOfGoal\(gift\.goalType\)\?\.id\),/);
  // No connection is asked for while it waits; a key given before can still be given back.
  const block = readFileSync("app/kit/ConnectTheAccount.tsx", "utf8");
  assert.match(block, /if \(beingOpened\) \{\s+if \(!status\?\.connected\) return null;/);
  assert.match(block, /data-being-opened=""[\s\S]*?\{words\.disconnect\}/);
  // A card in a list says the same title.
  assert.match(readFileSync("app/kit/GiftCard.tsx", "utf8"), /if \(!gift\.counting && gift\.beingOpened && source\) return gift\.role === "recipient" \? L\.notConnected\.beingOpenedYours\(source\) : L\.notConnected\.beingOpenedTheirs\(source\);/);
  // The fourteen days of a gift opened and never started do not move.
  assert.equal(UNCLAIMED_REFUND_DELAY_SECONDS, 14 * 86_400);
});

test("the choice lists it like the others, with \"On request\" under its nature, and three lines under its name once chosen", () => {
  assert.equal(ON_REQUEST.mark, "On request");
  assert.deepEqual(ON_REQUEST.forAPayer("Strava"), ["Strava opens on request.", "Offer the gift, and we open it within two days.", "You have nothing else to do."]);
  const sheet = readFileSync("app/kit/offer/WillSheet.tsx", "utf8");
  // In the quiet voice of what a line is, never the labels' capitals; no dot, no grey, and the row is pressed like the others.
  assert.match(sheet, /\{onRequest\.has\(option\.id\) \? \(\s+<span className=\{HELP\} data-on-request="">\s+\{ON_REQUEST\.mark\}/);
  const card = readFileSync("app/kit/offer/OfferCard.tsx", "utf8");
  assert.match(card, /\{condition && onRequest\.has\(condition\.id\) \? \(\s+<span className=\{`\$\{HELP\} mt-\[var\(--space-sm\)\] block w-full`\} data-on-request-said="">\s+\{ON_REQUEST\.forAPayer\(condition\.source\)\.map\(/);
  // Which lines wait is the server's answer, for everybody alike; until it comes the register's own state stands.
  assert.match(readFileSync("app/api/conditions/route.ts", "utf8"), /const onRequest = \[\.\.\.\(await waitingToBeOpened\(\)\)\];\s+return NextResponse\.json\(\{ ids, preview, reserves, onRequest,/);
  const hook = readFileSync("src/client/on-request.ts", "utf8");
  assert.match(hook, /if \(live && answer\.onRequest\) setWaiting\(new Set\(answer\.onRequest\)\);/);
  assert.match(hook, /useState<ReadonlySet<string>>\(inTheRegister\)/);
  // The gift is made like any other: the route that makes it refuses a line that is not live, and this one is.
  assert.match(readFileSync("app/api/gift/create/route.ts", "utf8"), /if \(!condition\.live\) throw new GiftApiError\("GOAL_NOT_OFFERED"/);
});
