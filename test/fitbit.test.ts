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
import { attestedSource, GOOGLE_HEALTH_ACTIVE_MINUTES } from "../src/attested-sources";
import { CONDITION_NATURE } from "../src/sentences";

/**
 * Fitbit, connected by the person (D188), read through the Google Health API since the Fitbit Web API closes (D197):
 * the third nature, its line, its goal, Google's round trip, the daily roll-up and the verdict.
 */

const env = { GOOGLE_HEALTH_CLIENT_ID: "123-abc.apps.googleusercontent.com", GOOGLE_HEALTH_CLIENT_SECRET: "s3cr3t", CONNECT_TOKEN_KEY: Buffer.alloc(32, 9).toString("base64"), SESSION_SIGNING_SECRET: "test-account-session-secret-that-is-longer-than-32-bytes", IDENTITY_HMAC_KEY: process.env.IDENTITY_HMAC_KEY } as unknown as NodeJS.ProcessEnv;
const ACCOUNT = "0x000000000000000000000000000000000000a11c";

test("the line: connected by them, the family Move, goal 6 on the daily contract, the consent in our words", () => {
  assert.equal(GOAL_TYPE_FITBIT_ACTIVITY, 6);
  assert.equal(FITBIT_CONNECTED_PROVIDER_ID, keccak256(stringToHex("viky:provider:fitbit-connected:v1")));
  assert.equal(FITBIT_CONNECTED_PROVIDER_ID, "0x1945fcd86cc0f0a5a3ffcea6145dbbb882c4c0ac989624a4476da8885c16a701", "the id written in OPERATIONS for the owner to sign");
  assert.equal(FITBIT_DAILY.kind, "daily");
  assert.equal(FITBIT_DAILY.nature, "connected");
  assert.equal(FITBIT_DAILY.family, "move");
  assert.equal(FITBIT_DAILY.live, true, "open since the reading service runs its source and the variables are set");
  assert.equal(FITBIT_DAILY.goalType, 6);
  assert.equal(conditionOfGoal(6), FITBIT_DAILY, "a gift on goal 6 is this line, behind the door");
  assert.ok(!BUILDING.includes(FITBIT_DAILY));
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
  assert.equal(FITBIT_DAILY.reading, "google-health-active-minutes");
  assert.ok(proofOfCondition("fitbit-daily"));
  assert.equal(conditionById("fitbit-daily"), FITBIT_DAILY);
});

test("the source is the daily roll-up of active minutes, asked by POST for the civil day, wearables only, captured whole", () => {
  assert.equal(attestedSource("google-health-active-minutes"), GOOGLE_HEALTH_ACTIVE_MINUTES, "in the shared list the reading service runs");
  assert.equal(GOOGLE_HEALTH_ACTIVE_MINUTES.auth, "bearer");
  assert.equal(GOOGLE_HEALTH_ACTIVE_MINUTES.method, "POST");
  assert.ok(GOOGLE_HEALTH_ACTIVE_MINUTES.accepts("2026-09-22") && !GOOGLE_HEALTH_ACTIVE_MINUTES.accepts("ama") && !GOOGLE_HEALTH_ACTIVE_MINUTES.accepts("2026-9-2"));
  assert.equal(GOOGLE_HEALTH_ACTIVE_MINUTES.url("2026-09-22"), "https://health.googleapis.com/v4/users/me/dataTypes/active-minutes/dataPoints:dailyRollUp");
  assert.deepEqual(JSON.parse(GOOGLE_HEALTH_ACTIVE_MINUTES.body!("2026-09-30")), {
    range: { start: { date: { year: 2026, month: 9, day: 30 } }, end: { date: { year: 2026, month: 10, day: 1 } } },
    windowSizeDays: 1,
    dataSourceFamily: "users/me/dataSourceFamilies/google-wearables",
  }, "one civil day, the next as its exclusive end, across a month");
  const answer = JSON.stringify({
    rollupDataPoints: [
      {
        civilStartTime: { date: { year: 2026, month: 9, day: 22 } },
        civilEndTime: { date: { year: 2026, month: 9, day: 23 } },
        activeMinutes: { activeMinutesRollupByActivityLevel: [{ activityLevel: "LIGHT", activeMinutesSum: "140" }, { activityLevel: "VIGOROUS", activeMinutesSum: "25" }, { activityLevel: "MODERATE", activeMinutesSum: "12" }] },
      },
    ],
  }, null, 2);
  const found = new RegExp(GOOGLE_HEALTH_ACTIVE_MINUTES.matches[0].value).exec(answer);
  assert.equal(found?.groups?.rollup, answer, "the whole roll-up, whatever the order of its levels");
  assert.equal(activeMinutesOf({ rollup: answer }), 37, "moderate and vigorous, light left out");
  assert.equal(activeMinutesOf({ rollup: "{}" }), 0, "no data point for the day is a day of zero");
  assert.equal(activeMinutesOf({ rollup: "not json" }), undefined);
  assert.equal(activeMinutesOf({ rollup: '{"rollupDataPoints":[{"activeMinutes":{"activeMinutesRollupByActivityLevel":[{"activityLevel":"MODERATE","activeMinutesSum":"x"}]}}]}' }), undefined);
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

test("PKCE and the page the person is sent to: Google's own, one scope, a refresh key asked for", () => {
  const verifier = pkceVerifier();
  assert.match(verifier, /^[A-Za-z0-9_-]{43,128}$/);
  assert.equal(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", "the RFC 7636 example");
  const url = new URL(fitbitAuthorizeUrl({ clientId: "123-abc.apps.googleusercontent.com", redirectUri: "https://viky.cash/api/connect/fitbit/callback", challenge: "c", state: "n" }));
  assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    client_id: "123-abc.apps.googleusercontent.com",
    redirect_uri: "https://viky.cash/api/connect/fitbit/callback",
    response_type: "code",
    scope: "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
    access_type: "offline",
    prompt: "consent",
    code_challenge: "c",
    code_challenge_method: "S256",
    state: "n",
  });
  assert.ok(isFitbitUserId("a1B2c3") && !isFitbitUserId("") && !isFitbitUserId("x".repeat(64)) && !isFitbitUserId(12));
  assert.equal(fitbitConfigured({} as unknown as NodeJS.ProcessEnv), false);
  assert.equal(fitbitConfigured({ FITBIT_CLIENT_ID: "a", FITBIT_CLIENT_SECRET: "b" } as unknown as NodeJS.ProcessEnv), false, "the legacy names configure nothing");
  assert.equal(fitbitConfigured(env), true);
});

test("the keys are exchanged with the client's secret, the account asked of the API, refreshed and revoked, and a refusal is typed", async () => {
  const SCOPE = "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly";
  const calls: Array<{ url: string; init: { method: string; headers: Record<string, string>; body?: string } }> = [];
  const answer = { access_token: "at", refresh_token: "rt", expires_in: 3_599, scope: SCOPE, token_type: "Bearer" };
  const ok = async (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => {
    calls.push({ url, init });
    if (url.endsWith("/users/me/identity")) return { status: 200, json: async () => ({ name: "users/me/identity", healthUserId: "h3alth1d", legacyUserId: "ABC123" }) };
    return { status: 200, json: async () => answer };
  };
  const tokens = await exchangeFitbitCode({ code: "the-code", verifier: "the-verifier", redirectUri: "https://viky.cash/api/connect/fitbit/callback", nowSeconds: 1_000 }, ok, env);
  assert.deepEqual(tokens, { accessToken: "at", refreshToken: "rt", expiresAt: 4_599, userId: "h3alth1d", scope: SCOPE });
  assert.equal(calls[0].url, "https://oauth2.googleapis.com/token");
  const sent = new URLSearchParams(calls[0].init.body);
  assert.equal(sent.get("client_secret"), "s3cr3t");
  assert.equal(sent.get("code_verifier"), "the-verifier");
  assert.equal(sent.get("grant_type"), "authorization_code");
  assert.equal(sent.get("redirect_uri"), "https://viky.cash/api/connect/fitbit/callback");
  assert.equal(calls[1].url, "https://health.googleapis.com/v4/users/me/identity");
  assert.equal(calls[1].init.headers.authorization, "Bearer at");
  const refreshed = await refreshFitbitTokens(tokens, 2_000, async () => ({ status: 200, json: async () => ({ access_token: "at2", expires_in: 3_599, scope: SCOPE }) }), env);
  assert.deepEqual(refreshed, { accessToken: "at2", refreshToken: "rt", expiresAt: 5_599, userId: "h3alth1d", scope: SCOPE }, "Google keeps the refresh key, and the account is the one bound");
  await revokeFitbitToken("at2", ok, env);
  assert.equal(calls.at(-1)?.url, "https://oauth2.googleapis.com/revoke");
  assert.equal(new URLSearchParams(calls.at(-1)?.init.body).get("token"), "at2");
  const refused = async () => ({ status: 400, json: async () => ({ error: "invalid_grant" }) });
  await assert.rejects(exchangeFitbitCode({ code: "x", verifier: "y", redirectUri: "z", nowSeconds: 1 }, refused, env), (error: unknown) => error instanceof FitbitError && error.code === "EXCHANGE_REFUSED");
  await assert.rejects(refreshFitbitTokens(tokens, 1, refused, env), (error: unknown) => error instanceof FitbitError && error.code === "REFRESH_REFUSED");
  await assert.rejects(revokeFitbitToken("x", refused, env), (error: unknown) => error instanceof FitbitError && error.code === "REVOKE_FAILED");
  await assert.rejects(exchangeFitbitCode({ code: "x", verifier: "y", redirectUri: "z", nowSeconds: 1 }, async () => ({ status: 200, json: async () => ({}) }), env), (error: unknown) => error instanceof FitbitError && error.code === "BAD_ANSWER");
  await assert.rejects(
    exchangeFitbitCode({ code: "x", verifier: "y", redirectUri: "z", nowSeconds: 1 }, async () => ({ status: 200, json: async () => ({ ...answer, scope: "openid" }) }), env),
    (error: unknown) => error instanceof FitbitError && error.code === "SCOPE_MISSING",
    "the person unticked the activity data on Google's page",
  );
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
    delete process.env.GOOGLE_HEALTH_CLIENT_ID;
    assert.throws(() => startFitbitConnection({ giftId: "42", account: ACCOUNT, requestUrl: "https://viky.cash/x", nowSeconds: 1 }), (error: unknown) => error instanceof GiftApiError && error.code === "NOT_CONFIGURED");
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in kept)) delete process.env[key];
    Object.assign(process.env, kept);
  }
});

test("a proof of a page asked by POST is read only when its method and its body are the ones the source describes", async () => {
  const { readingOfProof, AttestedReadError } = await import("../src/attested-read");
  const day = "2026-09-22";
  const proofOf = (parameters: Record<string, unknown>) =>
    ({
      claimData: {
        parameters: JSON.stringify(parameters),
        context: JSON.stringify({ extractedParameters: { rollup: "{}" } }),
        identifier: `0x${"ab".repeat(32)}`,
        timestampS: 1_790_000_000,
      },
    }) as never;
  const right = { url: GOOGLE_HEALTH_ACTIVE_MINUTES.url(day), method: "POST", body: GOOGLE_HEALTH_ACTIVE_MINUTES.body!(day), responseMatches: GOOGLE_HEALTH_ACTIVE_MINUTES.matches.map((match) => ({ ...match })) };
  assert.equal(readingOfProof(GOOGLE_HEALTH_ACTIVE_MINUTES, day, proofOf(right)).values.rollup, "{}");
  const mismatch = (error: unknown) => error instanceof AttestedReadError && error.code === "PROOF_MISMATCH";
  assert.throws(() => readingOfProof(GOOGLE_HEALTH_ACTIVE_MINUTES, day, proofOf({ ...right, method: "GET" })), mismatch, "the method is part of what is signed");
  assert.throws(() => readingOfProof(GOOGLE_HEALTH_ACTIVE_MINUTES, day, proofOf({ ...right, body: GOOGLE_HEALTH_ACTIVE_MINUTES.body!("2026-09-21") })), mismatch, "another day's body is another question");
  assert.throws(() => readingOfProof(GOOGLE_HEALTH_ACTIVE_MINUTES, day, proofOf({ ...right, body: right.body.replace("google-wearables", "all-sources") })), mismatch, "minutes logged by hand are not asked for");
});

test("the body the reading service signs is the body the app builds, day after day", async () => {
  const { dailyRollUpBody } = await import("../src/fitbit");
  for (const day of ["2026-09-22", "2026-09-30", "2026-12-31", "2028-02-28", "2028-02-29"]) assert.equal(GOOGLE_HEALTH_ACTIVE_MINUTES.body!(day), dailyRollUpBody(day), day);
});
