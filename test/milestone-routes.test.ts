// The milestone routes (C2) must refuse, before touching Chess.com, the relayer or the database, anything they would
// refuse later: no account, a condition nobody is offered, terms that are not a climb, a signature over other terms.

import assert from "node:assert/strict";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { ACCOUNT_AUTH_COOKIE_NAME, createAccountAuthChallenge, issueAccountAuthSession } from "../src/account-auth-server";
import { POST as createPost } from "../app/api/gift/milestone/create/route";
import { GET as standingGet } from "../app/api/chess/standing/route";
import { GET as conditionsGet } from "../app/api/conditions/route";
import { CHESS_RATING } from "../src/conditions";
import { giftSalt } from "../src/gift-terms";
import { PGlite } from "@electric-sql/pglite";
import { configureGiftStore, ensureGiftSchema } from "../src/gift-store";
import { configureMilestoneStore, ensureMilestoneSchema } from "../src/milestone-store";
import type { SqlExecutor } from "../src/proof-session-store";

const ORIGIN = "https://viky.test";
const ENV = { SESSION_SIGNING_SECRET: "test-account-session-secret-that-is-longer-than-32-bytes" };
const FUNDER = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const OPERATOR = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");

process.env.SESSION_SIGNING_SECRET = ENV.SESSION_SIGNING_SECRET;
process.env.VIKY_OPERATOR_ACCOUNTS = OPERATOR.address;
delete process.env.DATABASE_URL;
delete process.env.RELAYER_PRIVATE_KEY;

async function cookieFor(account: typeof FUNDER): Promise<string> {
  const challenge = createAccountAuthChallenge({ account: account.address, origin: ORIGIN, nonce: "0123456789abcdef0123456789abcdef", environment: ENV });
  const signature = await account.signMessage({ message: challenge.message });
  const session = await issueAccountAuthSession({ challenge: challenge.challenge, signature, origin: ORIGIN, environment: ENV });
  return `${ACCOUNT_AUTH_COOKIE_NAME}=${session.token}`;
}

function post(body: unknown, cookie?: string): Request {
  return new Request(`${ORIGIN}/api/gift/milestone/create`, {
    method: "POST",
    headers: { origin: ORIGIN, host: "viky.test", "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

/** The random half of the salt; the rest of it is the Chess.com account, and the route rebuilds it (D102). */
const SALT_SEED = `0x${"0a".repeat(32)}` as const;

const TERMS = {
  conditionId: "chess-rating",
  username: "erik",
  cadence: "rapid",
  target: 1954,
  standing: 1904,
  standingReadAt: new Date(Date.now() - 60_000).toISOString(),
  durationDays: 30,
  amount: "25000000",
  salt: giftSalt({ account: "erik", seed: SALT_SEED }),
  saltSeed: SALT_SEED,
  authorization: { nonce: `0x${"02".repeat(32)}`, r: `0x${"03".repeat(32)}`, s: `0x${"04".repeat(32)}`, v: 27 },
};

test("making a milestone gift needs an account", async () => {
  assert.equal((await createPost(post(TERMS))).status, 401);
});

test("a condition that is not live is offered to nobody but an account that runs Viky", async () => {
  // Anything this route does not serve is refused by name before it reads anything, whoever asks: it serves climbs,
  // and the supervised result is a certificate with a route and a door of its own (test/det-route.test.ts).
  // What has no test left here is the operator half of this route's own door, because the only climb it knows is live
  // since 19 Sep 2026 (D109). It comes back the day Lichess is added, which is a climb and will start not live.
  const closed = { ...TERMS, conditionId: "duolingo-english-test" };
  for (const who of [FUNDER, OPERATOR]) {
    const answer = await createPost(post(closed, await cookieFor(who)));
    assert.equal(answer.status, 400);
    assert.equal(((await answer.json()) as { code: string }).code, "GOAL_NOT_OFFERED");
  }

  // And Chess.com, live since 19 Sep 2026 (D109), is past that door for everybody: the same terms a funder signs are
  // now refused on the terms themselves rather than on who is asking.
  const onLive = await createPost(post(TERMS, await cookieFor(FUNDER)));
  assert.equal(((await onLive.json()) as { code: string }).code, "TERMS_MISMATCH");

  const listed = (await (await conditionsGet(new Request(`${ORIGIN}/api/conditions`, { headers: { cookie: await cookieFor(FUNDER) } }))).json()) as { ids: string[]; preview: string[] };
  assert.deepEqual(listed.preview, [], "a funder sees only what is live");
  assert.ok(listed.ids.includes("chess-rating"));
  const operatorSees = (await (await conditionsGet(new Request(`${ORIGIN}/api/conditions`, { headers: { cookie: await cookieFor(OPERATOR) } }))).json()) as { ids: string[]; preview: string[] };
  // Ten things are wired and not live today (D164, D165, D174, D176, D178): the TOEFL score shown, the five examination
  // results, a Udemy course finished, and the three lines of the university rail, creatable by an operator so the first real proof can be
  // shown at all, and offered to nobody else, door or no door.
  assert.deepEqual(operatorSees.preview, [
    "toefl-mybest-shown",
    "cambridge-english-shown",
    "ielts-shown",
    "bac-morocco-shown",
    "bac-cameroon-shown",
    "bac-france-shown",
    "udemy-course-shown",
    "university-enrollment-shown",
    "university-year-passed-shown",
    "university-grade-shown",
  ]);
  const anonymous = (await (await conditionsGet(new Request(`${ORIGIN}/api/conditions`))).json()) as { preview: string[] };
  assert.deepEqual(anonymous.preview, []);
});

test("terms that are not a climb, or not the terms signed, are refused by name before anything is read or sent", async () => {
  const cookie = await cookieFor(OPERATOR);
  const cases: Array<[Record<string, unknown>, string]> = [
    [{ cadence: "chess960" }, "INVALID_MODE"],
    [{ username: "a b" }, "INVALID_USERNAME"],
    [{ target: 1953 }, "INVALID_TARGET"],
    [{ target: 1904 }, "INVALID_TARGET"],
    [{ durationDays: 0 }, "INVALID_DURATION"],
    [{ durationDays: 366 }, "INVALID_DURATION"],
    [{ amount: "999999" }, "INVALID_AMOUNT"],
    [{ standingReadAt: "yesterday-ish" }, "INVALID_READING"],
    [{ salt: "nope" }, "INVALID_SALT"],
    [{ recipientName: "a".repeat(41) }, "INVALID_NAME"],
    [{}, "TERMS_MISMATCH"],
  ];
  for (const [change, code] of cases) {
    const response = await createPost(post({ ...TERMS, ...change }, cookie));
    const body = (await response.json()) as { code: string; error: string };
    assert.equal(body.code, code, JSON.stringify(change));
    assert.equal(response.status, 400);
  }
  // The smallest climb is the register's, said in the funder's own numbers.
  const small = await createPost(post({ ...TERMS, target: 1953 }, cookie));
  assert.match(((await small.json()) as { error: string }).error, /They are at 1904 today\. Choose 1954 or more/);
});

test("the standing route refuses a cadence it does not know before reading anything", async () => {
  const response = await standingGet(new Request(`${ORIGIN}/api/chess/standing?username=erik&mode=chess960`));
  assert.equal(response.status, 400);
  assert.equal(((await response.json()) as { code: string }).code, "INVALID_MODE");
});

/** Chess.com's two pages for erik, as the plain read before any relay gets them, with the rapid RD given. */
function chessPages(rapid: { rating: number; date: number; rd: number } | null): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === "https://api.chess.com/pub/player/erik") return new Response(JSON.stringify({ player_id: 41, username: "erik", name: "Erik", status: "staff" }), { status: 200 });
    if (url === "https://api.chess.com/pub/player/erik/stats") return new Response(JSON.stringify(rapid ? { chess_rapid: { last: rapid } } : { fide: 0 }), { status: 200 });
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
}

test("the standing route refuses an account Chess.com has closed, before any money moves (U1)", async () => {
  const realFetch = globalThis.fetch;
  // Measured on 18 Sep 2026: dubov answers 200 with status "closed", and its ratings page answers as any other.
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === "https://api.chess.com/pub/player/dubov") return new Response(JSON.stringify({ player_id: 28129450, username: "dubov", status: "closed" }), { status: 200 });
    if (url === "https://api.chess.com/pub/player/dubov/stats") return new Response(JSON.stringify({ chess_rapid: { last: { rating: 990, date: 1620668644, rd: 40 } } }), { status: 200 });
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  try {
    const response = await standingGet(new Request(`${ORIGIN}/api/chess/standing?username=dubov&mode=rapid`));
    assert.equal(response.status, 409);
    const body = (await response.json()) as { code: string; error: string };
    assert.equal(body.code, "ACCOUNT_CLOSED");
    assert.equal(body.error, "Chess.com has closed this account, so nothing on it can be earned.");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a rating still settling is refused before anything is relayed, to everybody once the condition is live (D90)", async () => {
  const realFetch = globalThis.fetch;
  const wasLive = CHESS_RATING.live;
  // The creation is recorded before any relay (D87), so this test has a database; it has no relayer.
  const db = new PGlite();
  const exec: SqlExecutor = async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    return (await db.query<Record<string, unknown>>(text, values)).rows;
  };
  configureGiftStore(exec);
  configureMilestoneStore(exec);
  await ensureGiftSchema();
  await ensureMilestoneSchema();
  try {
    // Signed over the terms the route rebuilds, so the refusal met is the rating's and not the signature's.
    const { receiveAuthorizationMessage, receiveAuthorizationTypedData, toContractAuthorization } = await import("../src/ausd-authorization");
    const { milestoneFundingNonce, SHAPE_CLIMB, ZERO_SUBJECT } = await import("../src/milestone-protocol");
    const { NO_CONTACT_HASH } = await import("../src/contact-hash");
    const signed = async (who: typeof FUNDER) => {
      const params = {
        funder: who.address,
        refundTo: who.address,
        recipientContactHash: NO_CONTACT_HASH,
        goalType: 1,
        shape: SHAPE_CLIMB,
        target: 1954n,
        maximumStart: 1953n,
        subject: ZERO_SUBJECT,
        durationDays: 30,
        amount: 25_000_000n,
        salt: TERMS.salt,
      };
      process.env.MILESTONE_GIFT_ADDRESS = "0x8dc281Ac8a1c789fdb65a063b9225E98eC522F0e";
      const message = receiveAuthorizationMessage({ funder: who.address, escrow: "0x8dc281Ac8a1c789fdb65a063b9225E98eC522F0e", amount: 25_000_000n, nonce: milestoneFundingNonce(params) });
      const a = toContractAuthorization(message, await who.signTypedData(receiveAuthorizationTypedData(message)));
      return { ...TERMS, refundTo: who.address, authorization: { validAfter: a.validAfter.toString(), validBefore: a.validBefore.toString(), nonce: a.nonce, v: a.v, r: a.r, s: a.s } };
    };
    delete process.env.MILESTONE_GIFT_ADDRESS;

    // High RD, a new account's: refused by name to a funder once live.
    (CHESS_RATING as { live: boolean }).live = true;
    globalThis.fetch = chessPages({ rating: 1904, date: 1764957051, rd: 350 });
    let response = await createPost(post(await signed(FUNDER), await cookieFor(FUNDER)));
    let body = (await response.json()) as { code: string; error: string };
    assert.equal(response.status, 409);
    assert.equal(body.code, "RATING_SETTLING");
    assert.match(body.error, /This rating is still settling: they need a few more games first\. Nothing was taken\./);
    // Live, the operator is refused too: the exception is for the rehearsal, before anybody is offered it.
    response = await createPost(post(await signed(OPERATOR), await cookieFor(OPERATOR)));
    assert.equal(((await response.json()) as { code: string }).code, "RATING_SETTLING");

    // Low RD goes past the rating and stops only where this test has no relayer.
    globalThis.fetch = chessPages({ rating: 1904, date: 1764957051, rd: 42 });
    response = await createPost(post(await signed(FUNDER), await cookieFor(FUNDER)));
    body = (await response.json()) as { code: string; error: string };
    assert.notEqual(body.code, "RATING_SETTLING");
    assert.equal(body.code, "NOT_CONFIGURED");

    // No block for this cadence: nothing to climb from.
    globalThis.fetch = chessPages(null);
    response = await createPost(post(await signed(FUNDER), await cookieFor(FUNDER)));
    assert.equal(((await response.json()) as { code: string }).code, "NO_RATING");

    // Not live: the operator's rehearsal gift may start from a rating still settling, and nobody else's.
    (CHESS_RATING as { live: boolean }).live = false;
    globalThis.fetch = chessPages({ rating: 1904, date: 1764957051, rd: 350 });
    response = await createPost(post(await signed(OPERATOR), await cookieFor(OPERATOR)));
    assert.equal(((await response.json()) as { code: string }).code, "NOT_CONFIGURED", "past the rating check, for the rehearsal only");
  } finally {
    globalThis.fetch = realFetch;
    (CHESS_RATING as { live: boolean }).live = wasLive;
    configureGiftStore(undefined);
    configureMilestoneStore(undefined);
    await db.close();
  }
});
