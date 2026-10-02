// A gift is opened by the person it is for (the audit of 1 Oct 2026): the account that made it is refused on both
// contracts' paths before anything is relayed, and an opening the contract holds is written down when the database
// missed it. A database and no network.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after, before } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { privateKeyToAccount } from "viem/accounts";
import { ACCOUNT_AUTH_COOKIE_NAME, createAccountAuthChallenge, issueAccountAuthSession } from "../src/account-auth-server";
import { POST as claimPost } from "../app/api/gift/claim/route";
import { GiftApiError } from "../src/gift-api";
import { configureGiftStore, ensureGiftSchema, loadGift, loadGiftForClaim, markClaimed, newClaimToken, reconcileClaim, saveGift } from "../src/gift-store";
import { milestoneClaim } from "../src/milestone-routes";
import type { SqlExecutor } from "../src/proof-session-store";

const ORIGIN = "https://viky.test";
const ENV = { SESSION_SIGNING_SECRET: "test-account-session-secret-that-is-longer-than-32-bytes" };
const FUNDER = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const SOMEBODY = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const ESCROW = "0x00000000000000000000000000000000000000e1";

process.env.SESSION_SIGNING_SECRET = ENV.SESSION_SIGNING_SECRET;
process.env.GIFT_ESCROW_ADDRESS = ESCROW;
delete process.env.RELAYER_PRIVATE_KEY;

let db: PGlite;
const TOKEN = newClaimToken();

async function cookieFor(account: typeof FUNDER): Promise<string> {
  const challenge = createAccountAuthChallenge({ account: account.address, origin: ORIGIN, nonce: "0123456789abcdef0123456789abcdef", environment: ENV });
  const signature = await account.signMessage({ message: challenge.message });
  const session = await issueAccountAuthSession({ challenge: challenge.challenge, signature, origin: ORIGIN, environment: ENV });
  return `${ACCOUNT_AUTH_COOKIE_NAME}=${session.token}`;
}

function claim(giftId: string, cookie: string, from: string): Request {
  return new Request(`${ORIGIN}/api/gift/claim`, {
    method: "POST",
    headers: { origin: ORIGIN, host: "viky.test", "content-type": "application/json", "x-forwarded-for": from, cookie },
    body: JSON.stringify({ giftId, token: TOKEN }),
  });
}

before(async () => {
  db = new PGlite();
  const executor: SqlExecutor = async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    return (await db.query<Record<string, unknown>>(text, values)).rows;
  };
  configureGiftStore(executor);
  await ensureGiftSchema();
  for (const giftId of ["7", "8"]) {
    await saveGift({ giftId, funder: FUNDER.address, contactHash: `0x${"51".repeat(32)}`, claimToken: TOKEN, goalType: 1, dailyTarget: 10, durationDays: 7, amount: 25_000_000n, createdTx: `0x${"77".repeat(32)}`, escrow: ESCROW });
  }
});

after(async () => {
  configureGiftStore(undefined);
  await db.close();
});

test("the account that made a gift cannot open it: refused with what to do, and the link stays unused", async () => {
  const response = await claimPost(claim("7", await cookieFor(FUNDER), "10.0.2.1"));
  assert.equal(response.status, 409);
  const body = (await response.json()) as { code?: string; error?: string };
  assert.equal(body.code, "OWN_GIFT");
  assert.equal(body.error, "This is the gift you made. Send its link to the person it is for.");
  assert.equal((await loadGiftForClaim("7", TOKEN))?.giftId, "7", "nothing was opened");
  // Somebody else with the same link goes past this refusal: what stops them here is only that this test has no relayer.
  const other = await claimPost(claim("7", await cookieFor(SOMEBODY), "10.0.2.2"));
  assert.notEqual(((await other.json()) as { code?: string }).code, "OWN_GIFT");
  // And the refusal comes before anything is spent: before the relay is admitted and before the claim is signed.
  const route = readFileSync("app/api/gift/claim/route.ts", "utf8");
  // On both versions of the contracts: the second, opened by the link's own key, comes first in the route.
  assert.ok(route.indexOf("refuseOwnGift(known, auth.account)") < route.indexOf("admitWayOut(request, auth.account)"));
  assert.ok(route.indexOf("refuseOwnGift(gift, auth.account)") < route.lastIndexOf("admitWayOut(request, auth.account)"));
  assert.ok(route.indexOf("admitWayOut(request, auth.account)") < route.indexOf("refuseOwnGift(gift, auth.account)"), "two paths, each with its own refusal first");
});

test("a milestone gift refuses its own funder the same way, before its contract is asked anything", async () => {
  const record = (await loadGift("7"))!;
  await assert.rejects(
    () => milestoneClaim({ record, recipient: FUNDER.address }),
    (error: unknown) => error instanceof GiftApiError && error.code === "OWN_GIFT" && error.status === 409,
  );
});

test("an opening the contract holds and the database missed is written down when the gift is read", async () => {
  const record = (await loadGift("8"))!;
  assert.equal(record.recipient, null);
  // The contract names nobody: nothing is written.
  assert.equal((await reconcileClaim(record, null, null)).recipient, null);
  assert.equal((await loadGift("8"))!.recipient, null);
  // The contract names a recipient: the record takes it, and the link is no longer one that opens the gift.
  const mended = await reconcileClaim(record, SOMEBODY.address, null);
  assert.equal(mended.recipient, SOMEBODY.address.toLowerCase());
  assert.equal((await loadGift("8"))!.recipient, SOMEBODY.address.toLowerCase());
  assert.equal(await loadGiftForClaim("8", TOKEN), null);
  // The route's own writing, arriving after, adds the transaction and changes nobody.
  const tx = `0x${"ab".repeat(32)}` as const;
  assert.equal(await markClaimed("8", SOMEBODY.address, tx), true);
  assert.equal((await loadGift("8"))!.claimedTx, tx);
  assert.equal(await markClaimed("8", FUNDER.address, tx), false, "and a second claimant still finds it taken");
  assert.equal((await loadGift("8"))!.recipient, SOMEBODY.address.toLowerCase());
  // A record that already has its recipient is left alone, and a database that fails changes nothing.
  let written = 0;
  await reconcileClaim(mended, FUNDER.address, null, async () => ((written += 1), true));
  assert.equal(written, 0);
  const failed = await reconcileClaim(record, SOMEBODY.address, null, async () => {
    throw new Error("the database did not answer");
  });
  assert.equal(failed.recipient, null);
  // Both readings of a gift call it: the daily one and the milestone one.
  assert.match(readFileSync("src/gift-status.ts", "utf8"), /await reconcileClaim\(record, gift\.recipient,/);
  assert.match(readFileSync("src/milestone-routes.ts", "utf8"), /await reconcileClaim\(record, state\.recipient,/);
});
