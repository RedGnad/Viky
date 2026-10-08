// The routes must never trust an account from the request body or URL. These exercise the DB-free
// rejection paths: an unauthenticated caller, a caller whose signed cookie is for another origin, and
// a malformed body. All fail at the guard, before any Neon access, which is why they can run here.

import assert from "node:assert/strict";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { ACCOUNT_AUTH_COOKIE_NAME, createAccountAuthChallenge, issueAccountAuthSession } from "../src/account-auth-server";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { GET as sessionOpen, POST as sessionPost } from "../app/api/proof/session/route";
import { configureProofSessionStore, consumeAndSaveVerification, ensureProofSessionSchema, saveProofSession, type SqlExecutor } from "../src/proof-session-store";
import { channelFor } from "../src/reclaim-channel";
import { isAgentVersion } from "../src/witness-portal";
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

test("GET /session answers the session this account has open for the gift, and nobody else's", async () => {
  const db = new PGlite();
  const executor: SqlExecutor = async (strings, ...values) => (await db.query<Record<string, unknown>>(strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, ""), values)).rows;
  configureProofSessionStore(executor);
  try {
    await ensureProofSessionSchema();
    const B = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
    const get = (giftId: string, cookie?: string) => sessionOpen(new Request(`${ORIGIN}/api/proof/session?giftId=${giftId}`, { headers: { host: "viky.test", ...(cookie ? { cookie } : {}) } }));
    assert.equal((await get("1000006")).status, 401, "no account, no answer");

    const mine = await cookieFor(A);
    assert.deepEqual(await (await get("1000006", mine)).json(), { open: null });
    const requestUrl = "https://share.reclaimprotocol.org/verify/?template=toulouse";
    await saveProofSession({ sessionId: "session_toulouse", account: A.address, giftId: "1000006", conditionId: "university-enrollment-shown", goalType: 13, phase: "reach", dayIndex: 0, requestUrl });
    const answer = await get("1000006", mine);
    assert.equal(answer.headers.get("cache-control"), "no-store");
    const { open } = (await answer.json()) as { open: { sessionId: string; requestUrl: string; conditionId: string; secondsLeft: number } };
    assert.equal(open.sessionId, "session_toulouse");
    assert.equal(open.requestUrl, requestUrl);
    assert.ok(open.secondsLeft > 29 * 60 && open.secondsLeft <= 30 * 60, String(open.secondsLeft));
    // Another gift, another account, or a gift that is no number: nothing, and no error that says more.
    assert.deepEqual(await (await get("1000007", mine)).json(), { open: null });
    assert.deepEqual(await (await get("1000006", await cookieFor(B))).json(), { open: null });
    assert.deepEqual(await (await get("x", mine)).json(), { open: null });
    // Answered: nothing is open any more.
    await consumeAndSaveVerification({ sessionId: "session_toulouse", evidence: { held: "utoulouse-fr" }, attestation: { message: {}, signature: "0x" }, proofs: null });
    assert.deepEqual(await (await get("1000006", mine)).json(), { open: null });
  } finally {
    configureProofSessionStore(undefined);
    await db.close();
  }
});

test("the verification page is told where to bring the person back, and the row keeps its address", () => {
  // Reclaim's own redirect was empty (7 Oct 2026): the person stayed on its page with a proof made.
  const source = readFileSync("app/api/proof/session/route.ts", "utf8");
  assert.match(source, /proofRequest\.setRedirectUrl\(`\$\{accountAuthOriginFromRequest\(request\)\}\/g\/\$\{giftId\}`\)/, "this request's own site and the gift's number, nothing else");
  assert.ok(source.indexOf("setRedirectUrl(") < source.indexOf("getRequestUrl("), "set before the page's address is made, or the address does not carry it");
  assert.match(source, /await saveProofSession\(\{[\s\S]*?requestUrl,\s*\}\)/);
  assert.match(source, /secondsLeft: PROOF_SESSION_TTL_SECONDS/);
});

test("a university's session runs on the portal channel whatever the setting says, and on the version its provider is set to", () => {
  // In app mode Reclaim's agent did nothing for the first university (7 Oct 2026); in portal mode the proof was made.
  assert.equal(channelFor({ witness: true }, "app"), "portal");
  assert.equal(channelFor({ witness: true }, "nonsense"), "portal", "a university does not wait on a setting written wrong");
  assert.equal(channelFor({ witness: false }, "app"), "app");
  assert.equal(channelFor({ witness: false }, ""), "portal");
  assert.equal(channelFor({ witness: false }, undefined), "portal", "production's own, when nothing is set");
  const source = readFileSync("app/api/proof/session/route.ts", "utf8");
  assert.match(source, /const channel = channelFor\(\{ witness: Boolean\(witness\) \}\);/);
  // Before a pin: no version, so Reclaim's agent writes one, unless the operator set the one to run on.
  assert.match(source, /\.\.\.\(witness && !witness\.pin && !providerVersion \? \{\} : \{ providerVersion \}\),/);
  assert.match(readFileSync(".env.example", "utf8"), /Production stays on portal/);
  // Reclaim's agent is asked for where it has the rule to write or wrote it, and nowhere else: a university pinned on a
  // version written by hand runs that fixed rule (8 Oct 2026).
  assert.match(source, /acceptAiProviders: Boolean\(witness\) && !\(witness\?\.pin && !isAgentVersion\(providerVersion\)\),/);
  assert.equal(isAgentVersion("1.0.0-ai.3"), true);
  assert.equal(isAgentVersion("1.0.1"), false);
});

test("the operator pins a university ahead of the pass from Reclaim's published configuration, checked on a real pin first", () => {
  const script = readFileSync("scripts/portal-pin.ts", "utf8");
  // Only a version that runs a fixed rule, with one request.
  assert.match(script, /if \(published\.verificationType !== "WITNESS"\) throw new Error\(/);
  assert.match(script, /if \(published\.requests !== 1\) throw new Error\(/);
  // The pattern is tried on the value a proof will carry before anything is written.
  assert.match(script, /if \(!enrolledBy\(extract, \{ \[extract\.field\]: sample \}\)\) throw new Error\(/);
  // The working-out is checked on the pin a real proof gave, and nothing is written when it does not give it back.
  assert.match(script, /if \(!sameRule\(again, provider\.pin\)\) throw new Error\(/);
  assert.ok(script.indexOf("if (!sameRule(again, provider.pin))") < script.indexOf("pinProvider(portalId, sense, { pin, extract, operator, providerId })"));
  // Refused while a proof is held, and a proof held under a pin made ahead is pinned from, not settled on it.
  assert.match(script, /if \(provider\.pin && provider\.extract && !provider\.pin\.ahead\) \{/);
  // The route takes the mark off when the first proof fits.
  assert.match(readFileSync("app/api/proof/verify/route.ts", "utf8"), /\n        confirmPin,\n/);
});
