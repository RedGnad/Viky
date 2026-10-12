// A connected source that refuses a reading says so, and costs no proof (12 Oct 2026). The first real reading of
// Strava, gift 1002, was refused three times through the attested fetch: three fetches started, and a person who read
// "That page is not public any more", the sentence of a certificate somebody took private. Strava had answered 403 to
// Viky's application. Here: the source is asked plainly first with the person's key, a refusal is told in the
// source's own words to the operator and in true ones to the person, no proof is asked, and the pass holds the gift.

delete process.env.DATABASE_URL;

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after, before } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Hex } from "viem";
import type { Alert } from "../src/attested-calls";
import { classifyFetchFailure } from "../src/attested-read";
import { GOOGLE_HEALTH_ACTIVE_MINUTES, STRAVA_DAY_ACTIVITIES } from "../src/attested-sources";
import { newVaultKey, sealSecret } from "../src/connect-vault";
import { runConnectedCheckIn, SOURCE_REFUSED, sourceRefusedAlert, sourceRefusedSentence, type ConnectedCheckInDeps } from "../src/connected-checkin";
import { lookAtConnectedSource, refusalInWords, type ConnectedLook, type LookFetch } from "../src/connected-look";
import { configureConnectionStore, ensureConnectionSchema, saveConnection } from "../src/connection-store";
import { NO_CONTACT_HASH } from "../src/contact-hash";
import { COUNTING_PASS, dailyPass, type DailyPassDeps } from "../src/daily-pass";
import type { GiftState } from "../src/gift-reader";
import { configureGiftStore, ensureGiftSchema, markBound, markClaimed, saveGift } from "../src/gift-store";
import { GOAL_TYPE_STRAVA_DISTANCE } from "../src/gift-terms";
import type { NewPass } from "../src/pass-log";
import type { SqlExecutor } from "../src/proof-session-store";

/** What Strava answers an application it has switched off, as its staff quoted it on 2 Jul 2026. */
const STRAVA_INACTIVE = '{"message":"Forbidden","errors":[{"resource":"Application","field":"Status","code":"Inactive"}]}';
const KEY = "the-person-s-key-0123456789";

type Asked = { url: string; method: string; headers: Record<string, string>; body?: string };
function answering(status: number, body: string) {
  const asked: Asked[] = [];
  const read = { text: 0, cancelled: 0 };
  const fetchLike: LookFetch = async (url, init) => {
    asked.push({ url, method: init.method, headers: init.headers, body: init.body });
    return {
      status,
      text: async () => {
        read.text += 1;
        return body;
      },
      body: {
        cancel: async () => {
          read.cancelled += 1;
        },
      },
    };
  };
  return { asked, read, fetchLike };
}

test("the look asks the source what the attested read asks it, with the person's key", async () => {
  const strava = answering(200, "[]");
  assert.deepEqual(await lookAtConnectedSource(STRAVA_DAY_ACTIVITIES, "2026-10-12", KEY, strava.fetchLike), { kind: "open" });
  assert.equal(strava.asked.length, 1);
  assert.equal(strava.asked[0].url, STRAVA_DAY_ACTIVITIES.url("2026-10-12"));
  assert.equal(strava.asked[0].method, "GET");
  assert.equal(strava.asked[0].body, undefined);
  assert.deepEqual(strava.asked[0].headers, { accept: "application/json", "user-agent": "Mozilla/5.0 (Viky)", authorization: `Bearer ${KEY}` });
  // A page that is served is left unread: nothing of the day is wanted before the proof.
  assert.deepEqual(strava.read, { text: 0, cancelled: 1 });

  // Google Health is asked by POST, with the body the source describes.
  const google = answering(200, "{}");
  assert.deepEqual(await lookAtConnectedSource(GOOGLE_HEALTH_ACTIVE_MINUTES, "2026-10-12", KEY, google.fetchLike), { kind: "open" });
  assert.equal(google.asked[0].method, "POST");
  assert.equal(google.asked[0].body, GOOGLE_HEALTH_ACTIVE_MINUTES.body?.("2026-10-12"));
  assert.equal(google.asked[0].headers["content-type"], "application/json");
  assert.equal(google.asked[0].headers.authorization, `Bearer ${KEY}`);
});

test("a 403 is the source refusing, and its own words are kept; anything else is a page not seen", async () => {
  assert.deepEqual(await lookAtConnectedSource(STRAVA_DAY_ACTIVITIES, "2026-10-12", KEY, answering(403, STRAVA_INACTIVE).fetchLike), { kind: "refused", status: 403, said: "Forbidden: Application Status Inactive" });
  const google = '{"error":{"code":403,"message":"Google Health API has not been used in project 1 before or it is disabled.","status":"PERMISSION_DENIED"}}';
  assert.deepEqual(await lookAtConnectedSource(GOOGLE_HEALTH_ACTIVE_MINUTES, "2026-10-12", KEY, answering(403, google).fetchLike), {
    kind: "refused",
    status: 403,
    said: "PERMISSION_DENIED: Google Health API has not been used in project 1 before or it is disabled.",
  });
  for (const status of [400, 401, 404, 429, 500, 503]) {
    const look = await lookAtConnectedSource(STRAVA_DAY_ACTIVITIES, "2026-10-12", KEY, answering(status, '{"message":"Rate Limit Exceeded","errors":[]}').fetchLike);
    assert.deepEqual(look, { kind: "unseen", status, said: "Rate Limit Exceeded" });
  }
  const down: LookFetch = async () => Promise.reject(new TypeError("fetch failed"));
  assert.deepEqual(await lookAtConnectedSource(STRAVA_DAY_ACTIVITIES, "2026-10-12", KEY, down), { kind: "unseen", status: null, said: "TypeError: fetch failed" });
});

test("what a source said is a few words, and never a key", () => {
  assert.equal(refusalInWords(STRAVA_INACTIVE), "Forbidden: Application Status Inactive");
  assert.equal(refusalInWords("<html>\n  <h1>403 Forbidden</h1>\n</html>"), "<html> <h1>403 Forbidden</h1> </html>");
  assert.equal(refusalInWords(""), "");
  assert.equal(refusalInWords(`{"message":"no: Bearer ${KEY}"}`), "no: Bearer (key)");
  assert.equal(refusalInWords("x".repeat(2_000)).length, 240);
  assert.doesNotMatch(readFileSync("src/connected-look.ts", "utf8"), /console\./, "the look itself logs nothing: the reading that asked for it says what it met");
});

const ESCROW = "0x00000000000000000000000000000000000000D3" as Hex;
const FUNDER = "0x000000000000000000000000000000000000F0F0" as Hex;
const RECIPIENT = "0x000000000000000000000000000000000000b0b0" as Hex;
const DAY = 86_400;
const CONNECTED = 20_700;
const EVENING = CONNECTED * DAY + 18 * 3_600;
const MORNING_AFTER = (CONNECTED + 1) * DAY + 40 * 60;

process.env.CONNECT_TOKEN_KEY = newVaultKey();

let db: PGlite;
before(async () => {
  db = new PGlite();
  const executor: SqlExecutor = async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    return (await db.query<Record<string, unknown>>(text, values)).rows;
  };
  configureGiftStore(executor);
  configureConnectionStore(executor);
  await ensureGiftSchema();
  await ensureConnectionSchema();
  // Gift 9 is counting; gift 10 was opened and connected a moment ago, and its first reading has not passed.
  for (const giftId of ["9", "10"]) {
    await saveGift({ giftId, funder: FUNDER, contactHash: NO_CONTACT_HASH, claimToken: `a-link-key-0123456789abcd${giftId}`, goalType: GOAL_TYPE_STRAVA_DISTANCE, dailyTarget: 1, durationDays: 7, amount: 7_000_000n, createdTx: `0x${giftId.padStart(2, "0").repeat(32)}`, escrow: ESCROW });
    await markClaimed(giftId, RECIPIENT, null);
    await saveConnection({ giftId, source: "strava", externalId: "4242", accessToken: sealSecret(KEY), refreshToken: sealSecret("a refresh key"), expiresAt: new Date((CONNECTED + 30) * DAY * 1_000), scope: "read,activity:read" });
  }
  await markBound("9", "4242");
});
after(async () => {
  configureGiftStore(undefined);
  configureConnectionStore(undefined);
  delete process.env.CONNECT_TOKEN_KEY;
  await db.close();
});

function gift(giftId: string, over: Partial<GiftState> = {}): GiftState {
  return {
    giftId,
    funder: FUNDER,
    refundTo: FUNDER,
    recipient: RECIPIENT,
    recipientContactHash: NO_CONTACT_HASH,
    goalType: GOAL_TYPE_STRAVA_DISTANCE,
    dailyTarget: 1,
    durationDays: 7,
    startDay: CONNECTED,
    endDay: CONNECTED + 6,
    creditedDays: 0,
    drainedDays: 0,
    settledThroughDay: CONNECTED - 1,
    amount: 7_000_000n,
    perDay: 1_000_000n,
    withdrawnByRecipient: 0n,
    refundedToFunder: 0n,
    refundable: 0n,
    identityHash: `0x${"1d".repeat(32)}`,
    baselineValue: 0n,
    lastCheckInAt: EVENING,
    fundedAt: (CONNECTED - 2) * DAY,
    claimedAt: (CONNECTED - 1) * DAY,
    cancelled: false,
    finalised: false,
    earnedBalance: 0n,
    refundableBalance: 0n,
    withdrawNonce: 0n,
    version: 3,
    openingKey: FUNDER,
    endedAt: 0,
    givenBackDays: 0,
    ...over,
  };
}

/** A reading whose look answers as told, and which says what it asked of whom. */
function reading(onChain: GiftState, now: number, look: ConnectedLook | null, zkFetch?: () => Promise<never>) {
  const calls: string[] = [];
  const told: { name: string; alert: Alert }[] = [];
  const deps: ConnectedCheckInDeps = {
    now: () => now,
    configured: () => true,
    gift: async () => onChain,
    refresh: async () => Promise.reject(new Error("the key was good for a month: nothing to refresh")),
    ...(look
      ? {
          look: async (source, account, bearer) => {
            calls.push(`look ${source.id} ${account} ${bearer === KEY ? "with the person's key" : "with another key"}`);
            return look;
          },
        }
      : {}),
    tell: async (name, alert) => void told.push({ name, alert: alert() }),
    read: async () => {
      calls.push("proof");
      if (!zkFetch) throw new Error("the attested fetch was reached");
      return { zkFetch, verify: async () => true };
    },
  };
  return { calls, told, deps };
}

const REFUSED = { kind: "refused", giftId: "10", code: "SOURCE_REFUSED", message: "Strava refused Viky's reading. It is ours to fix: try again later." };

test("gift 1002 again: Strava refuses the first reading, no proof is asked, and nobody is told they hid a page", async () => {
  const first = reading(gift("10", { startDay: 0, endDay: 0, identityHash: `0x${"00".repeat(32)}` }), EVENING, { kind: "refused", status: 403, said: "Forbidden: Application Status Inactive" });
  assert.deepEqual(await runConnectedCheckIn({ giftId: "10", purpose: "bind" }, first.deps), REFUSED);
  // The look was taken on today's page with the person's key, and nothing left for Reclaim.
  assert.deepEqual(first.calls, [`look strava-day-activities ${new Date(EVENING * 1_000).toISOString().slice(0, 10)} with the person's key`]);
  // The operator reads Strava's own words, once in a day for the source.
  assert.equal(first.told.length, 1);
  assert.equal(first.told[0].name, "source-refused:strava");
  assert.equal(first.told[0].alert.subject, "Strava refuses Viky's readings");
  assert.match(first.told[0].alert.text, /^Strava answered 403 to the reading of gift 10, asked plainly with the person's key, before any proof\.\nWhat it said: Forbidden: Application Status Inactive\n/);
  assert.doesNotMatch(first.told[0].alert.text, new RegExp(KEY));

  assert.equal(SOURCE_REFUSED, "SOURCE_REFUSED");
  assert.equal(sourceRefusedSentence("Fitbit"), "Fitbit refused Viky's reading. It is ours to fix: try again later.");
  assert.doesNotMatch(sourceRefusedSentence("Strava"), /public|private|page/i, "the person has no page here that they could have hidden");
  assert.equal(sourceRefusedAlert({ name: "Strava" }, "7", { kind: "refused", status: 403, said: "" }).text.split("\n")[1], "What it said: nothing");
});

test("a morning's count meets the same refusal the same way, and a source not seen takes no proof either", async () => {
  const morning = reading(gift("9"), MORNING_AFTER, { kind: "refused", status: 403, said: "Forbidden: Application Status Inactive" });
  assert.deepEqual(await runConnectedCheckIn({ giftId: "9", purpose: "count" }, morning.deps), { ...REFUSED, giftId: "9" });
  // Yesterday's page is the one a count reads.
  assert.deepEqual(morning.calls, [`look strava-day-activities ${new Date((MORNING_AFTER - DAY) * 1_000).toISOString().slice(0, 10)} with the person's key`]);

  const unseen = reading(gift("9"), MORNING_AFTER, { kind: "unseen", status: 429, said: "Rate Limit Exceeded" });
  assert.deepEqual(await runConnectedCheckIn({ giftId: "9", purpose: "count" }, unseen.deps), { kind: "refused", giftId: "9", code: "FETCH_FAILED", message: "Strava could not be read just now." });
  assert.equal(unseen.calls.includes("proof"), false);
  assert.deepEqual(unseen.told, [], "a page not seen is no refusal: nobody is written");
});

test("a source that serves the page is read attested, and a refusal met there is the same refusal", async () => {
  const open = reading(gift("9"), MORNING_AFTER, { kind: "open" });
  await assert.rejects(runConnectedCheckIn({ giftId: "9", purpose: "count" }, open.deps), /the attested fetch was reached/);
  assert.equal(open.calls[1], "proof");

  // The attested fetch's own 403, in zkFetch's words as the reading service passes them on (gift 1002, 12 Oct 2026).
  const said = "protocol terminated with error: HTTP response status 403 is not a success status: received HTTP 403, expected 2xx";
  const through = reading(gift("9"), MORNING_AFTER, null, async () => Promise.reject(new Error(said)));
  assert.deepEqual(await runConnectedCheckIn({ giftId: "9", purpose: "count" }, through.deps), { ...REFUSED, giftId: "9" });
  // A public page keeps its own sentence: a certificate taken private is something its holder did.
  assert.equal(classifyFetchFailure(said, STRAVA_DAY_ACTIVITIES).message, "That page is not public any more");
  const checkIn = readFileSync("src/connected-checkin.ts", "utf8");
  assert.match(checkIn, /error\.code === "REFUSED"\) return refusal\(giftId, SOURCE_REFUSED, sourceRefusedSentence\(line\.name\)\)/);
  // The look comes before the proof, and the default dependencies take it.
  assert.ok(checkIn.indexOf("await deps.look(source, dayName, tokens.accessToken)") > 0 && checkIn.indexOf("await deps.look(source, dayName, tokens.accessToken)") < checkIn.indexOf("await attestedRead("));
  assert.match(checkIn, /const defaultDeps: ConnectedCheckInDeps = \{[^}]*look: lookAtConnectedSource,/);
});

test("the pass holds a gift whose source refused Viky: nothing is settled against a reading nobody could take", async () => {
  const calls: string[] = [];
  const rows: NewPass[] = [];
  const deps: DailyPassDeps = {
    boundGifts: async () => [{ giftId: "1" }],
    allGifts: async () => [{ giftId: "1", escrow: ESCROW }],
    read: async () => ({ cancelled: false, finalised: false, startDay: 20_708, recipient: RECIPIENT, fundedAt: 1, claimedAt: 2 }),
    count: async (giftId) => ({ kind: "refused", giftId, code: SOURCE_REFUSED, message: sourceRefusedSentence("Strava") }),
    drain: async (giftId) => (calls.push(`drain:${giftId}`), { hash: "0xd" }),
    finalise: async (giftId) => (calls.push(`finalise:${giftId}`), { hash: "0xf" }),
    refund: async (giftId) => (calls.push(`refund:${giftId}`), { hash: "0xr" }),
    start: async () => ({ address: "0xrelayer", balance: 12n }),
    journal: async (pass) => void rows.push(pass),
  };
  await dailyPass(COUNTING_PASS, deps);
  assert.deepEqual(calls, []);
  assert.deepEqual(rows[0].failures, { SOURCE_REFUSED: 1 });
  assert.equal(rows[0].holds.length, 1);
});
