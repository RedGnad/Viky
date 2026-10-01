// The converter's USDC half (the founder, 1 Oct 2026): USDC a card payment delivered becomes what a gift holds, on
// one signature the relayer carries. Not deployed: every case here stops at a guard or runs on a database in memory,
// with no network and no relayer.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after, before, beforeEach } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { getAddress, hashTypedData, keccak256, recoverTypedDataAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ACCOUNT_AUTH_COOKIE_NAME, createAccountAuthChallenge, issueAccountAuthSession } from "../src/account-auth-server";
import { receiveAuthorizationTypedData } from "../src/ausd-authorization";
import { USDC } from "../src/coins";
import { exitNonce, type ExitTerms } from "../src/exit-terms";
import { attachSignature, configureExitStore, ensureExitSchema, newExitId, openConversion, openExit, saveExit } from "../src/exit-store";
import { CONVERSION_RESERVE, nextFundingStep, RETRY_PAUSE_MS, USDC_ARRIVAL_FLOOR } from "../src/funding-step";
import { AUSD_ADDRESS, USDC_ADDRESS } from "../src/monad/chain";
import type { SqlExecutor } from "../src/proof-session-store";
import { conversionFloor, conversionRefusal, SMALLEST_CONVERSION, termsFromJson, termsToJson, usdcRouterAddress } from "../src/usdc-router";
import { POST as preparePost } from "../app/api/fund/convert/prepare/route";
import { POST as relayPost } from "../app/api/fund/convert/relay/route";

const ORIGIN = "https://viky.test";
const ENV = { SESSION_SIGNING_SECRET: "test-account-session-secret-that-is-longer-than-32-bytes" };
const A = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const ROUTER = getAddress("0x00000000000000000000000000000000000c0177");
const EXCHANGE = "0xb3e6778480b2E488385E8205eA05E20060B813cb";
const AMOUNT = 30_000_000n;

process.env.SESSION_SIGNING_SECRET = ENV.SESSION_SIGNING_SECRET;
process.env.EXIT_EXCHANGE_ADDRESS = EXCHANGE;
process.env.EXIT_ROUTER_ADDRESS = "0x00000000000000000000000000000000000E1717";
delete process.env.RELAYER_PRIVATE_KEY;
delete process.env.NEXT_PUBLIC_USDC_ROUTER_ADDRESS;

let db: PGlite;
let cookie: string;

function pgliteExecutor(database: PGlite): SqlExecutor {
  return async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    return (await database.query<Record<string, unknown>>(text, values)).rows;
  };
}

function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}${path}`, { method: "POST", headers: { origin: ORIGIN, host: "viky.test", "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
}

const json = async (response: Response) => (await response.json()) as { error?: string; code?: string; id?: string; signed?: boolean; terms?: ReturnType<typeof termsToJson>; authorization?: { to: string; value: string; nonce: `0x${string}` } };

function terms(over: Partial<ExitTerms> = {}): ExitTerms {
  return {
    payer: A.address,
    amount: AMOUNT,
    tokenOut: AUSD_ADDRESS,
    minOut: 29_990_000n,
    exchange: EXCHANGE as `0x${string}`,
    callHash: keccak256("0xce1e7030"),
    deadline: BigInt(Math.floor(Date.now() / 1_000) + 600),
    salt: `0x${"22".repeat(32)}`,
    ...over,
  };
}

async function stored(over: { tokenOut?: `0x${string}`; amount?: bigint; signature?: `0x${string}` } = {}) {
  const t = terms({ tokenOut: over.tokenOut ?? AUSD_ADDRESS, amount: over.amount ?? AMOUNT });
  const id = newExitId();
  await saveExit({ id, account: A.address, amount: t.amount, tokenOut: t.tokenOut, minOut: t.minOut, exchange: t.exchange, callData: "0xce1e7030", callHash: t.callHash, salt: t.salt, deadline: t.deadline, nonce: exitNonce(t) });
  if (over.signature) await attachSignature(id, over.signature);
  return { id, terms: t };
}

before(async () => {
  db = new PGlite();
  configureExitStore(pgliteExecutor(db));
  await ensureExitSchema();
  const challenge = createAccountAuthChallenge({ account: A.address, origin: ORIGIN, nonce: "0123456789abcdef0123456789abcdef", environment: ENV });
  const session = await issueAccountAuthSession({ challenge: challenge.challenge, signature: await A.signMessage({ message: challenge.message }), origin: ORIGIN, environment: ENV });
  cookie = `${ACCOUNT_AUTH_COOKIE_NAME}=${session.token}`;
});

beforeEach(async () => {
  await db.query("DELETE FROM viky_exits");
  delete process.env.NEXT_PUBLIC_USDC_ROUTER_ADDRESS;
});

after(async () => {
  configureExitStore(undefined);
  await db.close();
});

test("with no address set, nothing of the conversion runs: both routes say so, and the screen reads no USDC", async () => {
  assert.equal(usdcRouterAddress(), undefined);
  for (const [route, body] of [[preparePost, { amount: AMOUNT.toString() }], [relayPost, { id: "a".repeat(24) }]] as const) {
    const response = await route(post("/api/fund/convert", body, { cookie }));
    assert.equal(response.status, 503);
    assert.equal((await json(response)).code, "NOT_CONFIGURED");
  }
  process.env.NEXT_PUBLIC_USDC_ROUTER_ADDRESS = "not an address";
  assert.equal(usdcRouterAddress(), undefined, "anything that is not an address is nothing");
  const screen = readFileSync("app/components/PayGift.tsx", "utf8");
  assert.match(screen, /usdcRouterAddress\(\) \? readCoinBalance\(USDC, address\) : undefined/, "USDC is read only where the step that changes it exists");
  // And what the screen is told without it is what it was always told.
  assert.deepEqual(nextFundingStep({ held: 0n, arriving: 0n, arrivingUsdc: undefined, wanted: AMOUNT }), { do: "wait", sawSomething: false });
});

test("nobody signed in gets nowhere", async () => {
  process.env.NEXT_PUBLIC_USDC_ROUTER_ADDRESS = ROUTER;
  for (const route of [preparePost, relayPost]) assert.equal((await route(post("/api/fund/convert", { amount: "1" }))).status, 401);
});

test("the floor is a rule: ninety-nine for a hundred, and the browser reads the terms before it signs them", () => {
  assert.equal(conversionFloor(30_000_000n), 29_700_000n);
  assert.equal(SMALLEST_CONVERSION, USDC_ARRIVAL_FLOOR, "the screen and the server name the same smallest amount");
  const now = Math.floor(Date.now() / 1_000);
  const good = terms();
  const expected = { payer: A.address, amount: AMOUNT, nonce: exitNonce(good), value: AMOUNT, nowSeconds: now };
  assert.equal(conversionRefusal(good, expected), null);
  assert.equal(conversionRefusal(terms({ payer: "0x000000000000000000000000000000000000dEaD" }), expected), "the terms name another account");
  assert.equal(conversionRefusal(terms({ amount: AMOUNT + 1n }), expected), "the terms take another amount");
  assert.equal(conversionRefusal(good, { ...expected, value: AMOUNT - 1n }), "the terms take another amount");
  assert.equal(conversionRefusal(terms({ tokenOut: USDC_ADDRESS }), expected), "the terms give back another coin");
  assert.equal(conversionRefusal(terms({ minOut: 29_699_999n }), expected), "the terms give back too little");
  assert.equal(conversionRefusal(terms({ deadline: BigInt(now) }), expected), "the terms have expired");
  assert.equal(conversionRefusal(terms({ deadline: BigInt(now + 3_600) }), expected), "the terms stay open too long");
  // Sound terms under a nonce that is some other terms': the signature would consent to those, so it is refused.
  assert.equal(conversionRefusal(good, { ...expected, nonce: exitNonce(terms({ minOut: 1n })) }), "the nonce is not these terms'");
  // What travels in JSON comes back as it left.
  assert.deepEqual(termsFromJson(termsToJson(good)), good);
});

test("the signature is made under USDC's own domain, and what a gift holds keeps its own", async () => {
  const message = { from: A.address, to: ROUTER, value: AMOUNT, validAfter: 0n, validBefore: 9_999_999_999n, nonce: exitNonce(terms()) };
  const usdc = receiveAuthorizationTypedData(message, USDC);
  assert.deepEqual(usdc.domain, { name: "USDC", version: "2", chainId: 143, verifyingContract: USDC_ADDRESS });
  assert.equal(receiveAuthorizationTypedData(message).domain.name, "Agora Dollar", "every earlier caller signs as it always did");
  assert.notEqual(hashTypedData(usdc), hashTypedData(receiveAuthorizationTypedData(message)));
  assert.equal(await recoverTypedDataAddress({ ...usdc, signature: await A.signTypedData(usdc) }), A.address);
  const browser = readFileSync("src/client/convert.ts", "utf8");
  assert.match(browser, /signTypedData\(receiveAuthorizationTypedData\(message, USDC\)\)/);
  assert.ok(browser.indexOf("conversionRefusal(") < browser.indexOf("signTypedData("), "the terms are read before anything is signed");
  assert.match(browser, /if \(getAddress\(prepared\.authorization\.to\) !== router\) throw refused/, "and signed for the router this code knows");
});

test("a conversion and a way out are written in one table and never read each other", async () => {
  const wayOut = await stored({ tokenOut: USDC_ADDRESS, amount: 3_000_000n });
  assert.equal((await openExit(A.address))?.id, wayOut.id);
  assert.equal(await openConversion(A.address), null, "a way out is not a conversion");
  const conversion = await stored();
  assert.equal((await openConversion(A.address))?.id, conversion.id);
  assert.equal((await openExit(A.address))?.id, wayOut.id, "and a conversion never stands in a way out's place");
});

test("asking again for the same money gives back the terms already written, and signed terms hold it", async () => {
  process.env.NEXT_PUBLIC_USDC_ROUTER_ADDRESS = ROUTER;
  const first = await stored({ signature: "0xabcd" });
  const again = await preparePost(post("/api/fund/convert/prepare", { amount: AMOUNT.toString() }, { cookie }));
  assert.equal(again.status, 200);
  const body = await json(again);
  assert.equal(body.id, first.id, "the same terms, not a second set");
  assert.equal(body.signed, true);
  assert.equal(body.authorization?.to.toLowerCase(), ROUTER.toLowerCase());
  assert.equal(body.authorization?.nonce, exitNonce(first.terms));
  // What comes back is what the browser's own reading accepts.
  assert.equal(conversionRefusal(termsFromJson(body.terms!), { payer: A.address, amount: AMOUNT, nonce: body.authorization!.nonce, value: BigInt(body.authorization!.value), nowSeconds: Math.floor(Date.now() / 1_000) }), null);
  const other = await preparePost(post("/api/fund/convert/prepare", { amount: (AMOUNT + 1_000_000n).toString() }, { cookie }));
  assert.equal(other.status, 409);
  assert.equal((await json(other)).code, "ALREADY_UNDER_WAY");
});

test("an amount under a dollar, or one that is not a number, is refused before anything is asked", async () => {
  process.env.NEXT_PUBLIC_USDC_ROUTER_ADDRESS = ROUTER;
  for (const amount of ["999999", "0", "-5", "ten", ""]) {
    const response = await preparePost(post("/api/fund/convert/prepare", { amount }, { cookie }));
    assert.equal(response.status, 400, amount);
  }
});

test("only a conversion is carried by the conversion's relay, and only one this account prepared", async () => {
  process.env.NEXT_PUBLIC_USDC_ROUTER_ADDRESS = ROUTER;
  const wayOut = await stored({ tokenOut: USDC_ADDRESS, amount: 3_000_000n, signature: `0x${"11".repeat(65)}` });
  const wrong = await relayPost(post("/api/fund/convert/relay", { id: wayOut.id }, { cookie }));
  assert.equal(wrong.status, 404, "a way out's terms are never sent to the router that takes USDC");
  assert.equal((await json(wrong)).code, "UNKNOWN_CONVERSION");
  assert.equal((await relayPost(post("/api/fund/convert/relay", { id: "a".repeat(24), signature: `0x${"11".repeat(65)}` }, { cookie }))).status, 404);
  assert.equal((await relayPost(post("/api/fund/convert/relay", { id: "../../etc/passwd" }, { cookie }))).status, 400);
  const conversion = await stored();
  const unsigned = await relayPost(post("/api/fund/convert/relay", { id: conversion.id, signature: "not a signature" }, { cookie }));
  assert.equal((await json(unsigned)).code, "INVALID_SIGNATURE");
});

test("the relay goes through the door, asks USDC whether the terms were spent, and sends to the router that takes USDC", () => {
  const relay = readFileSync("app/api/fund/convert/relay/route.ts", "utf8");
  assert.match(relay, /alreadySpent\(record\.account, record\.nonce, undefined, USDC_ADDRESS\)/);
  assert.match(relay, /relayExit\(\{\s+router,/);
  assert.ok(relay.indexOf("await claimExitRelay(id)") < relay.indexOf("await admitRelay(request, auth.account)"), "one attempt holds the row before the relayer is asked");
  assert.ok(relay.indexOf("await admitRelay(request, auth.account)") < relay.indexOf("relayExit({"));
  const prepare = readFileSync("app/api/fund/convert/prepare/route.ts", "utf8");
  assert.match(prepare, /kuruQuote\(\{ userAddress: router, tokenIn: USDC_ADDRESS, tokenOut: AUSD_ADDRESS, amount \}\)/, "the pair is fixed: never a general exchange");
  assert.match(prepare, /if \(floor < conversionFloor\(amount\)\)/);
  // The way out itself is carried exactly as before: its own router when nothing is said.
  assert.match(readFileSync("src/exit-relay.ts", "utf8"), /const address = input\.router \?\? exitRouterAddress\(\);/);
});

test("USDC that arrived is changed whole, before the chain's coin, and a failure is left alone for a pause", () => {
  const MON = CONVERSION_RESERVE + 40_000_000_000_000_000_000n;
  assert.deepEqual(nextFundingStep({ held: 0n, arriving: 0n, arrivingUsdc: 31_000_000n, wanted: AMOUNT }), { do: "convertUsdc", amount: 31_000_000n });
  assert.deepEqual(nextFundingStep({ held: 0n, arriving: MON, arrivingUsdc: 31_000_000n, wanted: AMOUNT }), { do: "convertUsdc", amount: 31_000_000n });
  assert.deepEqual(nextFundingStep({ held: AMOUNT, arriving: 0n, arrivingUsdc: 31_000_000n, wanted: AMOUNT }), { do: "give" }, "enough already: nothing is changed");
  assert.deepEqual(nextFundingStep({ held: 0n, arriving: 0n, arrivingUsdc: 999_999n, wanted: AMOUNT }), { do: "wait", sawSomething: true }, "under a dollar, nothing");
  assert.deepEqual(nextFundingStep({ held: 0n, arriving: 0n, arrivingUsdc: 31_000_000n, wanted: AMOUNT, failedAtMs: 1_000, nowMs: 2_000 }), { do: "wait", sawSomething: true });
  assert.deepEqual(nextFundingStep({ held: 0n, arriving: 0n, arrivingUsdc: 31_000_000n, wanted: AMOUNT, failedAtMs: 1_000, nowMs: 1_000 + RETRY_PAUSE_MS }), { do: "convertUsdc", amount: 31_000_000n });
});
