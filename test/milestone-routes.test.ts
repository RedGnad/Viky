// The milestone routes (C2) must refuse, before touching Chess.com, the relayer or the database, anything they would
// refuse later: no account, a condition nobody is offered, terms that are not a climb, a signature over other terms.

import assert from "node:assert/strict";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { ACCOUNT_AUTH_COOKIE_NAME, createAccountAuthChallenge, issueAccountAuthSession } from "../src/account-auth-server";
import { POST as createPost } from "../app/api/gift/milestone/create/route";
import { GET as standingGet } from "../app/api/chess/standing/route";
import { GET as conditionsGet } from "../app/api/conditions/route";

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

const TERMS = {
  conditionId: "chess-rating",
  username: "erik",
  cadence: "rapid",
  target: 1954,
  standing: 1904,
  standingReadAt: new Date(Date.now() - 60_000).toISOString(),
  durationDays: 30,
  amount: "25000000",
  salt: `0x${"01".repeat(32)}`,
  authorization: { nonce: `0x${"02".repeat(32)}`, r: `0x${"03".repeat(32)}`, s: `0x${"04".repeat(32)}`, v: 27 },
};

test("making a milestone gift needs an account", async () => {
  assert.equal((await createPost(post(TERMS))).status, 401);
});

test("a condition that is not live is offered to nobody but an account that runs Viky", async () => {
  const funder = await createPost(post(TERMS, await cookieFor(FUNDER)));
  assert.equal(funder.status, 400);
  assert.equal(((await funder.json()) as { code: string }).code, "GOAL_NOT_OFFERED");

  const listed = (await (await conditionsGet(new Request(`${ORIGIN}/api/conditions`, { headers: { cookie: await cookieFor(FUNDER) } }))).json()) as { ids: string[]; preview: string[] };
  assert.deepEqual(listed.preview, [], "a funder sees only what is live");
  const operator = (await (await conditionsGet(new Request(`${ORIGIN}/api/conditions`, { headers: { cookie: await cookieFor(OPERATOR) } }))).json()) as { ids: string[]; preview: string[] };
  assert.deepEqual(operator.preview, ["chess-rating"]);
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
