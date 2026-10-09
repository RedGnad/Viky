import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { envioGraphqlUrl, heldPerContract, INDEX_TIMEOUT_MS, readIndex, versionOf } from "../src/envio-index";

/**
 * The index of the contracts' events, as the judges page reads it (the audit of 1 Oct 2026, D-14). One POST, cut at
 * four seconds, and nothing at the slightest doubt: the page then says the index could not be read instead of showing
 * a figure it cannot stand behind. The answers below have the shape the hosted index gave on 1 Oct 2026.
 */

const URL = "https://indexer.example/v1/graphql";
const MILESTONE = "0x8dc281ac8a1c789fdb65a063b9225e98ec522f0e";
const DAILY = "0x995ab09d8b20511d057e9e87d00fa1f41fc0e233";
const FUNDER = "0xb12e0c72209bd4becfdafa96a8f3e7ebc93b8376";
const OTHER = "0x3d14a79d4798f1ede23df9779d1a75cce9940eec";

const answer = {
  data: {
    _meta: [{ chainId: 143, progressBlock: 109_669_691, sourceBlock: 109_669_700 }],
    GlobalStat: [{ giftsCreated: 2, giftsClaimed: 2, daysEarned: 2, daysReturned: 5, milestonesReached: 1, amountEarned: "5010000", amountWithdrawn: "4010000", amountRefunded: "5000000", consentKeysBound: 1, yesAnchored: 2, stopsAnchored: 1, eventsIndexed: 129 }],
    Gift: [
      { contract: DAILY, giftId: "3", kind: "daily", version: 1, status: "finalised", funder: FUNDER, recipient: FUNDER, amount: "7000000", fundedAmount: "7000000", amountEarned: "2000000", amountWithdrawn: "1000000", amountRefunded: "5000000", createdInTransaction: `0x${"aa".repeat(32)}`, createdAt: "2026-09-20T10:00:00+00:00" },
      { contract: MILESTONE.toUpperCase().replace("0X", "0x"), giftId: "1000004", kind: "milestone", version: 2, status: "claimed", funder: FUNDER, recipient: OTHER.toUpperCase().replace("0X", "0x"), amount: "3010000", fundedAmount: "3010000", amountEarned: "3010000", amountWithdrawn: "3010000", amountRefunded: "0", createdInTransaction: `0x${"bb".repeat(32)}`, createdAt: "2026-09-28T22:10:18+00:00" },
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
  // Who funded a gift and who opened it, which version holds it, and what the anchor has written down.
  assert.match(String(calls[0].init.body), /Gift\(order_by: \{createdAt: asc\}, limit: 500\) \{ contract giftId kind version status funder recipient /);
  assert.deepEqual(index.gifts.map((gift) => [gift.version, gift.funder, gift.recipient, gift.amountEarned]), [[1, FUNDER, FUNDER, 2_000_000n], [2, FUNDER, OTHER, 3_010_000n]]);
  assert.deepEqual([index.totals.consentKeysBound, index.totals.yesAnchored, index.totals.stopsAnchored], [1, 2, 1]);
  // A gift nobody opened has no recipient, and that is an answer.
  const unopened = await readIndex(answering({ data: { ...answer.data, Gift: [{ ...answer.data.Gift[0], recipient: null }] } }).fetchImpl, URL);
  assert.equal(unopened?.gifts[0].recipient, null);
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
  const badFunder = { ...answer.data.Gift[0], funder: "javascript:alert(1)" };
  assert.equal(await readIndex(answering({ data: { ...answer.data, Gift: [badFunder] } }).fetchImpl, URL), null, "an account that is not one: it is printed and linked");
  // An index deployed before the anchor was indexed does not know its counters: nothing is shown rather than a guess.
  const older = Object.fromEntries(Object.entries(answer.data.GlobalStat[0]).filter(([name]) => name !== "consentKeysBound"));
  assert.equal(await readIndex(answering({ data: { ...answer.data, GlobalStat: [older] } }).fetchImpl, URL), null);
});

test("the judges page shows the index beside the chain, and says so when it cannot be read; no money path reads it", () => {
  const block = readFileSync("app/judges/JudgesIndex.tsx", "utf8");
  // Read once, in the page, for the two blocks that show it; each says so in a sentence when there is nothing.
  const page = readFileSync("app/judges/page.tsx", "utf8");
  assert.match(page, /const index = await readIndex\(\);/);
  assert.equal(page.match(/readIndex\(/g)?.length, 1);
  assert.match(block, /export async function JudgesIndex\(\{ index \}: Readonly<\{ index: IndexRead \| null \}>\) \{\s*if \(!index\) \{/);
  assert.match(block, /so no figure of it is shown here rather than\s+an old one/);
  assert.match(block, /functionName: "balanceOf"/, "the reconciliation is with the token's own balance");
  assert.match(block, /client\.getBlockNumber\(\)/, "the index's block is set beside the chain's head");
  assert.match(block, /https:\/\/monadvision\.com\/tx\/\$\{gift\.createdInTransaction\}/);
  assert.match(page, /<JudgesIndex index=\{index\} \/>/);
  assert.match(page, /<JudgesWhoUsed index=\{index\} credited=\{credited\} \/>/);
  // The index is read by the judges page and by nothing else: its blocks, and the counting of who used Viky.
  const users = execFileSync("grep", ["-rl", "envio-index", "app", "src"], { encoding: "utf8" }).trim().split("\n").sort();
  assert.deepEqual(users, ["app/judges/JudgesIndex.tsx", "app/judges/JudgesMera.tsx", "app/judges/JudgesMinute.tsx", "app/judges/JudgesWhoUsed.tsx", "app/judges/page.tsx", "src/pilot-accounts.ts"]);
  // An index that does not answer is a sentence on each block, never an error on the page (the founder, 2 Oct 2026):
  // the reading never throws, and no block prints anything of a failure.
  for (const file of ["app/judges/JudgesIndex.tsx", "app/judges/JudgesWhoUsed.tsx", "app/judges/JudgesMera.tsx", "app/judges/JudgesMinute.tsx"]) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /error\.message|catch \(error\)/, `${file} prints nothing of a failure`);
  }
  const who = readFileSync("app/judges/JudgesWhoUsed.tsx", "utf8");
  assert.match(who, /if \(!index\) \{[\s\S]*?data-who-used="unread"[\s\S]*?So no count is shown here\s+rather than an old one\./);
  assert.match(readFileSync("app/judges/JudgesMera.tsx", "utf8"), /How many are written there could not be read from the index just now\./);
  assert.match(readFileSync("app/judges/JudgesMinute.tsx", "utf8"), /The index of the contracts' events could not be read just now, so no count is given here: /);
  assert.match(readFileSync("src/envio-index.ts", "utf8"), /\} catch \{\s*return null;\s*\}\s*\}/, "the reading answers nothing, it never throws");
});

test("a gift's version is read as the index writes it: 1, 2 or 3, and anything else refuses the reading", () => {
  // Every version that was not 2 used to be read as 1 (the advisor, 4 Oct 2026): once the index reads the third daily
  // contract, its gifts would have been counted with the first version's on the judges page.
  assert.deepEqual([versionOf(1), versionOf(2), versionOf(3), versionOf("3")], [1, 2, 3, 3]);
  for (const other of [0, 4, -1, 2.5, null, undefined, "three"]) assert.throws(() => versionOf(other), `${String(other)} is no version`);
  const source = readFileSync("src/envio-index.ts", "utf8");
  assert.match(source, /version: versionOf\(gift\.version\),/);
  assert.doesNotMatch(source, /=== 2 \? 2 : 1/);
  // The judges' minute names the contracts a gift is made on today: the third daily one once it is set.
  const page = readFileSync("app/judges/page.tsx", "utf8");
  assert.match(page, /thirdVersionSet\n\s*\? \{ daily: giftEscrowV3Address\(\), milestone: milestoneV2, anchor, version: 3 \}/);
  assert.match(readFileSync("app/judges/JudgesMinute.tsx", "utf8"), /contracts\.version === 3\n\s*\? "A gift is made on these today: the daily one is the third version of its contract, the two others the second; the earlier contracts are under "/);
});
