// The funder's two gestures on a gift nobody has opened: a link again, and taking it back (gift 1000001,
// 19 Sep 2026). What both routes must never do is refuse the funder or answer anybody else, and that is decided
// before the chain is read, which is why these run with a database and no network.

import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { privateKeyToAccount } from "viem/accounts";
import { ACCOUNT_AUTH_COOKIE_NAME, createAccountAuthChallenge, issueAccountAuthSession } from "../src/account-auth-server";
import { POST as cancelPost } from "../app/api/gift/[id]/cancel/route";
import { POST as linkPost } from "../app/api/gift/[id]/link/route";
import { configureGiftStore, ensureGiftSchema, loadGiftForClaim, newClaimToken, saveGift } from "../src/gift-store";
import type { SqlExecutor } from "../src/proof-session-store";

const ORIGIN = "https://viky.test";
const ENV = { SESSION_SIGNING_SECRET: "test-account-session-secret-that-is-longer-than-32-bytes" };
const FUNDER = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const STRANGER = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");

process.env.SESSION_SIGNING_SECRET = ENV.SESSION_SIGNING_SECRET;
delete process.env.RELAYER_PRIVATE_KEY;

let db: PGlite;
const TOKEN = newClaimToken();

async function cookieFor(account: typeof FUNDER): Promise<string> {
  const challenge = createAccountAuthChallenge({ account: account.address, origin: ORIGIN, nonce: "0123456789abcdef0123456789abcdef", environment: ENV });
  const signature = await account.signMessage({ message: challenge.message });
  const session = await issueAccountAuthSession({ challenge: challenge.challenge, signature, origin: ORIGIN, environment: ENV });
  return `${ACCOUNT_AUTH_COOKIE_NAME}=${session.token}`;
}

function post(id: string, cookie?: string, from = "10.0.0.1", what = "link"): { request: Request; context: { params: Promise<{ id: string }> } } {
  return {
    request: new Request(`${ORIGIN}/api/gift/${id}/${what}`, {
      method: "POST",
      headers: { origin: ORIGIN, host: "viky.test", "content-type": "application/json", "x-forwarded-for": from, ...(cookie ? { cookie } : {}) },
      body: "{}",
    }),
    context: { params: Promise.resolve({ id }) },
  };
}

before(async () => {
  db = new PGlite();
  const executor: SqlExecutor = async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    return (await db.query<Record<string, unknown>>(text, values)).rows;
  };
  configureGiftStore(executor);
  await ensureGiftSchema();
  await saveGift({
    giftId: "7",
    funder: FUNDER.address,
    contactHash: `0x${"51".repeat(32)}`,
    claimToken: TOKEN,
    goalType: 1,
    dailyTarget: 10,
    durationDays: 7,
    amount: 25_000_000n,
    createdTx: `0x${"77".repeat(32)}`,
    escrow: "0x00000000000000000000000000000000000000e1",
  });
});

after(async () => {
  configureGiftStore(undefined);
  await db.close();
});

test("nobody signed in gets no link, and no key moves", async () => {
  const { request, context } = post("7");
  const response = await linkPost(request, context);
  assert.equal(response.status, 401);
  assert.equal((await loadGiftForClaim("7", TOKEN))?.giftId, "7", "the key is where it was");
});

test("another account is refused, and told nothing about the gift", async () => {
  const { request, context } = post("7", await cookieFor(STRANGER), "10.0.0.2");
  const response = await linkPost(request, context);
  assert.equal(response.status, 403);
  const body = (await response.json()) as { code?: string; error?: string };
  assert.equal(body.code, "NOT_FUNDER");
  assert.doesNotMatch(String(body.error), /\$|25|Duolingo/, "nothing about the gift itself");
  assert.equal((await loadGiftForClaim("7", TOKEN))?.giftId, "7", "and the key is where it was");
});

test("a gift that does not exist is refused the same way to its funder", async () => {
  const { request, context } = post("404404", await cookieFor(FUNDER), "10.0.0.3");
  const response = await linkPost(request, context);
  assert.equal(response.status, 404);
  assert.equal(((await response.json()) as { code?: string }).code, "UNKNOWN_GIFT");
});

test("a gift number that is not one is refused before anything is read", async () => {
  const { request, context } = post("../../etc", await cookieFor(FUNDER), "10.0.0.4");
  const response = await linkPost(request, context);
  assert.equal(response.status, 400);
});

test("nobody signed in takes nothing back", async () => {
  const { request, context } = post("7", undefined, "10.0.1.1", "cancel");
  assert.equal((await cancelPost(request, context)).status, 401);
});

test("another account cannot take back a gift it did not make", async () => {
  const { request, context } = post("7", await cookieFor(STRANGER), "10.0.1.2", "cancel");
  const response = await cancelPost(request, context);
  assert.equal(response.status, 403);
  const body = (await response.json()) as { code?: string; error?: string };
  assert.equal(body.code, "NOT_FUNDER");
  assert.doesNotMatch(String(body.error), /\$|25/, "nothing about the gift itself");
});

test("a gift that does not exist cannot be taken back, and its funder learns nothing else", async () => {
  const { request, context } = post("404405", await cookieFor(FUNDER), "10.0.1.3", "cancel");
  const response = await cancelPost(request, context);
  assert.equal(response.status, 404);
  assert.equal(((await response.json()) as { code?: string }).code, "UNKNOWN_GIFT");
});

test("a gift number that is not one is refused before the relayer is ever asked", async () => {
  const { request, context } = post("0x1", await cookieFor(FUNDER), "10.0.1.4", "cancel");
  assert.equal((await cancelPost(request, context)).status, 400);
});
