import assert from "node:assert/strict";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import {
  ACCOUNT_AUTH_CHALLENGE_TTL_MS,
  ACCOUNT_AUTH_COOKIE_NAME,
  ACCOUNT_AUTH_SESSION_TTL_MS,
  AccountAuthError,
  createAccountAuthChallenge,
  issueAccountAuthSession,
  normalizedAccount,
  readAccountAuthSession,
  requireAccountAuthSession,
  verifyAccountAuthChallenge,
  verifyAccountAuthSessionToken,
} from "../src/account-auth-server";

const NOW = 1_800_000_000_000;
const ORIGIN = "https://viky.test";
const NONCE = "0123456789abcdef0123456789abcdef";
const ACCOUNT = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const OTHER = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const ENVIRONMENT: Record<string, string | undefined> = {
  SESSION_SIGNING_SECRET: "test-account-session-secret-that-is-longer-than-32-bytes",
};

function challenge(environment: Record<string, string | undefined> = ENVIRONMENT) {
  return createAccountAuthChallenge({
    account: ACCOUNT.address,
    origin: ORIGIN,
    nowMs: NOW,
    nonce: NONCE,
    environment,
  });
}

async function signedSession(environment = ENVIRONMENT) {
  const value = challenge(environment);
  const signature = await ACCOUNT.signMessage({ message: value.message });
  return issueAccountAuthSession({
    challenge: value.challenge,
    signature,
    origin: ORIGIN,
    nowMs: NOW + 1_000,
    environment,
  });
}

function expectAuthStatus(callback: () => unknown, status: AccountAuthError["status"]) {
  assert.throws(callback, (error: unknown) => error instanceof AccountAuthError && error.status === status);
}

test("challenge message explicitly binds domain, origin, account, chain, nonce, and expiration", () => {
  const value = challenge();
  assert.equal(value.account, ACCOUNT.address);
  assert.equal(value.expiresAt, new Date(NOW + ACCOUNT_AUTH_CHALLENGE_TTL_MS).toISOString());
  assert.match(value.message, /Domain: viky\.test/);
  assert.match(value.message, /Origin: https:\/\/viky\.test/);
  assert.match(value.message, new RegExp(`Account: ${ACCOUNT.address}`));
  assert.match(value.message, /Chain ID: 143/);
  assert.match(value.message, new RegExp(`Nonce: ${NONCE}`));
  assert.match(value.message, new RegExp(`Expiration Time: ${new Date(NOW + ACCOUNT_AUTH_CHALLENGE_TTL_MS).toISOString()}`));
});

test("authentication is unavailable without a long enough signing secret", () => {
  expectAuthStatus(() => challenge({ SESSION_SIGNING_SECRET: "short" }), 503);
  expectAuthStatus(() => challenge({}), 503);
});

test("challenge HMAC rejects payload tampering", () => {
  const value = challenge();
  const [encoded, signature] = value.challenge.split(".");
  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  payload.account = OTHER.address;
  const tampered = `${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${signature}`;
  expectAuthStatus(() => verifyAccountAuthChallenge({
    challenge: tampered,
    origin: ORIGIN,
    nowMs: NOW + 1_000,
    environment: ENVIRONMENT,
  }), 401);
});

test("challenge expires after five minutes", () => {
  const value = challenge();
  expectAuthStatus(() => verifyAccountAuthChallenge({
    challenge: value.challenge,
    origin: ORIGIN,
    nowMs: NOW + ACCOUNT_AUTH_CHALLENGE_TTL_MS,
    environment: ENVIRONMENT,
  }), 401);
});

test("challenge refuses a signature from another account", async () => {
  const value = challenge();
  const wrongSignature = await OTHER.signMessage({ message: value.message });
  await assert.rejects(
    issueAccountAuthSession({
      challenge: value.challenge,
      signature: wrongSignature,
      origin: ORIGIN,
      nowMs: NOW + 1_000,
      environment: ENVIRONMENT,
    }),
    (error: unknown) => error instanceof AccountAuthError && error.status === 401,
  );
});

test("any valid account is accepted: there is no allowlist", () => {
  assert.equal(normalizedAccount(OTHER.address.toLowerCase()), OTHER.address);
  expectAuthStatus(() => normalizedAccount("not-an-account"), 400);
});

test("signed session is bound to account and origin for twelve hours", async () => {
  const session = await signedSession();
  assert.equal(session.account, ACCOUNT.address);
  assert.equal(session.expiresAt, new Date(NOW + 1_000 + ACCOUNT_AUTH_SESSION_TTL_MS).toISOString());

  const verified = verifyAccountAuthSessionToken({
    token: session.token,
    account: ACCOUNT.address,
    origin: ORIGIN,
    nowMs: NOW + ACCOUNT_AUTH_SESSION_TTL_MS,
    environment: ENVIRONMENT,
  });
  assert.equal(verified.account, ACCOUNT.address);
  expectAuthStatus(() => verifyAccountAuthSessionToken({
    token: session.token,
    account: OTHER.address,
    origin: ORIGIN,
    nowMs: NOW + 2_000,
    environment: ENVIRONMENT,
  }), 401);
  expectAuthStatus(() => verifyAccountAuthSessionToken({
    token: session.token,
    account: ACCOUNT.address,
    origin: "https://other.test",
    nowMs: NOW + 2_000,
    environment: ENVIRONMENT,
  }), 401);
  expectAuthStatus(() => verifyAccountAuthSessionToken({
    token: session.token,
    account: ACCOUNT.address,
    origin: ORIGIN,
    nowMs: NOW + 1_000 + ACCOUNT_AUTH_SESSION_TTL_MS,
    environment: ENVIRONMENT,
  }), 401);
});

test("session HMAC rejects tampering and cookie auth rejects the wrong account", async () => {
  const session = await signedSession();
  const [encoded, signature] = session.token.split(".");
  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  payload.expiresAtMs += ACCOUNT_AUTH_SESSION_TTL_MS;
  const tampered = `${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${signature}`;
  expectAuthStatus(() => verifyAccountAuthSessionToken({
    token: tampered,
    account: ACCOUNT.address,
    origin: ORIGIN,
    nowMs: NOW + 2_000,
    environment: ENVIRONMENT,
  }), 401);

  const request = new Request(`${ORIGIN}/api/duolingo/session`, {
    headers: { cookie: `${ACCOUNT_AUTH_COOKIE_NAME}=${session.token}` },
  });
  assert.equal(requireAccountAuthSession(request, ACCOUNT.address, ENVIRONMENT, NOW + 2_000).account, ACCOUNT.address);
  expectAuthStatus(() => requireAccountAuthSession(request, OTHER.address, ENVIRONMENT, NOW + 2_000), 401);
});

test("the cookie alone names the account, so a route never takes it from the body", async () => {
  const session = await signedSession();
  const request = new Request(`${ORIGIN}/api/duolingo/session`, {
    headers: { cookie: `${ACCOUNT_AUTH_COOKIE_NAME}=${session.token}` },
  });
  assert.equal(readAccountAuthSession(request, ENVIRONMENT, NOW + 2_000).account, ACCOUNT.address);
  const foreign = new Request("https://other.test/api/duolingo/session", {
    headers: { cookie: `${ACCOUNT_AUTH_COOKIE_NAME}=${session.token}` },
  });
  expectAuthStatus(() => readAccountAuthSession(foreign, ENVIRONMENT, NOW + 2_000), 401);
  expectAuthStatus(() => readAccountAuthSession(new Request(`${ORIGIN}/api/x`), ENVIRONMENT, NOW), 401);
});
