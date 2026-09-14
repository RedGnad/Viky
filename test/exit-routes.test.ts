// The way out must refuse everything malformed before it touches an exchange, a database or the relayer,
// and must never make a second set of terms while one is already signed. Every case here stops at a guard,
// so it runs with no network.

import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { privateKeyToAccount } from "viem/accounts";
import { ACCOUNT_AUTH_COOKIE_NAME, createAccountAuthChallenge, issueAccountAuthSession } from "../src/account-auth-server";
import { configureExitStore, ensureExitSchema, attachSignature, newExitId, saveExit } from "../src/exit-store";
import { issueExitTicket } from "../src/exit-ticket";
import type { SqlExecutor } from "../src/proof-session-store";
import { POST as preparePost } from "../app/api/exit/prepare/route";
import { POST as relayPost } from "../app/api/exit/relay/route";

const ORIGIN = "https://viky.test";
const ENV = { SESSION_SIGNING_SECRET: "test-account-session-secret-that-is-longer-than-32-bytes" };
const A = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const ROUTER = "0x00000000000000000000000000000000000E1717";
const EXCHANGE = "0xb3e6778480b2E488385E8205eA05E20060B813cb";
const PAYOUT = "0x0000000000000000000000000000000000000B0b";
const ONE = 1_000_000_000_000_000_000n;

process.env.SESSION_SIGNING_SECRET = ENV.SESSION_SIGNING_SECRET;
process.env.EXIT_ROUTER_ADDRESS = ROUTER;
process.env.EXIT_EXCHANGE_ADDRESS = EXCHANGE;
delete process.env.RELAYER_PRIVATE_KEY;

let db: PGlite;
let cookie: string;

function pgliteExecutor(database: PGlite): SqlExecutor {
  return async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    return (await database.query<Record<string, unknown>>(text, values)).rows;
  };
}

function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { origin: ORIGIN, host: "viky.test", "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function json(response: Response): Promise<{ error?: string; code?: string; id?: string; signed?: boolean }> {
  return (await response.json()) as { error?: string; code?: string; id?: string; signed?: boolean };
}

function ticketFor(amount: bigint, floor: bigint): string {
  return issueExitTicket({ account: A.address, amount, floor, shown: "126.5058" });
}

async function storedTerms(over: { signature?: `0x${string}`; payoutTo?: string; minOut?: bigint } = {}) {
  const id = newExitId();
  await saveExit({
    id,
    account: A.address,
    amount: 3_000_000n,
    payoutTo: (over.payoutTo ?? PAYOUT) as `0x${string}`,
    minOut: over.minOut ?? 126n * ONE,
    exchange: EXCHANGE as `0x${string}`,
    callData: "0xce1e7030",
    callHash: `0x${"11".repeat(32)}`,
    salt: `0x${"22".repeat(32)}`,
    deadline: BigInt(Math.floor(Date.now() / 1_000) + 600),
    nonce: `0x${"33".repeat(32)}`,
  });
  if (over.signature) await attachSignature(id, over.signature);
  return id;
}

before(async () => {
  db = new PGlite();
  configureExitStore(pgliteExecutor(db));
  await ensureExitSchema();
  const challenge = createAccountAuthChallenge({ account: A.address, origin: ORIGIN, nonce: "0123456789abcdef0123456789abcdef", environment: ENV });
  const signature = await A.signMessage({ message: challenge.message });
  const session = await issueAccountAuthSession({ challenge: challenge.challenge, signature, origin: ORIGIN, environment: ENV });
  cookie = `${ACCOUNT_AUTH_COOKIE_NAME}=${session.token}`;
});

beforeEach(async () => {
  await db.query("DELETE FROM viky_exits");
});

after(async () => {
  configureExitStore(undefined);
  await db.close();
});

test("nobody signed in gets nowhere", async () => {
  for (const route of [preparePost, relayPost]) {
    const response = await route(post("/api/exit", { id: "0".repeat(24) }));
    assert.equal(response.status, 401);
  }
});

test("a destination that is not one is refused before anything else", async () => {
  const response = await preparePost(post("/api/exit/prepare", { payoutTo: "not an account", ticket: ticketFor(3_000_000n, 126n * ONE) }, { cookie }));
  assert.equal(response.status, 400);
  assert.equal((await json(response)).code, "INVALID_DESTINATION");
});

test("paying into Viky's own router would look like being paid and be nothing", async () => {
  const response = await preparePost(post("/api/exit/prepare", { payoutTo: ROUTER, ticket: ticketFor(3_000_000n, 126n * ONE) }, { cookie }));
  assert.equal((await json(response)).code, "INVALID_DESTINATION");
});

test("a floor the browser wrote itself is worth nothing", async () => {
  const forged = Buffer.from(JSON.stringify({ account: A.address, amount: "3000000", floor: "1", shown: "0.0001", expiresAt: 9_999_999_999 })).toString("base64url");
  const response = await preparePost(post("/api/exit/prepare", { payoutTo: PAYOUT, ticket: `${forged}.whatever` }, { cookie }));
  assert.equal(response.status, 409);
  assert.equal((await json(response)).code, "QUOTE_EXPIRED");
});

test("one person's quote is worth nothing to another", async () => {
  const other = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
  const theirs = issueExitTicket({ account: other.address, amount: 3_000_000n, floor: 126n * ONE, shown: "126.0000" });
  const response = await preparePost(post("/api/exit/prepare", { payoutTo: PAYOUT, ticket: theirs }, { cookie }));
  assert.equal((await json(response)).code, "QUOTE_EXPIRED");
});

test("asking again for the same thing gives back the terms already signed", async () => {
  const id = await storedTerms({ signature: "0xabcd" });
  const response = await preparePost(post("/api/exit/prepare", { payoutTo: PAYOUT, ticket: ticketFor(3_000_000n, 126n * ONE) }, { cookie }));
  assert.equal(response.status, 200);
  const body = await json(response);
  assert.equal(body.id, id, "the same terms, not a second set");
  assert.equal(body.signed, true, "and the browser is told it need not sign again");
});

test("while one is signed, no second set of terms can be made for the same money", async () => {
  await storedTerms({ signature: "0xabcd" });
  const response = await preparePost(post("/api/exit/prepare", { payoutTo: PAYOUT, ticket: ticketFor(5_000_000n, 126n * ONE) }, { cookie }));
  assert.equal(response.status, 409);
  assert.equal((await json(response)).code, "ALREADY_UNDER_WAY");
});

test("a payout nobody prepared cannot be relayed", async () => {
  const response = await relayPost(post("/api/exit/relay", { id: "a".repeat(24), signature: `0x${"11".repeat(65)}` }, { cookie }));
  assert.equal(response.status, 404);
  assert.equal((await json(response)).code, "UNKNOWN_PAYOUT");
});

test("an identifier that is not one is refused before the database", async () => {
  const response = await relayPost(post("/api/exit/relay", { id: "../../etc/passwd" }, { cookie }));
  assert.equal(response.status, 400);
});

test("terms whose window has closed are not relayed", async () => {
  const id = newExitId();
  await saveExit({
    id,
    account: A.address,
    amount: 3_000_000n,
    payoutTo: PAYOUT as `0x${string}`,
    minOut: 126n * ONE,
    exchange: EXCHANGE as `0x${string}`,
    callData: "0xce1e7030",
    callHash: `0x${"11".repeat(32)}`,
    salt: `0x${"22".repeat(32)}`,
    deadline: BigInt(Math.floor(Date.now() / 1_000) - 1),
    nonce: `0x${"33".repeat(32)}`,
  });
  await attachSignature(id, "0xabcd");
  const response = await relayPost(post("/api/exit/relay", { id }, { cookie }));
  assert.equal(response.status, 409);
  assert.equal((await json(response)).code, "TOO_SLOW");
});

test("one account cannot relay another's payout", async () => {
  const id = await storedTerms({ signature: "0xabcd" });
  const other = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
  const challenge = createAccountAuthChallenge({ account: other.address, origin: ORIGIN, nonce: "0123456789abcdef0123456789abcdef", environment: ENV });
  const signature = await other.signMessage({ message: challenge.message });
  const session = await issueAccountAuthSession({ challenge: challenge.challenge, signature, origin: ORIGIN, environment: ENV });
  const response = await relayPost(post("/api/exit/relay", { id }, { cookie: `${ACCOUNT_AUTH_COOKIE_NAME}=${session.token}` }));
  assert.equal(response.status, 404);
});
