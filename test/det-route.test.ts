import assert from "node:assert/strict";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { POST as readCertificate } from "../app/api/det/certificate/route";
import { ACCOUNT_AUTH_COOKIE_NAME, createAccountAuthChallenge, issueAccountAuthSession } from "../src/account-auth-server";
import { DET_MILESTONE } from "../src/milestone-conditions";

/**
 * The route a screen asks before anything is signed or relayed. It must refuse a stranger, refuse anything that is
 * not one of their links before it fetches at all, and never become a way to read other people's results.
 */

const ORIGIN = "https://viky.test";
const ENV = { SESSION_SIGNING_SECRET: "test-account-session-secret-that-is-longer-than-32-bytes" };
const SOMEBODY = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");

process.env.SESSION_SIGNING_SECRET = ENV.SESSION_SIGNING_SECRET;

async function cookie(): Promise<string> {
  const challenge = createAccountAuthChallenge({ account: SOMEBODY.address, origin: ORIGIN, nonce: "0123456789abcdef0123456789abcdef", environment: ENV });
  const signature = await SOMEBODY.signMessage({ message: challenge.message });
  const session = await issueAccountAuthSession({ challenge: challenge.challenge, signature, origin: ORIGIN, environment: ENV });
  return `${ACCOUNT_AUTH_COOKIE_NAME}=${session.token}`;
}

function ask(body: unknown, withCookie?: string): Request {
  const headers: Record<string, string> = { origin: ORIGIN, host: "viky.test", "content-type": "application/json" };
  if (withCookie) headers.cookie = withCookie;
  return new Request(`${ORIGIN}/api/det/certificate`, { method: "POST", headers, body: JSON.stringify(body) });
}

test("a stranger is refused before anything is read", async () => {
  const answer = await readCertificate(ask({ link: "https://certs.duolingo.com/abcd1234efgh5678" }));
  assert.equal(answer.status, 401);
  assert.equal(((await answer.json()) as { error: string }).error, "SIGN_IN_REQUIRED");
});

test("anything that is not one of their links is refused without a fetch", async () => {
  const signedIn = await cookie();
  for (const link of ["", "https://example.test/abc", "certs.duolingo.com/", "../../etc/passwd", 42, null, "x".repeat(600)]) {
    const answer = await readCertificate(ask({ link }, signedIn));
    assert.equal(answer.status, 400, JSON.stringify(link));
    assert.equal(((await answer.json()) as { code?: string }).code ?? "INVALID_JSON", "INVALID_LINK", JSON.stringify(link));
  }
});

test("the register names this route, and it is the one that exists", () => {
  assert.equal(DET_MILESTONE.readPath, "/api/det/certificate");
  assert.ok(DET_MILESTONE.validLink("https://certs.duolingo.com/abcd1234efgh5678"));
  assert.ok(!DET_MILESTONE.validLink("https://example.test/nope"));
});
