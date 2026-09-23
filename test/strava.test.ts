process.env.IDENTITY_HMAC_KEY = Buffer.alloc(32, 7).toString("base64");

import assert from "node:assert/strict";
import test from "node:test";
import { keccak256, stringToHex } from "viem";
import { attestedSource, STRAVA_DAY_ACTIVITIES } from "../src/attested-sources";
import { privacyOf } from "../src/condition-privacy";
import { proofOfCondition } from "../src/condition-proof";
import { BUILDING, conditionById, conditionOfGoal, STRAVA_DAILY } from "../src/conditions";
import { finishStravaConnection, startStravaConnection, stravaRedirectUri } from "../src/connect-strava";
import { openConnectState } from "../src/connect-state";
import { connectedLineOf } from "../src/connected-checkin";
import { GiftApiError } from "../src/gift-api";
import { GOAL_TYPE_STRAVA_DISTANCE, STRAVA_CONNECTED_PROVIDER_ID } from "../src/gift-terms";
import { distanceOfDay, exchangeStravaCode, isStravaAthleteId, refreshStravaTokens, revokeStravaToken, stravaAuthorizeUrl, stravaConfigured, stravaDayBounds, stravaDayMet, StravaError, stravaScopeAllows } from "../src/strava";

/**
 * Strava, connected by the person (D191): the second source of the third nature, on the model of Fitbit (D188).
 * The line in the register, the application's two variables, the authorisation without PKCE, the scope Strava sends
 * back, the exchange, the refresh and the revoke against a fake Strava, the day's distance, and the verdict.
 */

const ENV = { STRAVA_CLIENT_ID: "12345", STRAVA_CLIENT_SECRET: "s3cret", CONNECT_TOKEN_KEY: Buffer.alloc(32, 9).toString("base64"), SESSION_SIGNING_SECRET: "test-account-session-secret-that-is-longer-than-32-bytes", IDENTITY_HMAC_KEY: process.env.IDENTITY_HMAC_KEY } as unknown as NodeJS.ProcessEnv;
const NOW = 1_790_000_000;

test("the line: connected, in Move, on goal 4, being built with the three missing pieces named, and its words hold", () => {
  assert.equal(STRAVA_DAILY.nature, "connected");
  assert.equal(STRAVA_DAILY.family, "move");
  assert.equal(STRAVA_DAILY.goalType, GOAL_TYPE_STRAVA_DISTANCE);
  assert.equal(STRAVA_DAILY.live, true, "open since the reading service runs its source and the variables are set");
  assert.ok(!BUILDING.includes(STRAVA_DAILY));
  assert.equal(STRAVA_DAILY.beforeItOpens, undefined);
  assert.equal(conditionOfGoal(GOAL_TYPE_STRAVA_DISTANCE), STRAVA_DAILY);
  assert.equal(conditionById("strava-daily"), STRAVA_DAILY);
  assert.ok(proofOfCondition("strava-daily"));
  assert.equal(privacyOf(STRAVA_DAILY).kept, "verdict");
  assert.equal(STRAVA_DAILY.link.kind, "connect");
  if (STRAVA_DAILY.link.kind === "connect") {
    for (const sentence of Object.values(STRAVA_DAILY.link.consent)) assert.doesNotMatch(sentence, /token|wallet|chain|address/i, "the consumer words hold on the consent screen");
    assert.match(STRAVA_DAILY.link.consent.sees, /yes or no/);
    assert.match(STRAVA_DAILY.link.consent.never, /routes/);
  }
  assert.equal(STRAVA_DAILY.target?.suggested, 3);
  assert.equal(STRAVA_DAILY.target?.inWords(3), "3 km a day");
  assert.equal(STRAVA_DAILY.reading, "strava-day-activities");
  assert.equal(STRAVA_CONNECTED_PROVIDER_ID, keccak256(stringToHex("viky:provider:strava-connected:v1")));
  assert.equal(connectedLineOf(GOAL_TYPE_STRAVA_DISTANCE)?.conditionId, "strava-daily");
});

test("the application is two variables, and the authorisation goes to Strava's own page with the scope and the state, no PKCE", () => {
  assert.equal(stravaConfigured({} as NodeJS.ProcessEnv), false);
  assert.equal(stravaConfigured(ENV), true);
  const url = new URL(stravaAuthorizeUrl({ clientId: "12345", redirectUri: "https://viky.cash/api/connect/strava/callback", state: "n0nce" }));
  assert.equal(url.origin + url.pathname, "https://www.strava.com/oauth/authorize");
  assert.equal(url.searchParams.get("client_id"), "12345");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("scope"), "activity:read");
  assert.equal(url.searchParams.get("approval_prompt"), "auto");
  assert.equal(url.searchParams.get("redirect_uri"), "https://viky.cash/api/connect/strava/callback");
  assert.equal(url.searchParams.get("state"), "n0nce");
  assert.equal(url.searchParams.has("code_challenge"), false, "Strava takes the secret on the exchange, not a PKCE challenge");
  assert.equal(stravaScopeAllows("read,activity:read"), true);
  assert.equal(stravaScopeAllows("read,activity:read_all"), true);
  assert.equal(stravaScopeAllows("read"), false, "the person unticked the activities: no day could be read");
  assert.equal(stravaScopeAllows(null), false);
  assert.ok(isStravaAthleteId("8675309") && !isStravaAthleteId("A1") && !isStravaAthleteId(""));
});

test("the exchange, the refresh and the revoke against a fake Strava: the athlete's id and the six hour key, the secret in the body, the key given back", async () => {
  const calls: Array<{ url: string; body: string; auth?: string }> = [];
  const fake = async (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => {
    calls.push({ url, body: init.body ?? "", auth: init.headers.authorization });
    if (url.endsWith("/oauth/revoke")) return { status: 200, json: async () => ({}) };
    const params = new URLSearchParams(init.body ?? "");
    if (params.get("grant_type") === "authorization_code") return { status: 200, json: async () => ({ access_token: "acc1", refresh_token: "ref1", expires_at: NOW + 21_600, expires_in: 21_600, athlete: { id: 8_675_309 } }) };
    return { status: 200, json: async () => ({ access_token: "acc2", refresh_token: "ref2", expires_at: NOW + 40_000 }) };
  };
  const tokens = await exchangeStravaCode({ code: "c0de", scope: "read,activity:read", nowSeconds: NOW }, fake, ENV);
  assert.deepEqual(tokens, { accessToken: "acc1", refreshToken: "ref1", expiresAt: NOW + 21_600, athleteId: "8675309", scope: "read,activity:read" });
  assert.match(calls[0].body, /client_secret=s3cret/);
  assert.match(calls[0].body, /grant_type=authorization_code/);
  const fresh = await refreshStravaTokens(tokens, NOW + 30_000, fake, ENV);
  assert.deepEqual(fresh, { accessToken: "acc2", refreshToken: "ref2", expiresAt: NOW + 40_000, athleteId: "8675309", scope: "read,activity:read" }, "the athlete and the scope stay when the answer has none");
  await revokeStravaToken("acc2", fake, ENV);
  assert.equal(calls[2].url, "https://www.strava.com/oauth/revoke");
  assert.equal(calls[2].auth, `Basic ${Buffer.from("12345:s3cret").toString("base64")}`);
  assert.equal(calls[2].body, "token=acc2");
  const refusing = async () => ({ status: 401, json: async () => ({}) });
  await assert.rejects(() => exchangeStravaCode({ code: "x", scope: "activity:read", nowSeconds: NOW }, refusing, ENV), (error: unknown) => error instanceof StravaError && error.code === "EXCHANGE_REFUSED");
  await assert.rejects(() => refreshStravaTokens(tokens, NOW, refusing, ENV), (error: unknown) => error instanceof StravaError && error.code === "REFRESH_REFUSED");
  await assert.rejects(() => revokeStravaToken("acc1", refusing, ENV), (error: unknown) => error instanceof StravaError && error.code === "REVOKE_FAILED");
  await assert.rejects(() => exchangeStravaCode({ code: "x", scope: "activity:read", nowSeconds: NOW }, fake, {} as NodeJS.ProcessEnv), (error: unknown) => error instanceof StravaError && error.code === "NOT_CONFIGURED");
});

test("a day is its UTC bounds, its activities' distances added, and met from the kilometres the funder set", () => {
  assert.deepEqual(stravaDayBounds("2026-09-22"), { start: 1_790_035_200, end: 1_790_121_600 }, "day 20,718 since the epoch, as fitbitDateOfUtcDay names it");
  const list = JSON.stringify([
    { id: 1, distance: 2_500.4, start_date: "2026-09-22T06:10:00Z", sport_type: "Run", map: { summary_polyline: "abc" } },
    { id: 2, distance: 1_200, start_date: "2026-09-22T18:00:00Z", sport_type: "Walk" },
    { id: 3, distance: 9_000, start_date: "2026-09-21T23:59:59Z", sport_type: "Ride" },
  ]);
  assert.equal(distanceOfDay(list, "2026-09-22"), 3_700, "the day's own, whole metres, the day before left out");
  assert.equal(distanceOfDay("[]", "2026-09-22"), 0, "no activity is a day of zero");
  assert.equal(distanceOfDay(undefined, "2026-09-22"), undefined);
  assert.equal(distanceOfDay("not json", "2026-09-22"), undefined);
  assert.equal(distanceOfDay('{"message":"Authorization Error"}', "2026-09-22"), undefined, "an error page is not a list");
  assert.equal(stravaDayMet(3_700, 3), true);
  assert.equal(stravaDayMet(2_999, 3), false);
  assert.equal(stravaDayMet(3_700, 0), false);
  const judged = connectedLineOf(GOAL_TYPE_STRAVA_DISTANCE)!.judge({ activities: list }, "2026-09-22", 3);
  assert.deepEqual(judged, { met: true });
  assert.ok("missing" in connectedLineOf(GOAL_TYPE_STRAVA_DISTANCE)!.judge({}, "2026-09-22", 3));
});

test("the source is read with the person's key, on the day named, captures the whole list, and is in the shared list", () => {
  assert.equal(attestedSource("strava-day-activities"), STRAVA_DAY_ACTIVITIES, "in the shared list the reading service runs");
  assert.equal(STRAVA_DAY_ACTIVITIES.auth, "bearer");
  assert.ok(STRAVA_DAY_ACTIVITIES.accepts("2026-09-22") && !STRAVA_DAY_ACTIVITIES.accepts("8675309"));
  assert.equal(STRAVA_DAY_ACTIVITIES.url("2026-09-22"), "https://www.strava.com/api/v3/athlete/activities?after=1790035199&before=1790121600&per_page=30");
  const answer = '[{"id":1,"distance":2500.4,"start_date":"2026-09-22T06:10:00Z","start_latlng":[48.8,2.3]}]';
  const found = new RegExp(STRAVA_DAY_ACTIVITIES.matches[0].value).exec(answer);
  assert.equal(found?.groups?.activities, answer, "the whole list, brackets included, so the app can add the distances");
});

test("the way out and back: the state is signed, the scope is checked, and a gift on another line is refused", async () => {
  const saved = process.env;
  process.env = { ...saved, ...ENV, NEXT_PUBLIC_APP_URL: "https://viky.cash" };
  try {
    assert.equal(stravaRedirectUri("http://localhost:3000/x"), "https://viky.cash/api/connect/strava/callback");
    const { url, cookie } = startStravaConnection({ giftId: "7", account: "0x000000000000000000000000000000000000a11c", requestUrl: "https://viky.cash/g/7", nowSeconds: NOW });
    const nonce = new URL(url).searchParams.get("state") ?? "";
    const sealed = /__Host-viky-connect=([^;]+)/.exec(cookie)?.[1] ?? "";
    const state = openConnectState(decodeURIComponent(sealed), NOW + 10);
    assert.equal(state.source, "strava");
    assert.equal(state.verifier, "", "no PKCE at Strava");
    assert.equal(state.nonce, nonce);
    const back = await finishStravaConnection({ code: "c0de", state: nonce, scope: "read", cookieHeader: cookie.split(";")[0], account: "0x000000000000000000000000000000000000a11c", nowSeconds: NOW + 20 });
    assert.deepEqual(back, { giftId: "7", ok: false, code: "SCOPE_MISSING" });
    const wrong = await finishStravaConnection({ code: "c0de", state: "other", scope: "activity:read", cookieHeader: cookie.split(";")[0], account: "0x000000000000000000000000000000000000a11c", nowSeconds: NOW + 20 });
    assert.deepEqual(wrong, { giftId: "7", ok: false, code: "STATE_MISMATCH" });
    const none = await finishStravaConnection({ code: null, state: nonce, scope: null, cookieHeader: null, account: "0x000000000000000000000000000000000000a11c", nowSeconds: NOW + 20 });
    assert.deepEqual(none, { giftId: null, ok: false, code: "NO_STATE" });
  } finally {
    process.env = saved;
  }
  assert.throws(() => startStravaConnection({ giftId: "7", account: "0x000000000000000000000000000000000000a11c", requestUrl: "https://viky.cash/g/7", nowSeconds: NOW }), (error: unknown) => error instanceof GiftApiError && error.code === "NOT_CONFIGURED");
});
