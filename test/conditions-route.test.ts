import assert from "node:assert/strict";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { GET as conditions } from "../app/api/conditions/route";
import { ACCOUNT_AUTH_COOKIE_NAME, createAccountAuthChallenge, issueAccountAuthSession } from "../src/account-auth-server";
import { CHESS_MILESTONE } from "../src/milestone-conditions";

/**
 * Which conditions a person may offer. The Chess.com rehearsal hangs on this route: a condition that is wired and not
 * live yet is offered to an account that runs Viky and to nobody else, so the first real gift on it can be made.
 *
 * Measured in production on 18 Sep 2026: the route answered the founder correctly and his account is simply not on
 * the operator list, which is a line of configuration and not a defect. This pins what the route does with a session,
 * so the two can never be confused again.
 */

const ORIGIN = "https://viky.test";
const ENV = { SESSION_SIGNING_SECRET: "test-account-session-secret-that-is-longer-than-32-bytes" };
const OPERATOR = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const SOMEBODY = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");

process.env.SESSION_SIGNING_SECRET = ENV.SESSION_SIGNING_SECRET;
process.env.VIKY_OPERATOR_ACCOUNTS = OPERATOR.address;

async function cookieFor(account: typeof OPERATOR): Promise<string> {
  const challenge = createAccountAuthChallenge({ account: account.address, origin: ORIGIN, nonce: "0123456789abcdef0123456789abcdef", environment: ENV });
  const signature = await account.signMessage({ message: challenge.message });
  const session = await issueAccountAuthSession({ challenge: challenge.challenge, signature, origin: ORIGIN, environment: ENV });
  return `${ACCOUNT_AUTH_COOKIE_NAME}=${session.token}`;
}

function ask(cookie?: string): Request {
  const headers: Record<string, string> = { origin: ORIGIN, host: "viky.test" };
  if (cookie) headers.cookie = cookie;
  return new Request(`${ORIGIN}/api/conditions`, { headers });
}

async function answerFor(cookie?: string): Promise<{ ids: string[]; preview: string[] }> {
  return (await (await conditions(ask(cookie))).json()) as { ids: string[]; preview: string[] };
}

test("an account that runs Viky is offered the condition that is wired and not live yet", async () => {
  const answer = await answerFor(await cookieFor(OPERATOR));
  assert.deepEqual(answer.preview, [CHESS_MILESTONE.condition.id], "this is what reopens the Chess.com rehearsal");
  assert.ok(answer.ids.includes("duolingo-daily"), "and the live ones are there for everybody");
});

test("everybody else is offered the live conditions and nothing else", async () => {
  for (const cookie of [await cookieFor(SOMEBODY), undefined]) {
    const answer = await answerFor(cookie);
    assert.deepEqual(answer.preview, [], "a signed-in stranger and a stranger get the same answer here");
    assert.ok(!answer.ids.includes(CHESS_MILESTONE.condition.id));
  }
});

test("an empty operator list offers the preview to nobody, however valid the session", async () => {
  const kept = process.env.VIKY_OPERATOR_ACCOUNTS;
  process.env.VIKY_OPERATOR_ACCOUNTS = "";
  try {
    assert.deepEqual((await answerFor(await cookieFor(OPERATOR))).preview, []);
  } finally {
    process.env.VIKY_OPERATOR_ACCOUNTS = kept;
  }
});
