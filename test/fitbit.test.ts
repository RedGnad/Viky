process.env.IDENTITY_HMAC_KEY = Buffer.alloc(32, 7).toString("base64");

import assert from "node:assert/strict";
import test from "node:test";
import { keccak256, stringToHex } from "viem";
import { BUILDING, conditionById, conditionOfGoal, FAMILIES, FITBIT_DAILY } from "../src/conditions";
import { proofOfCondition } from "../src/condition-proof";
import { finishFitbitConnection, fitbitRedirectUri, startFitbitConnection } from "../src/connect-fitbit";
import { openConnectState } from "../src/connect-state";
import { verdictMetric } from "../src/connected-checkin";
import { activeMinutesOf, exchangeFitbitCode, fitbitAuthorizeUrl, fitbitConfigured, fitbitDateOfUtcDay, fitbitDayMet, FitbitError, isFitbitDate, isFitbitUserId, pkceChallenge, pkceVerifier, refreshFitbitTokens, revokeFitbitToken } from "../src/fitbit";
import { GiftApiError } from "../src/gift-api";
import { FITBIT_CONNECTED_PROVIDER_ID, GOAL_TYPE_FITBIT_ACTIVITY } from "../src/gift-terms";
import { attestedSource } from "../src/attested-sources";
import { connectedSource, FITBIT_DAILY_SUMMARY } from "../src/fitbit-source";
import { CONDITION_NATURE } from "../src/sentences";

/** Fitbit, connected by the person (D188): the third nature, its line, its goal, its round trip and its verdict. */

const env = { FITBIT_CLIENT_ID: "23ABCD", FITBIT_CLIENT_SECRET: "s3cr3t", CONNECT_TOKEN_KEY: Buffer.alloc(32, 9).toString("base64"), SESSION_SIGNING_SECRET: "test-account-session-secret-that-is-longer-than-32-bytes", IDENTITY_HMAC_KEY: process.env.IDENTITY_HMAC_KEY } as unknown as NodeJS.ProcessEnv;
const ACCOUNT = "0x000000000000000000000000000000000000a11c";

test("the line: connected by them, the family Move, goal 6 on the daily contract, the consent in our words", () => {
  assert.equal(GOAL_TYPE_FITBIT_ACTIVITY, 6);
  assert.equal(FITBIT_CONNECTED_PROVIDER_ID, keccak256(stringToHex("viky:provider:fitbit-connected:v1")));
  assert.equal(FITBIT_CONNECTED_PROVIDER_ID, "0x1945fcd86cc0f0a5a3ffcea6145dbbb882c4c0ac989624a4476da8885c16a701", "the id written in OPERATIONS for the owner to sign");
  assert.equal(FITBIT_DAILY.kind, "daily");
  assert.equal(FITBIT_DAILY.nature, "connected");
  assert.equal(FITBIT_DAILY.family, "move");
  assert.equal(FITBIT_DAILY.live, false);
  assert.equal(FITBIT_DAILY.goalType, 6);
  assert.equal(conditionOfGoal(6), FITBIT_DAILY, "a gift on goal 6 is this line, behind the door");
  assert.ok(BUILDING.includes(FITBIT_DAILY));
  assert.equal(FAMILIES.at(-1)?.title, "Move");
  assert.equal(CONDITION_NATURE.connected, "CONNECTED BY THEM");
  assert.equal(FITBIT_DAILY.link.kind, "connect");
  if (FITBIT_DAILY.link.kind === "connect") {
    const consent = FITBIT_DAILY.link.consent;
    assert.match(consent.sees, /yes or no/, "what the funder is told");
    assert.match(consent.never, /never see/, "what the funder never sees");
    assert.match(consent.erase, /disconnect and erase/i, "how to leave");
    for (const sentence of Object.values(consent)) assert.doesNotMatch(sentence, /token|wallet|chain|address/i, "the consumer words hold on the consent screen");
  }
  assert.equal(FITBIT_DAILY.target?.suggested, 30);
  assert.equal(FITBIT_DAILY.reading, "fitbit-daily-summary");
  assert.ok(proofOfCondition("fitbit-daily"));
  assert.equal(conditionById("fitbit-daily"), FITBIT_DAILY);
});

test("the source is read with the person's key as a secret, on the day named, and matches the minutes", () => {
  // Known to the app and not yet to the reading service: the shared list is the founder's step (OPERATIONS, step 3).
  assert.equal(attestedSource("fitbit-daily-summary"), undefined, "not in the shared list until the reading service runs it");
  assert.equal(connectedSource("fitbit-daily-summary"), FITBIT_DAILY_SUMMARY);
  assert.equal(FITBIT_DAILY_SUMMARY.auth, "bearer");
  assert.ok(FITBIT_DAILY_SUMMARY.accepts("2026-09-22") && !FITBIT_DAILY_SUMMARY.accepts("ama") && !FITBIT_DAILY_SUMMARY.accepts("2026-9-2"));
  assert.equal(FITBIT_DAILY_SUMMARY.url("2026-09-22"), "https://api.fitbit.com/1/user/-/activities/date/2026-09-22.json");
  const answer = '{"summary":{"fairlyActiveMinutes":12,"veryActiveMinutes":25,"lightlyActiveMinutes":140,"steps":8412}}';
  const values: Record<string, string> = {};
  for (const match of FITBIT_DAILY_SUMMARY.matches) {
    const found = new RegExp(match.value).exec(answer);
    assert.ok(found?.groups, match.value);
    Object.assign(values, found.groups);
  }
  assert.deepEqual(values, { fairlyActiveMinutes: "12", veryActiveMinutes: "25", steps: "8412" });
  assert.equal(activeMinutesOf(values), 37, "fairly and very active, as Fitbit's own daily goal counts them");
  assert.equal(activeMinutesOf({ steps: "1" }), undefined);
  assert.ok(fitbitDayMet(37, 30) && !fitbitDayMet(29, 30) && !fitbitDayMet(37, 0));
  assert.equal(fitbitDateOfUtcDay(20_718), "2026-09-22", "day 20718 since 1970 is 22 Sep 2026");
  assert.ok(isFitbitDate("2026-09-22") && !isFitbitDate("22/09/2026"));
});

test("the verdict is what the contract counts: its baseline plus the target when the day was won, and zero to start", () => {
  const onChain = { baselineValue: 90n, dailyTarget: 30 };
  assert.equal(verdictMetric(onChain, "bind", true), 0n);
  assert.equal(verdictMetric(onChain, "count", true), 120n, "won: one more target, one more day");
  assert.equal(verdictMetric(onChain, "count", false), 90n, "lost: the baseline, which the contract refuses as no progress");
});

test("PKCE and the page the person is sent to", () => {
  const verifier = pkceVerifier();
  assert.match(verifier, /^[A-Za-z0-9_-]{43,128}$/);
  assert.equal(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", "the RFC 7636 example");
  const url = new URL(fitbitAuthorizeUrl({ clientId: "23ABCD", redirectUri: "https://viky.cash/api/connect/fitbit/callback", challenge: "c", state: "n" }));
  assert.equal(url.origin + url.pathname, "https://www.fitbit.com/oauth2/authorize");
  assert.deepEqual(Object.fromEntries(url.searchParams), { client_id: "23ABCD", response_type: "code", code_challenge: "c", code_challenge_method: "S256", scope: "activity", redirect_uri: "https://viky.cash/api/connect/fitbit/callback", state: "n" });
  assert.ok(isFitbitUserId("ABC123") && !isFitbitUserId("abc123") && !isFitbitUserId(12));
  assert.equal(fitbitConfigured({} as unknown as NodeJS.ProcessEnv), false);
  assert.equal(fitbitConfigured(env), true);
});

test("the keys are exchanged, refreshed and revoked with the application's own credentials, and a refusal is typed", async () => {
  const calls: Array<{ url: string; init: { method: string; headers: Record<string, string>; body?: string } }> = [];
  const answer = { access_token: "at", refresh_token: "rt", expires_in: 28_800, scope: "activity", user_id: "ABC123", token_type: "Bearer" };
  const ok = async (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => {
    calls.push({ url, init });
    return { status: 200, json: async () => answer };
  };
  const tokens = await exchangeFitbitCode({ code: "the-code", verifier: "the-verifier", redirectUri: "https://viky.cash/api/connect/fitbit/callback", nowSeconds: 1_000 }, ok, env);
  assert.deepEqual(tokens, { accessToken: "at", refreshToken: "rt", expiresAt: 29_800, userId: "ABC123", scope: "activity" });
  assert.equal(calls[0].url, "https://api.fitbit.com/oauth2/token");
  assert.equal(calls[0].init.headers.authorization, `Basic ${Buffer.from("23ABCD:s3cr3t").toString("base64")}`);
  assert.equal(new URLSearchParams(calls[0].init.body).get("code_verifier"), "the-verifier");
  assert.equal(new URLSearchParams(calls[0].init.body).get("grant_type"), "authorization_code");
  const refreshed = await refreshFitbitTokens(tokens, 2_000, async () => ({ status: 200, json: async () => ({ ...answer, access_token: "at2", refresh_token: "rt2" }) }), env);
  assert.equal(refreshed.accessToken, "at2");
  assert.equal(refreshed.refreshToken, "rt2");
  assert.equal(refreshed.userId, "ABC123");
  await revokeFitbitToken("at2", ok, env);
  assert.equal(calls.at(-1)?.url, "https://api.fitbit.com/oauth2/revoke");
  assert.equal(new URLSearchParams(calls.at(-1)?.init.body).get("token"), "at2");
  const refused = async () => ({ status: 401, json: async () => ({ errors: [] }) });
  await assert.rejects(exchangeFitbitCode({ code: "x", verifier: "y", redirectUri: "z", nowSeconds: 1 }, refused, env), (error: unknown) => error instanceof FitbitError && error.code === "EXCHANGE_REFUSED");
  await assert.rejects(refreshFitbitTokens(tokens, 1, refused, env), (error: unknown) => error instanceof FitbitError && error.code === "REFRESH_REFUSED");
  await assert.rejects(revokeFitbitToken("x", refused, env), (error: unknown) => error instanceof FitbitError && error.code === "REVOKE_FAILED");
  await assert.rejects(exchangeFitbitCode({ code: "x", verifier: "y", redirectUri: "z", nowSeconds: 1 }, async () => ({ status: 200, json: async () => ({}) }), env), (error: unknown) => error instanceof FitbitError && error.code === "BAD_ANSWER");
  await assert.rejects(exchangeFitbitCode({ code: "x", verifier: "y", redirectUri: "z", nowSeconds: 1 }, ok, {} as unknown as NodeJS.ProcessEnv), (error: unknown) => error instanceof FitbitError && error.code === "NOT_CONFIGURED");
});

test("the round trip: a state only this server reads back, refused before any exchange when it does not fit", async () => {
  const kept = { ...process.env };
  Object.assign(process.env, env);
  try {
    const started = startFitbitConnection({ giftId: "42", account: ACCOUNT, requestUrl: "https://viky.cash/api/connect/fitbit/start", nowSeconds: 1_790_000_000 });
    const url = new URL(started.url);
    const nonce = url.searchParams.get("state") ?? "";
    const sealed = started.cookie.split(";")[0].split("=").slice(1).join("=");
    const state = openConnectState(sealed, 1_790_000_010);
    assert.equal(state.giftId, "42");
    assert.equal(state.source, "fitbit");
    assert.equal(state.nonce, nonce);
    assert.equal(pkceChallenge(state.verifier), url.searchParams.get("code_challenge"));
    assert.equal(fitbitRedirectUri("https://viky.cash/x"), `${process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") || "https://viky.cash"}/api/connect/fitbit/callback`);
    const cookieHeader = `${started.cookie.split(";")[0]}`;
    const base = { code: "c", cookieHeader, account: ACCOUNT, requestUrl: "https://viky.cash/api/connect/fitbit/callback", nowSeconds: 1_790_000_020 };
    assert.deepEqual(await finishFitbitConnection({ ...base, state: nonce, cookieHeader: null }), { giftId: null, ok: false, code: "NO_STATE" });
    assert.deepEqual(await finishFitbitConnection({ ...base, state: "another" }), { giftId: "42", ok: false, code: "STATE_MISMATCH" });
    assert.deepEqual(await finishFitbitConnection({ ...base, state: nonce, account: "0x000000000000000000000000000000000000b0b0" }), { giftId: "42", ok: false, code: "OTHER_ACCOUNT" });
    assert.deepEqual(await finishFitbitConnection({ ...base, state: nonce, code: null }), { giftId: "42", ok: false, code: "REFUSED_AT_FITBIT" });
    assert.deepEqual(await finishFitbitConnection({ ...base, state: nonce, nowSeconds: 1_790_000_000 + 700 }), { giftId: null, ok: false, code: "EXPIRED" });
    delete process.env.FITBIT_CLIENT_ID;
    assert.throws(() => startFitbitConnection({ giftId: "42", account: ACCOUNT, requestUrl: "https://viky.cash/x", nowSeconds: 1 }), (error: unknown) => error instanceof GiftApiError && error.code === "NOT_CONFIGURED");
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in kept)) delete process.env[key];
    Object.assign(process.env, kept);
  }
});
