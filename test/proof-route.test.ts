// The routes must never trust an account from the request body or URL. These exercise the DB-free
// rejection paths: an unauthenticated caller, a caller whose signed cookie is for another origin, and
// a malformed body. All fail at the guard, before any Neon access, which is why they can run here.

import assert from "node:assert/strict";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { ACCOUNT_AUTH_COOKIE_NAME, createAccountAuthChallenge, issueAccountAuthSession } from "../src/account-auth-server";
import { POST as sessionPost } from "../app/api/proof/session/route";
import { POST as verifyPost } from "../app/api/proof/verify/route";

const ORIGIN = "https://viky.test";
const ENV = { SESSION_SIGNING_SECRET: "test-account-session-secret-that-is-longer-than-32-bytes" };
const A = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");

// The routes read process.env, so the signing secret has to live there for the cookie to verify.
process.env.SESSION_SIGNING_SECRET = ENV.SESSION_SIGNING_SECRET;
delete process.env.DATABASE_URL;

async function cookieFor(account: typeof A): Promise<string> {
  const challenge = createAccountAuthChallenge({
    account: account.address,
    origin: ORIGIN,
    nonce: "0123456789abcdef0123456789abcdef",
    environment: ENV,
  });
  const signature = await account.signMessage({ message: challenge.message });
  const session = await issueAccountAuthSession({ challenge: challenge.challenge, signature, origin: ORIGIN, environment: ENV });
  return `${ACCOUNT_AUTH_COOKIE_NAME}=${session.token}`;
}

function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { origin: ORIGIN, host: "viky.test", "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

test("POST /session without an account session is refused", async () => {
  const response = await sessionPost(post("/api/proof/session", { giftId: "1", phase: "baseline", username: "ama" }));
  assert.equal(response.status, 401);
});

test("POST /verify without an account session is refused", async () => {
  const response = await verifyPost(post("/api/proof/verify", { sessionId: "session_12345678" }));
  assert.equal(response.status, 401);
});

test("a cookie issued for another origin is refused", async () => {
  const cookie = await cookieFor(A);
  const request = new Request("https://other.test/api/proof/session", {
    method: "POST",
    headers: { origin: "https://other.test", host: "other.test", "content-type": "application/json", cookie },
    body: JSON.stringify({ giftId: "1", phase: "baseline", username: "ama" }),
  });
  const response = await sessionPost(request);
  assert.equal(response.status, 401);
});

test("an authenticated caller with a malformed gift or day is refused before any lookup", async () => {
  const cookie = await cookieFor(A);
  const badGift = await sessionPost(post("/api/proof/session", { giftId: "not-a-gift", phase: "baseline", username: "ama" }, { cookie }));
  assert.equal(badGift.status, 400);
  assert.match(((await badGift.json()) as { error: string }).error, /Unknown gift/);

  const badDay = await sessionPost(post("/api/proof/session", { giftId: "1", phase: "check-in", dayIndex: 400, username: "ama" }, { cookie }));
  assert.equal(badDay.status, 400);
  assert.match(((await badDay.json()) as { error: string }).error, /valid day/);

  const noName = await sessionPost(post("/api/proof/session", { giftId: "1", phase: "baseline", username: "" }, { cookie }));
  assert.equal(noName.status, 400);
  assert.match(((await noName.json()) as { error: string }).error, /Duolingo username/);
});

test("verify fails closed with a typed code when the gift contract is not configured", async () => {
  delete process.env.GIFT_ESCROW_ADDRESS;
  const cookie = await cookieFor(A);
  const response = await verifyPost(post("/api/proof/verify", { sessionId: "session_12345678" }, { cookie }));
  assert.equal(response.status, 503);
  assert.equal(((await response.json()) as { code: string }).code, "NOT_CONFIGURED");
});

test("a cross-site request is refused by the API guard", async () => {
  const cookie = await cookieFor(A);
  const response = await sessionPost(post("/api/proof/session", { giftId: "1" }, { cookie, origin: "https://attacker.test" }));
  assert.equal(response.status, 400);
  assert.match(((await response.json()) as { error: string }).error, /Cross-origin/);
});
