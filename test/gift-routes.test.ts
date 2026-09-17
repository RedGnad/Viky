// The gift routes must never trust an account from the body, and must refuse a malformed request before
// touching the relayer or the database. Every case here fails at a guard, which is why it runs without
// network or Neon.

import assert from "node:assert/strict";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { ACCOUNT_AUTH_COOKIE_NAME, createAccountAuthChallenge, issueAccountAuthSession } from "../src/account-auth-server";
import { POST as createPost } from "../app/api/gift/create/route";
import { POST as claimPost } from "../app/api/gift/claim/route";
import { POST as checkInPost } from "../app/api/gift/check-in/route";
import { POST as withdrawPost } from "../app/api/gift/withdraw/route";
import { GET as giftGet } from "../app/api/gift/[id]/route";
import { POST as quotePost } from "../app/api/dev/kuru-quote/route";
import { POST as topUpPost } from "../app/api/dev/gas-top-up/route";
import { POST as challengePost } from "../app/api/account/challenge/route";
import { POST as sessionPost, GET as sessionGet, DELETE as sessionDelete } from "../app/api/account/session/route";

const ORIGIN = "https://viky.test";
const ENV = { SESSION_SIGNING_SECRET: "test-account-session-secret-that-is-longer-than-32-bytes" };
const A = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");

process.env.SESSION_SIGNING_SECRET = ENV.SESSION_SIGNING_SECRET;
delete process.env.DATABASE_URL;
delete process.env.RELAYER_PRIVATE_KEY;
delete process.env.VIKY_DEV_PAGES;

async function cookieFor(account: typeof A): Promise<string> {
  const challenge = createAccountAuthChallenge({ account: account.address, origin: ORIGIN, nonce: "0123456789abcdef0123456789abcdef", environment: ENV });
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

async function json(response: Response): Promise<{ error?: string; code?: string; account?: string }> {
  return (await response.json()) as { error?: string; code?: string; account?: string };
}

test("the account sign-in flow issues a cookie bound to the signer", async () => {
  const challenge = await challengePost(post("/api/account/challenge", { account: A.address }));
  assert.equal(challenge.status, 200);
  const { challenge: token, message } = (await challenge.json()) as { challenge: string; message: string };
  const signature = await A.signMessage({ message });
  const session = await sessionPost(post("/api/account/session", { challenge: token, signature }));
  assert.equal(session.status, 200);
  const cookie = session.headers.get("set-cookie") ?? "";
  assert.match(cookie, new RegExp(`^${ACCOUNT_AUTH_COOKIE_NAME}=`));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.equal((await json(session)).account, A.address);

  const who = await sessionGet(new Request(`${ORIGIN}/api/account/session`, { headers: { cookie: cookie.split(";")[0] } }));
  assert.equal((await json(who)).account, A.address);
  const anonymous = await sessionGet(new Request(`${ORIGIN}/api/account/session`));
  assert.equal(anonymous.status, 401);
  const out = await sessionDelete();
  assert.match(out.headers.get("set-cookie") ?? "", /Max-Age=0/);

  const wrong = await sessionPost(post("/api/account/session", { challenge: token, signature: `0x${"11".repeat(65)}` }));
  assert.equal(wrong.status, 401);
});

test("every gift route refuses an unauthenticated caller", async () => {
  assert.equal((await createPost(post("/api/gift/create", {}))).status, 401);
  assert.equal((await claimPost(post("/api/gift/claim", { giftId: "1", token: "x" }))).status, 401);
  assert.equal((await checkInPost(post("/api/gift/check-in", { sessionId: "session_1234" }))).status, 401);
  assert.equal((await withdrawPost(post("/api/gift/withdraw", { giftId: "1" }))).status, 401);
  assert.equal((await quotePost(post("/api/dev/kuru-quote", {}))).status, 404, "dev routes do not exist unless enabled");
  assert.equal((await topUpPost(post("/api/dev/gas-top-up", {}))).status, 404);
});

test("create refuses malformed terms with a typed code before any relay", async () => {
  const cookie = await cookieFor(A);
  const cases: Array<[unknown, string]> = [
    [{ contact: "ama@example.com", goalType: 0, dailyTarget: 10, durationDays: 7, amount: "5000000" }, "GOAL_NOT_OFFERED"],
    [{ contact: "ama@example.com", goalType: 1, dailyTarget: 0, durationDays: 7, amount: "5000000" }, "INVALID_TARGET"],
    [{ contact: "ama@example.com", goalType: 1, dailyTarget: 10, durationDays: 6, amount: "5000000" }, "INVALID_DURATION"],
    [{ goalType: 1, dailyTarget: 10, durationDays: 91, amount: "5000000" }, "INVALID_DURATION"],
    [{ contact: "ama@example.com", goalType: 1, dailyTarget: 10, durationDays: 7, amount: "999999" }, "INVALID_AMOUNT"],
    [{ contact: "ama@example.com", goalType: 1, dailyTarget: 10, durationDays: 7, amount: "5000000", salt: "nope" }, "INVALID_SALT"],
    [
      { contact: "ama@example.com", goalType: 1, dailyTarget: 10, durationDays: 7, amount: "5000000", salt: `0x${"01".repeat(32)}`, authorization: { nonce: `0x${"02".repeat(32)}`, r: `0x${"03".repeat(32)}`, s: `0x${"04".repeat(32)}`, v: 27 } },
      "TERMS_MISMATCH",
    ],
    // No contact at all is what the funder's page sends since D72, so it goes on to the terms, never to INVALID_CONTACT.
    [
      { goalType: 1, dailyTarget: 10, durationDays: 7, amount: "5000000", salt: `0x${"01".repeat(32)}`, authorization: { nonce: `0x${"02".repeat(32)}`, r: `0x${"03".repeat(32)}`, s: `0x${"04".repeat(32)}`, v: 27 } },
      "TERMS_MISMATCH",
    ],
  ];
  for (const [body, code] of cases) {
    const response = await createPost(post("/api/gift/create", body, { cookie }));
    assert.equal(response.status, 400, code);
    assert.equal((await json(response)).code, code);
  }
  // The two names are words for people and are checked before any relay, by name (17 Sep 2026).
  for (const [names, which] of [
    [{ recipientName: "a".repeat(41) }, /their first name in 40 characters/],
    [{ funderName: "<script>" }, /your name with letters/],
  ] as const) {
    const refused = await createPost(post("/api/gift/create", { ...names, goalType: 1, dailyTarget: 10, durationDays: 7, amount: "5000000" }, { cookie }));
    assert.equal(refused.status, 400);
    const body = await json(refused);
    assert.equal(body.code, "INVALID_NAME");
    assert.match(String(body.error), which);
  }

  const badContact = await createPost(post("/api/gift/create", { contact: "not-a-contact", goalType: 1, dailyTarget: 10, durationDays: 7, amount: "5000000", salt: `0x${"01".repeat(32)}`, authorization: { nonce: `0x${"02".repeat(32)}`, r: `0x${"03".repeat(32)}`, s: `0x${"04".repeat(32)}`, v: 27 } }, { cookie }));
  assert.equal(badContact.status, 400);
  // A contact is asked for nowhere since D72, and none is sent; one that arrives malformed is still refused by name.
  assert.match(String((await json(badContact)).code), /CONTACT/);
});

test("a gift counted on one course is refused before any relay when the course is not one to count (U1)", async () => {
  const cookie = await cookieFor(A);
  const { fundingNonce } = await import("../src/gift-attestation");
  const { GOAL_TYPE_DUOLINGO_COURSE_XP } = await import("../src/gift-terms");
  const { NO_CONTACT_HASH } = await import("../src/contact-hash");
  const { receiveAuthorizationMessage, receiveAuthorizationTypedData, toContractAuthorization } = await import("../src/ausd-authorization");
  const { getAddress } = await import("viem");

  const base = { goalType: GOAL_TYPE_DUOLINGO_COURSE_XP, dailyTarget: 10, durationDays: 7, amount: "5000000", salt: `0x${"01".repeat(32)}` } as const;
  // Signed over exactly these terms, so what is met is the course's refusal and never the signature's.
  const params = {
    funder: getAddress(A.address),
    refundTo: getAddress(A.address),
    recipientContactHash: NO_CONTACT_HASH,
    goalType: base.goalType,
    dailyTarget: base.dailyTarget,
    durationDays: base.durationDays,
    amount: BigInt(base.amount),
    salt: base.salt as `0x${string}`,
  };
  const escrow = getAddress(`0x${"cc".repeat(20)}`);
  process.env.NEXT_PUBLIC_GIFT_ESCROW_ADDRESS = escrow;
  const message = receiveAuthorizationMessage({ funder: params.funder, escrow, amount: params.amount, nonce: fundingNonce(params) });
  const signature = await A.signTypedData(receiveAuthorizationTypedData(message));
  const a = toContractAuthorization(message, signature);
  const authorization = { validAfter: a.validAfter.toString(), validBefore: a.validBefore.toString(), nonce: a.nonce, v: a.v, r: a.r, s: a.s };

  // A course of the wrong shape, and a course with nobody to read it on, are refused before anything is read.
  const shape = await createPost(post("/api/gift/create", { ...base, course: "not a course", duolingoUsername: "ama_learns", authorization }, { cookie }));
  assert.equal((await json(shape)).code, "INVALID_COURSE");
  const nameless = await createPost(post("/api/gift/create", { ...base, course: "DUOLINGO_ES_EN", authorization }, { cookie }));
  assert.equal((await json(nameless)).code, "INVALID_COURSE");
  // The goal type and the course must say the same thing: a course on the total's goal is refused as terms that differ.
  const wrongGoal = await createPost(post("/api/gift/create", { ...base, goalType: 1, course: "DUOLINGO_ES_EN", duolingoUsername: "ama_learns", authorization }, { cookie }));
  assert.equal((await json(wrongGoal)).code, "TERMS_MISMATCH");

  // And a course the profile does not carry, read again just before the money would move.
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ users: [{ id: 477033640, username: "ama_learns", courses: [{ id: "DUOLINGO_IT_EN", title: "Italian", xp: 40 }], currentCourseId: "DUOLINGO_IT_EN" }] }),
      { status: 200 },
    )) as typeof fetch;
  try {
    const gone = await createPost(post("/api/gift/create", { ...base, course: "DUOLINGO_ES_EN", duolingoUsername: "ama_learns", authorization }, { cookie }));
    const body = await json(gone);
    assert.equal(gone.status, 409);
    assert.equal(body.code, "NO_SUCH_COURSE");
    assert.match(String(body.error), /Nothing was taken/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("claim, check-in, withdraw and status refuse malformed identifiers with typed codes", async () => {
  const cookie = await cookieFor(A);
  const claim = await claimPost(post("/api/gift/claim", { giftId: "x", token: "short" }, { cookie }));
  assert.equal(claim.status, 404);
  assert.equal((await json(claim)).code, "CLAIM_LINK_INVALID");

  const checkIn = await checkInPost(post("/api/gift/check-in", { sessionId: "!" }, { cookie }));
  assert.equal(checkIn.status, 404);
  assert.equal((await json(checkIn)).code, "UNKNOWN_SESSION");

  const withdraw = await withdrawPost(post("/api/gift/withdraw", { giftId: "1", to: "nope" }, { cookie }));
  assert.equal(withdraw.status, 400);
  assert.equal((await json(withdraw)).code, "INVALID_DESTINATION");

  const status = await giftGet(new Request(`${ORIGIN}/api/gift/abc`), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(status.status, 404);
  assert.equal((await json(status)).code, "UNKNOWN_GIFT");
});

test("a route that needs the relayer fails closed with a typed code when it is not configured", async () => {
  const cookie = await cookieFor(A);
  delete process.env.GIFT_ESCROW_ADDRESS;
  const response = await withdrawPost(
    // A well shaped signature: the route now reshapes and checks the shape before it looks at anything else,
    // so 65 bytes of the same digit no longer reaches the configuration check (D51).
    post("/api/gift/withdraw", { giftId: "1", to: A.address, amount: "1", nonce: "0", deadline: "1", signature: `0x${"11".repeat(64)}1b` }, { cookie }),
  );
  assert.equal(response.status, 503);
  assert.equal((await json(response)).code, "NOT_CONFIGURED");
});
