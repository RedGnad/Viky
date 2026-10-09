import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ARRIVAL, BLOCK_TIME, creditedDayMon, dailyGiftMon, dollarsOf, FINALITY_GAP, missedDayMon, MON_PRICE, monWords, RELAYER_FEES } from "../src/measured";
import { stepOf } from "../scripts/relayer-fees";
import { giftEscrowAbi } from "../src/gift-escrow-abi";
import { milestoneGiftAbi } from "../src/milestone-gift-abi";
import { encodeFunctionData, type Abi } from "viem";

/**
 * The figures the judges page states for Agora's and Mera's bounties (the founder, 2 Oct 2026: only figures read on
 * the chain or at the provider, with their date). They are typed in from a command's output, so these tests hold what
 * can be held without the chain: each figure has its date and its command, the sums are the sums, and each step named
 * is a function the relayer can really call.
 */

test("every measure carries when it was read, and the fees name the command that reads them again", () => {
  assert.match(RELAYER_FEES.readAt, /^\d{1,2} [A-Z][a-z]{2} 20\d\d, \d\d:\d\d UTC$/);
  assert.match(MON_PRICE.readAt, /^\d{1,2} [A-Z][a-z]{2} 20\d\d, \d\d:\d\d UTC$/);
  assert.match(BLOCK_TIME.readOn, /^\d{1,2} [A-Z][a-z]{2} 20\d\d$/);
  assert.match(FINALITY_GAP.readOn, /^\d{1,2} [A-Z][a-z]{2} 20\d\d$/);
  assert.match(ARRIVAL.measuredOn, /^\d{1,2} [A-Z][a-z]{2} 20\d\d$/);
  assert.equal(JSON.parse(readFileSync("package.json", "utf8")).scripts["relayer:fees"], "tsx scripts/relayer-fees.ts");
  assert.equal(RELAYER_FEES.command, "pnpm relayer:fees");
  assert.equal(BLOCK_TIME.to - BLOCK_TIME.from, BLOCK_TIME.blocks);
  for (const step of RELAYER_FEES.steps) assert.match(step.averageMon, /^\d+\.\d{6}$/, step.step);
  // The steps do not add up to more transactions than the account sent.
  assert.ok(RELAYER_FEES.steps.reduce((sum, step) => sum + step.sent, 0) <= RELAYER_FEES.transactions);
});

test("each step measured is a function of the contracts, named by the fee script from the transaction's own data", () => {
  const abis = [...(giftEscrowAbi as unknown as Abi), ...(milestoneGiftAbi as unknown as Abi)];
  const named = new Set(abis.filter((item) => item.type === "function").map((item) => (item as { name: string }).name));
  for (const step of RELAYER_FEES.steps) {
    if (step.step === "transferWithAuthorization") continue;
    assert.ok(named.has(step.step), `${step.step} is a function of a gift contract`);
  }
  assert.equal(stepOf(encodeFunctionData({ abi: giftEscrowAbi, functionName: "drain", args: [3n] })), "drain");
  assert.equal(stepOf(encodeFunctionData({ abi: milestoneGiftAbi, functionName: "expire", args: [1_000_000n] })), "expire");
  assert.equal(stepOf("0x"), "a plain send of MON");
  assert.equal(stepOf("0xdeadbeef00"), "unknown 0xdeadbeef");
  // The plain send from one account to another is the token's signed transfer, the one app/api/send/route.ts relays.
  assert.equal(stepOf("0xcf092995" + "00".repeat(32)), "transferWithAuthorization");
});

test("what a gift costs is the sum of its measured steps, and a fraction of a cent is printed as one", () => {
  assert.equal(monWords(creditedDayMon()), "0.017544 MON");
  assert.equal(monWords(missedDayMon()), "0.027433 MON", "settled, 0.008772, and sent back, 0.018661");
  // Made, opened, seven days, one withdrawal, closed.
  assert.equal(monWords(dailyGiftMon(7)), "0.202979 MON");
  assert.equal(dailyGiftMon(7) - dailyGiftMon(6), creditedDayMon());
  assert.equal(dollarsOf(creditedDayMon(), 0.03373142), "$0.0006");
  assert.equal(dollarsOf(dailyGiftMon(7), 0.03373142), "$0.0068");
  assert.equal(dollarsOf(1_000_000n, 2), "$2.0000");
});

test("the path from a link to a first transaction is two gestures, held by the browser test that counts them", () => {
  // One press and the device's prompt since 8 Oct 2026: "Open my gift" makes the account, then opens the gift.
  assert.deepEqual(ARRIVAL.gestures, ["Press Open my gift", "Answer the device's passkey prompt, a face or a fingerprint"]);
  const spec = readFileSync("test/browser/arrival-measure.spec.ts", "utf8");
  assert.match(spec, /expect\(gestures\.length, [^)]*\)\.toBe\(2\);/);
  const { linkShown, accountMade, giftOpened } = ARRIVAL.seconds;
  // The opening follows the account with nothing pressed: on these screens, inside the same tenth of a second.
  assert.ok(linkShown > 0 && accountMade > linkShown && giftOpened >= accountMade, "the three moments were measured, in order");
  assert.match(readFileSync("app/judges/JudgesMera.tsx", "utf8").replace(/\s+/g, " "), /from the press to the account made, and the gift opened \{giftOpened > accountMade \? `\$\{seconds\(giftOpened - accountMade\)\} later` : "within the same tenth of a second"\}, with no second press\./);
  assert.equal(Math.max(...ARRIVAL.runs), giftOpened, "the run given moment by moment is the slowest of them");
  // The page says what those seconds are, and what is not in them.
  const block = readFileSync("app/judges/JudgesMera.tsx", "utf8").replace(/\s+/g, " ");
  assert.ok(block.includes("with a virtual passkey that answers at once and the gift&apos;s answers stood in"));
  assert.ok(block.includes("Not measured: a real phone on a real network."));
});
