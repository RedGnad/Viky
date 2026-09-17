import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test, { after, before } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { privateKeyToAccount } from "viem/accounts";
import { POST as notify } from "../app/api/gift/[id]/notify/route";
import { ACCOUNT_AUTH_COOKIE_NAME, createAccountAuthChallenge, issueAccountAuthSession } from "../src/account-auth-server";
import { configureGiftStore, ensureGiftSchema, newClaimToken, markClaimed, saveGift } from "../src/gift-store";
import type { SqlExecutor } from "../src/proof-session-store";
import { configurePushStore, ensurePushSchema, isSubscribed, subscriptionsForGift } from "../src/push-store";

/**
 * Asking to be told each morning, and stopping.
 *
 * The template route this replaces took a subscription and a message from whoever called it, so anyone who knew a
 * browser's endpoint could have written a notification from Viky to it. The rule here is the opposite: the caller
 * chooses nothing but the gift and their own browser, and only the two people the gift is between may choose at all.
 */

const ORIGIN = "https://viky.test";
const ENV = { SESSION_SIGNING_SECRET: "test-account-session-secret-that-is-longer-than-32-bytes" };
const FUNDER = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const RECIPIENT = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const STRANGER = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");
const ENDPOINT = "https://push.example/browser-one";
const KEYS = { p256dh: "p".repeat(60), auth: "a".repeat(22) };

process.env.SESSION_SIGNING_SECRET = ENV.SESSION_SIGNING_SECRET;
process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY = "public-key-for-the-test";
process.env.WEB_PUSH_PRIVATE_KEY = "private-key-for-the-test";
process.env.WEB_PUSH_EMAIL = "viky@example.test";

let db: PGlite;

async function cookieFor(account: typeof FUNDER): Promise<string> {
  const challenge = createAccountAuthChallenge({ account: account.address, origin: ORIGIN, nonce: "0123456789abcdef0123456789abcdef", environment: ENV });
  const signature = await account.signMessage({ message: challenge.message });
  const session = await issueAccountAuthSession({ challenge: challenge.challenge, signature, origin: ORIGIN, environment: ENV });
  return `${ACCOUNT_AUTH_COOKIE_NAME}=${session.token}`;
}

function ask(id: string, body: unknown, cookie?: string): [Request, { params: Promise<{ id: string }> }] {
  const headers: Record<string, string> = { origin: ORIGIN, host: "viky.test", "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  return [new Request(`${ORIGIN}/api/gift/${id}/notify`, { method: "POST", headers, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) }];
}

before(async () => {
  db = new PGlite();
  const executor: SqlExecutor = async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    return (await db.query<Record<string, unknown>>(text, values)).rows;
  };
  configureGiftStore(executor);
  configurePushStore(executor);
  await ensureGiftSchema();
  await ensurePushSchema();
  await saveGift({
    giftId: "1",
    funder: FUNDER.address,
    contactHash: `0x${"51".repeat(32)}`,
    goalType: 1,
    dailyTarget: 10,
    durationDays: 7,
    amount: 25_000_000n,
    escrow: "0x00000000000000000000000000000000000000e1",
    claimToken: newClaimToken(),
    createdTx: `0x${"10".repeat(32)}`,
    recipientName: "Léa",
    funderName: "Maman",
  });
  await markClaimed("1", RECIPIENT.address, `0x${"c1".repeat(32)}`);
});

after(async () => {
  configureGiftStore(undefined);
  configurePushStore(undefined);
  await db.close();
});

test("the funder and the recipient may each ask to be told, and each row is their own", async () => {
  for (const [who, account] of [
    ["funder", FUNDER],
    ["recipient", RECIPIENT],
  ] as const) {
    const cookie = await cookieFor(account);
    const answer = await notify(...ask("1", { intent: "on", subscription: { endpoint: `${ENDPOINT}-${who}`, keys: KEYS } }, cookie));
    assert.equal(answer.status, 200, who);
    assert.deepEqual(await answer.json(), { on: true }, who);
  }
  const rows = await subscriptionsForGift("1");
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((row) => row.account).sort(),
    [FUNDER.address.toLowerCase(), RECIPIENT.address.toLowerCase()].sort(),
  );
});

test("nobody else may, signed in or not", async () => {
  const stranger = await notify(...ask("1", { intent: "on", subscription: { endpoint: ENDPOINT, keys: KEYS } }, await cookieFor(STRANGER)));
  assert.equal(stranger.status, 403);
  const signedOut = await notify(...ask("1", { intent: "on", subscription: { endpoint: ENDPOINT, keys: KEYS } }));
  assert.equal(signedOut.status, 401);
  assert.equal(await isSubscribed(ENDPOINT, "1"), false);
});

test("stopping is one call, and it stops this gift on this browser only", async () => {
  const cookie = await cookieFor(RECIPIENT);
  await notify(...ask("1", { intent: "on", subscription: { endpoint: `${ENDPOINT}-stop`, keys: KEYS } }, cookie));
  assert.equal(await isSubscribed(`${ENDPOINT}-stop`, "1"), true);
  const off = await notify(...ask("1", { intent: "off", subscription: { endpoint: `${ENDPOINT}-stop` } }, cookie));
  assert.equal(off.status, 200);
  assert.deepEqual(await off.json(), { on: false });
  assert.equal(await isSubscribed(`${ENDPOINT}-stop`, "1"), false);
  assert.equal(await isSubscribed(`${ENDPOINT}-recipient`, "1"), true, "the browser's other subscription stands");
});

test("a browser can ask whether it is already being told, without changing anything", async () => {
  const cookie = await cookieFor(FUNDER);
  const known = await notify(...ask("1", { intent: "check", subscription: { endpoint: `${ENDPOINT}-funder` } }, cookie));
  assert.deepEqual(await known.json(), { on: true, possible: true });
  const unknown = await notify(...ask("1", { intent: "check", subscription: { endpoint: "https://push.example/never-seen" } }, cookie));
  assert.deepEqual(await unknown.json(), { on: false, possible: true });
  assert.equal(await isSubscribed("https://push.example/never-seen", "1"), false, "asking wrote nothing");
});

test("a request that is not a browser's own subscription is refused before anything is written", async () => {
  const cookie = await cookieFor(FUNDER);
  for (const body of [
    { intent: "on", subscription: { endpoint: "http://push.example/not-https", keys: KEYS } },
    { intent: "on", subscription: { endpoint: "not a url", keys: KEYS } },
    { intent: "on", subscription: { endpoint: `${ENDPOINT}-bad`, keys: { p256dh: "short", auth: KEYS.auth } } },
    { intent: "on", subscription: { endpoint: `${ENDPOINT}-bad`, keys: { p256dh: KEYS.p256dh, auth: "<script>" } } },
    { intent: "on", subscription: {} },
  ]) {
    const answer = await notify(...ask("1", body, cookie));
    assert.equal(answer.status, 400, JSON.stringify(body));
  }
  assert.equal(await isSubscribed(`${ENDPOINT}-bad`, "1"), false);
  const unknownIntent = await notify(...ask("1", { intent: "send", subscription: { endpoint: ENDPOINT, keys: KEYS } }, cookie));
  assert.equal(unknownIntent.status, 400);
  const unknownGift = await notify(...ask("404", { intent: "on", subscription: { endpoint: ENDPOINT, keys: KEYS } }, cookie));
  assert.equal(unknownGift.status, 404);
});

test("the route that sent anything to anybody is gone", () => {
  // It took a subscription and a message from its caller: nothing about it could be made safe, so it is not here.
  assert.equal(existsSync("app/api/notification/route.ts"), false, "the template's open notification route must not exist");
  assert.equal(existsSync("app/components/PushSubscription.tsx"), false, "nor the component that called it");
});
