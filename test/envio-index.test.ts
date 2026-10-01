import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { envioGraphqlUrl, heldPerContract, INDEX_TIMEOUT_MS, readIndex } from "../src/envio-index";

/**
 * The index of the contracts' events, as the judges page reads it (the audit of 1 Oct 2026, D-14). One POST, cut at
 * four seconds, and nothing at the slightest doubt: the page then says the index could not be read instead of showing
 * a figure it cannot stand behind. The answers below have the shape the hosted index gave on 1 Oct 2026.
 */

const URL = "https://indexer.example/v1/graphql";
const MILESTONE = "0x8dc281ac8a1c789fdb65a063b9225e98ec522f0e";
const DAILY = "0x995ab09d8b20511d057e9e87d00fa1f41fc0e233";

const answer = {
  data: {
    _meta: [{ chainId: 143, progressBlock: 109_669_691, sourceBlock: 109_669_700 }],
    GlobalStat: [{ giftsCreated: 2, giftsClaimed: 2, daysEarned: 2, daysReturned: 5, milestonesReached: 1, amountEarned: "5010000", amountWithdrawn: "4010000", amountRefunded: "5000000", eventsIndexed: 129 }],
    Gift: [
      { contract: DAILY, giftId: "3", kind: "daily", status: "finalised", amount: "7000000", fundedAmount: "7000000", amountWithdrawn: "1000000", amountRefunded: "5000000", createdInTransaction: `0x${"aa".repeat(32)}`, createdAt: "2026-09-20T10:00:00+00:00" },
      { contract: MILESTONE.toUpperCase().replace("0X", "0x"), giftId: "1000004", kind: "milestone", status: "claimed", amount: "3010000", fundedAmount: "3010000", amountWithdrawn: "3010000", amountRefunded: "0", createdInTransaction: `0x${"bb".repeat(32)}`, createdAt: "2026-09-28T22:10:18+00:00" },
    ],
  },
};

const answering = (body: unknown, status = 200) => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
};

test("the index is read by one POST, cut at four seconds, and every figure is taken as the units it is", async () => {
  const { fetchImpl, calls } = answering(answer);
  const index = await readIndex(fetchImpl, URL);
  assert.ok(index);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, URL);
  assert.equal(calls[0].init.method, "POST");
  assert.match(String(calls[0].init.body), /_meta \{ chainId progressBlock sourceBlock \}/);
  assert.ok(calls[0].init.signal instanceof AbortSignal, "the request carries its own limit");
  assert.equal(INDEX_TIMEOUT_MS, 4_000);
  assert.equal(index.block, 109_669_691);
  assert.equal(index.totals.giftsCreated, 2);
  assert.equal(index.totals.amountWithdrawn, 4_010_000n);
  assert.deepEqual(index.gifts.map((gift) => [gift.giftId, gift.kind, gift.status, gift.amount]), [["3", "daily", "finalised", 7_000_000n], ["1000004", "milestone", "claimed", 3_010_000n]]);
  assert.equal(index.gifts[1].contract, MILESTONE, "an address is compared in one case");
});

test("what the index says each contract holds is what was funded, less what was taken out and what was sent back", async () => {
  const index = await readIndex(answering(answer).fetchImpl, URL);
  const held = heldPerContract(index!.gifts);
  assert.equal(held.get(DAILY), 1_000_000n, "7.00 funded, 1.00 taken out, 5.00 sent back: one day still to take");
  assert.equal(held.get(MILESTONE), 0n);
  assert.equal(heldPerContract([]).size, 0);
});

test("at the slightest doubt it answers nothing, and never throws", async () => {
  // No setting, or one that is not an https address.
  assert.equal(envioGraphqlUrl({}), null);
  assert.equal(envioGraphqlUrl({ ENVIO_GRAPHQL_URL: " " }), null);
  assert.equal(envioGraphqlUrl({ ENVIO_GRAPHQL_URL: "http://indexer.example/v1/graphql" }), null);
  assert.equal(envioGraphqlUrl({ ENVIO_GRAPHQL_URL: "not an address" }), null);
  assert.equal(envioGraphqlUrl({ ENVIO_GRAPHQL_URL: ` ${URL} ` }), URL);
  const never = (async () => {
    throw new Error("must not be asked");
  }) as unknown as typeof fetch;
  assert.equal(await readIndex(never, null), null, "with no endpoint nothing is asked at all");

  // An endpoint that refuses, one that fails, one that answers errors, and answers of another shape.
  assert.equal(await readIndex(answering(answer, 500).fetchImpl, URL), null);
  assert.equal(await readIndex((async () => Promise.reject(new Error("timed out"))) as unknown as typeof fetch, URL), null);
  assert.equal(await readIndex(answering({ errors: [{ message: "field not found" }] }).fetchImpl, URL), null);
  assert.equal(await readIndex(answering({ data: { ...answer.data, _meta: [] } }).fetchImpl, URL), null, "no progress for this chain");
  assert.equal(await readIndex(answering({ data: { ...answer.data, _meta: [{ chainId: 1, progressBlock: 1, sourceBlock: 1 }] } }).fetchImpl, URL), null, "another chain's progress");
  assert.equal(await readIndex(answering({ data: { ...answer.data, GlobalStat: [] } }).fetchImpl, URL), null);
  const badGift = { ...answer.data.Gift[0], amount: "seven" };
  assert.equal(await readIndex(answering({ data: { ...answer.data, Gift: [badGift] } }).fetchImpl, URL), null, "an amount that is not units");
  const badHash = { ...answer.data.Gift[0], createdInTransaction: "0x12" };
  assert.equal(await readIndex(answering({ data: { ...answer.data, Gift: [badHash] } }).fetchImpl, URL), null, "a transaction that is not one: it would become a link");
});

test("the judges page shows the index beside the chain, and says so when it cannot be read; no money path reads it", () => {
  const block = readFileSync("app/judges/JudgesIndex.tsx", "utf8");
  assert.match(block, /const index = await readIndex\(\);\s*if \(!index\) \{/);
  assert.match(block, /so no figure of it is shown here rather than\s+an old one/);
  assert.match(block, /functionName: "balanceOf"/, "the reconciliation is with the token's own balance");
  assert.match(block, /client\.getBlockNumber\(\)/, "the index's block is set beside the chain's head");
  assert.match(block, /https:\/\/monadvision\.com\/tx\/\$\{gift\.createdInTransaction\}/);
  assert.match(readFileSync("app/judges/page.tsx", "utf8"), /<JudgesIndex \/>/);
  // The index is read by the judges page and by nothing else.
  const users = execFileSync("grep", ["-rl", "envio-index", "app", "src"], { encoding: "utf8" }).trim().split("\n").sort();
  assert.deepEqual(users, ["app/judges/JudgesIndex.tsx"]);
});
