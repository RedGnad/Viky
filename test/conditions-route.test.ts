import assert from "node:assert/strict";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { GET as conditions } from "../app/api/conditions/route";
import { ACCOUNT_AUTH_COOKIE_NAME, createAccountAuthChallenge, issueAccountAuthSession } from "../src/account-auth-server";
import { CHESS_MILESTONE, DET_MILESTONE } from "../src/milestone-conditions";

/**
 * Which conditions a person may offer. A condition that is wired and not live yet is offered to an account that runs
 * Viky and to nobody else, so the first real gift on it can be made at all.
 *
 * Measured in production on 18 Sep 2026: the route answered the founder correctly and his account is simply not on
 * the operator list, which is a line of configuration and not a defect. This pins what the route does with a session,
 * so the two can never be confused again.
 *
 * Chess.com went through that door and out of it: two real gifts ran on it and it is live since 19 Sep 2026 (D109),
 * which leaves the Duolingo English Test alone behind it until its goal is registered on the contract.
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

test("the door for what is wired and not live yet stands, and is empty while nothing is behind it", async () => {
  const answer = await answerFor(await cookieFor(OPERATOR));
  // Chess.com left this door on 19 Sep 2026 and the English test the same day, when goal 5 was registered (D109).
  // Nothing is behind it today: Coursera has no goal on the contract, so no gift could be made on it here either.
  assert.deepEqual(
    answer.preview,
    ["toefl-mybest-shown", "university-enrollment-shown", "university-year-passed-shown", "university-grade-shown"],
    "what is wired, creatable by an operator and closed today: the TOEFL score shown (D164), enrolment shown (D165), the year passed and a grade shown (D174)",
  );
  assert.ok(answer.ids.includes("duolingo-daily"), "and the live ones are there for everybody");
  assert.ok(answer.ids.includes(CHESS_MILESTONE.condition.id));
  assert.ok(answer.ids.includes(DET_MILESTONE.condition.id), "the supervised result is live since its goal was registered");
});

test("everybody else is offered the live conditions and nothing else", async () => {
  for (const cookie of [await cookieFor(SOMEBODY), undefined]) {
    const answer = await answerFor(cookie);
    assert.deepEqual(answer.preview, [], "a signed-in stranger and a stranger get the same answer here");
    assert.ok(answer.ids.includes(CHESS_MILESTONE.condition.id), "a live milestone is offered like any live condition");
    assert.ok(answer.ids.includes(DET_MILESTONE.condition.id), "and so is the one that opened on 19 Sep 2026");
    // The course certificate opened on 20 Sep with goal 10 registered, so the register holds nothing closed today.
    // What stands is the shape of the answer: `preview` is empty for everybody who does not run Viky, whatever it holds.
    assert.ok(answer.ids.includes("coursera-certificate"), "and the one that opened on 20 Sep 2026");
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
