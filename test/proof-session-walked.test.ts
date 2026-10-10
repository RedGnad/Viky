import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { privateKeyToAccount } from "viem/accounts";
import { POST as sessionPost } from "../app/api/proof/session/route";
import { ACCOUNT_AUTH_COOKIE_NAME, createAccountAuthChallenge, issueAccountAuthSession } from "../src/account-auth-server";
import { configureAttestedCalls, REAL_READINGS_OFF } from "../src/attested-calls";
import { DIRECTORY_PORTALS } from "../src/directory-portals";
import { configureGiftStore, ensureGiftSchema, markClaimed, saveGift } from "../src/gift-store";
import { configureMilestoneStore, ensureMilestoneSchema, saveMilestoneGift } from "../src/milestone-store";
import { configurePortalStore, ensurePortalSchema, savePortal } from "../src/portal-store";
import { configureProofSessionStore, ensureProofSessionSchema, type SqlExecutor } from "../src/proof-session-store";
import { PROVIDER_BUILDING } from "../src/university-shown";

/**
 * The session route, walked: the route itself is run, from a request signed by an account to the last thing it checks
 * before it asks Reclaim for a verification (the founder, 10 Oct 2026: what can be verified of the proof routes with
 * no student). Every other test of this route reads its text, or stops at its door (test/proof-route.test.ts); the
 * path past the gift's record had been run by a real student's press and by nothing else.
 *
 * Nothing leaves the machine. The gifts, their universities and the sessions are in a database of the test's own; the
 * accounts sign their own session cookie; and the route stops on the switch a developer's machine carries
 * (`VIKY_NO_REAL_READING`), which stands after every check and right before the call to Reclaim. So "the route
 * answered with that switch's sentence" says: every check before it passed. The network refuses any call, and the
 * test says so if one is made.
 */
const ORIGIN = "https://viky.test";
const ENV = { SESSION_SIGNING_SECRET: "test-account-session-secret-that-is-longer-than-32-bytes" };
const STUDENT = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const SOMEBODY_ELSE = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const FUNDER = "0x00000000000000000000000000000000000000f1";
const ESCROW = "0x00000000000000000000000000000000000000e5";

/** A gift made on Rome for an enrolment, one made on it for a grade, and one whose milestone row was never written. */
const ENROLMENT = "1000001";
const GRADE = "1000002";
const NO_RECORD = "1000003";

const db = new PGlite();
const exec: SqlExecutor = async (strings, ...values) => {
  const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
  return (await db.query<Record<string, unknown>>(text, values)).rows;
};

const kept: Record<string, string | undefined> = {};
const realFetch = globalThis.fetch;
let asked = 0;

before(async () => {
  for (const name of ["SESSION_SIGNING_SECRET", "VIKY_NO_REAL_READING", "RECLAIM_APP_ID", "RECLAIM_APP_SECRET", "DATABASE_URL"]) kept[name] = process.env[name];
  process.env.SESSION_SIGNING_SECRET = ENV.SESSION_SIGNING_SECRET;
  process.env.VIKY_NO_REAL_READING = "1";
  // The route refuses before this point when the application is not named; these two name nothing real.
  process.env.RECLAIM_APP_ID = "an-application-of-the-test";
  process.env.RECLAIM_APP_SECRET = "a-secret-of-the-test";
  delete process.env.DATABASE_URL;
  // Nothing is asked of anybody: a call to the network fails, and is counted.
  globalThis.fetch = (async () => {
    asked += 1;
    throw new Error("the test asked the network");
  }) as typeof fetch;

  configureGiftStore(exec);
  configureMilestoneStore(exec);
  configurePortalStore(exec);
  configureProofSessionStore(exec);
  configureAttestedCalls(exec);
  await ensureGiftSchema();
  await ensureMilestoneSchema();
  await ensurePortalSchema();
  await ensureProofSessionSchema();

  // Rome as the operator's command writes it: its enrolment provider, and no results provider.
  const rome = DIRECTORY_PORTALS.find((one) => one.portalId === "aur-it")!;
  await savePortal({ portalId: rome.portalId, name: rome.name, university: rome.university, country: rome.country, loginUrl: rome.loginUrl, provenBy: FUNDER, unverified: true, providerId: rome.providerId, providerVersion: rome.providerVersion, requestHash: rome.requestHash, extract: rome.extract });

  for (const [giftId, conditionId] of [[ENROLMENT, "university-enrollment-shown"], [GRADE, "university-grade-shown"], [NO_RECORD, null]] as const) {
    await saveGift({ giftId, funder: FUNDER, contactHash: `0x${"00".repeat(32)}`, claimToken: `a-link-key-of-gift-${giftId}`, goalType: 40, dailyTarget: 1, durationDays: 300, amount: 25_000_000n, createdTx: `0x${giftId.padStart(64, "0")}`, escrow: ESCROW });
    await markClaimed(giftId, STUDENT.address, null);
    if (conditionId) await saveMilestoneGift({ giftId, conditionId, mode: "shown", standingAtOffer: 0, standingReadAt: new Date("2026-10-10T10:00:00Z"), portal: rome.portalId, gradeScale: conditionId === "university-grade-shown" ? "4" : null });
  }
});

after(async () => {
  globalThis.fetch = realFetch;
  for (const [name, value] of Object.entries(kept)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  configureGiftStore(undefined);
  configureMilestoneStore(undefined);
  configurePortalStore(undefined);
  configureProofSessionStore(undefined);
  configureAttestedCalls(undefined);
  await db.close();
});

async function cookieFor(account: typeof STUDENT): Promise<string> {
  const challenge = createAccountAuthChallenge({ account: account.address, origin: ORIGIN, nonce: "0123456789abcdef0123456789abcdef", environment: ENV });
  const signature = await account.signMessage({ message: challenge.message });
  const session = await issueAccountAuthSession({ challenge: challenge.challenge, signature, origin: ORIGIN, environment: ENV });
  return `${ACCOUNT_AUTH_COOKIE_NAME}=${session.token}`;
}

/** What the route answers to this account's press on "Show it". */
async function press(account: typeof STUDENT, body: Record<string, unknown>): Promise<{ status: number; error: string }> {
  const response = await sessionPost(
    new Request(`${ORIGIN}/api/proof/session`, { method: "POST", headers: { origin: ORIGIN, host: "viky.test", "content-type": "application/json", cookie: await cookieFor(account) }, body: JSON.stringify(body) }),
  );
  return { status: response.status, error: String(((await response.json()) as { error?: unknown }).error ?? "") };
}

test("the gift's own student walks every check of the route, up to the call to Reclaim, which is not made", async () => {
  const answer = await press(STUDENT, { giftId: ENROLMENT, phase: "reach" });
  assert.deepEqual(answer, { status: 400, error: REAL_READINGS_OFF }, "the one refusal left is the machine's own switch: the gift, its condition, its person and its university's provider were all found");
});

test("the condition is the gift's own: what the browser names changes nothing, either way", async () => {
  // An enrolment gift, and a browser that says "a grade": the route goes by the gift, whose enrolment provider
  // stands, and reaches its last check. Had it gone by the browser, Rome's results provider, which does not exist,
  // would have been asked for.
  assert.equal((await press(STUDENT, { giftId: ENROLMENT, phase: "reach", conditionId: "university-grade-shown" })).error, REAL_READINGS_OFF);
  // A grade gift on the same university, and a browser that says "enrolled": the gift's own condition is a grade,
  // and Rome's results page is not read yet. The route says that, and opens nothing on the enrolment provider.
  assert.deepEqual(await press(STUDENT, { giftId: GRADE, phase: "reach", conditionId: "university-enrollment-shown" }), { status: 400, error: PROVIDER_BUILDING.message });
  assert.deepEqual(await press(STUDENT, { giftId: GRADE, phase: "reach" }), { status: 400, error: PROVIDER_BUILDING.message });
});

test("nobody but the person the gift is for opens a proof of it, and a gift with no record of its condition opens none", async () => {
  assert.deepEqual(await press(SOMEBODY_ELSE, { giftId: ENROLMENT, phase: "reach" }), { status: 400, error: "This gift is not yours to prove" });
  assert.deepEqual(await press(STUDENT, { giftId: NO_RECORD, phase: "reach", conditionId: "university-enrollment-shown" }), { status: 400, error: "Unknown condition" }, "the browser's word does not stand in for a record that is missing");
  assert.deepEqual(await press(STUDENT, { giftId: "1000099", phase: "reach" }), { status: 400, error: "Unknown gift" });
});

test("through all of it nothing was opened and nothing was asked of anybody", async () => {
  const sessions = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM viky_proof_sessions");
  assert.equal(sessions.rows[0].n, 0, "no session was written down");
  assert.equal(asked, 0, "the network was never asked");
});
