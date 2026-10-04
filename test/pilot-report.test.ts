import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildReport, fundingOf, groupOf, heldBy, KURU_ROUTER, kindOfAccount, reportInWords, shortAccount, totalsOf, type Arrival, type PilotGift } from "../src/pilot-report";

/**
 * The pilot's report (the founder, 1 Oct 2026): what each gift did, and totals nobody can inflate. The founder's
 * accounts and the accounts a judge code credited are kept apart from testers, and nobody is named.
 */

const FOUNDER = "0x00000000000000000000000000000000000f0001";
const JUDGE = "0x000000000000000000000000000000000000a11c";
const TESTER = "0x0000000000000000000000000000000000007e57";
const OTHER = "0x00000000000000000000000000000000000b0b00";
const ESCROW = "0x995ab09d8b20511d057e9e87d00fa1f41fc0e233";
const founders = new Set([FOUNDER]);
const judged = new Set([JUDGE]);

const arrival = (from: string, txFrom: string, coin: "AUSD" | "USDC" = "AUSD"): Arrival => ({ coin, units: 25_000_000n, from, txFrom, txTo: from, hash: "0xabc" });
const paid = (input: Partial<Parameters<typeof fundingOf>[0]>) =>
  fundingOf({ funder: TESTER, arrivals: [], judgeCreditBefore: false, giftContracts: new Set([ESCROW]), vikyAccounts: new Set([OTHER]), hours: 2, ...input });

test("how a gift was paid is read from what reached the account, and says what it was read from", () => {
  assert.deepEqual(paid({ arrivals: [arrival(KURU_ROUTER, TESTER)] }), { how: "card", service: "Mercuryo", basis: "the chain's own coin, changed by the account itself through the exchange just before the gift" });
  assert.equal(paid({ arrivals: [arrival(KURU_ROUTER, OTHER)] }).how, "received", "the exchange paying out in somebody else's transaction is not this account's card");
  assert.deepEqual(paid({ arrivals: [arrival(ESCROW, OTHER)] }), { how: "balance", basis: "money back from an earlier gift" });
  assert.deepEqual(paid({}), { how: "balance", basis: "nothing reached the account in the 2 hours before the gift" });
  assert.deepEqual(paid({ arrivals: [arrival(OTHER, OTHER)] }), { how: "received", from: "0x0000…0b00", basis: "sent by another Viky account" });
  assert.equal(paid({ arrivals: [arrival("0x00000000000000000000000000000000000dead0", OTHER)] }).basis, "sent by an address Viky does not know");
  assert.equal(paid({ judgeCreditBefore: true }).how, "judge credit");
  assert.equal(paid({ judgeCreditBefore: true, arrivals: [arrival(OTHER, OTHER)] }).how, "judge credit", "a credited account's gift is never passed off as a tester's");
  assert.equal(paid({ judgeCreditBefore: true, arrivals: [arrival(KURU_ROUTER, TESTER)] }).how, "card", "unless its own card payment is what the chain shows");
  // What a gift holds coming out of Viky's own converter is a card's USDC being changed: Rampnow's way in, and never
  // "an address Viky does not know" (the gifts of 3 Oct 2026 on the second and third versions read so).
  const CONVERTER = "0xf05449c8b868Ce1e6a0D7223e2ceCbbfD1498F9c";
  assert.deepEqual(paid({ arrivals: [arrival(CONVERTER.toLowerCase(), OTHER)], converter: CONVERTER }), { how: "card", service: "Rampnow", basis: "USDC, which only its card payment delivers here, changed by Viky's converter just before the gift" });
  assert.equal(paid({ arrivals: [arrival(CONVERTER.toLowerCase(), OTHER)] }).how, "received", "a run that does not know the converter says only what it read");
  const script = readFileSync("scripts/pilot-report.ts", "utf8");
  assert.match(script, /converter: USDC_ROUTER \}\),/);
  // A conversion is written where a way out is, and takes nothing out: it is not counted as money taken out by card.
  assert.match(script, /FROM viky_exits WHERE state = 'sent'`\)\)\.filter\(\(row\) => String\(row\.token_out\)\.toLowerCase\(\) !== AUSD_ADDRESS\.toLowerCase\(\)\);/);
});

const gift = (over: Partial<PilotGift>): PilotGift => ({
  gift: "1",
  condition: "duolingo-daily",
  heldBy: { kind: "daily", version: 1 },
  funder: { account: shortAccount(TESTER), kind: "tester" },
  recipient: { account: shortAccount(OTHER), kind: "tester" },
  put: "20.00",
  earned: "5.00",
  returned: "15.00",
  createdAt: "2026-09-11T00:00:00.000Z",
  funding: { how: "balance", basis: "x" },
  openedAt: "2026-09-11T02:00:00.000Z",
  connectedAt: "2026-09-11T03:00:00.000Z",
  firstCountedAt: "2026-09-11T12:00:00.000Z",
  readings: { attested: 3, daysEarned: 2, daysReturned: 5, looks: 0 },
  outcome: "partly earned",
  out: [],
  ...over,
});

test("every gift is in one group only, and the founder and judge accounts never count as testers", () => {
  assert.equal(kindOfAccount(FOUNDER.toUpperCase().replace("0X", "0x"), founders, judged), "founder", "whatever the case of the account");
  assert.equal(kindOfAccount(JUDGE, founders, judged), "judge");
  assert.equal(kindOfAccount(TESTER, founders, judged), "tester");
  const founder = { account: shortAccount(FOUNDER), kind: "founder" as const };
  const judge = { account: shortAccount(JUDGE), kind: "judge" as const };
  assert.equal(groupOf(gift({})), "testers");
  assert.equal(groupOf(gift({ funder: founder })), "founder to tester");
  assert.equal(groupOf(gift({ funder: founder, recipient: founder })), "founder only");
  assert.equal(groupOf(gift({ funder: founder, recipient: null })), "founder only", "a gift of his nobody opened");
  assert.equal(groupOf(gift({ recipient: founder })), "founder only", "a gift made to him is not a tester's result");
  assert.equal(groupOf(gift({ funder: judge })), "judge credit");
  assert.equal(groupOf(gift({ recipient: judge })), "judge credit");
  assert.equal(groupOf(gift({ funding: { how: "judge credit", basis: "x" } })), "judge credit");
  assert.equal(groupOf(gift({ funder: founder, funding: { how: "judge credit", basis: "x" } })), "judge credit");
});

test("the totals count people and money once, and average only what happened", () => {
  const flow = { route: "send" as const, dollars: "2.00", at: "2026-09-25T00:00:00.000Z" };
  const totals = totalsOf([
    gift({ gift: "1", out: [flow] }),
    gift({ gift: "2", put: "10.00", earned: "0.00", returned: "10.00", openedAt: "2026-09-11T04:00:00.000Z", firstCountedAt: null, out: [flow, { route: "bank exit", dollars: "10.00", at: "2026-09-16T00:00:00.000Z" }] }),
    gift({ gift: "3", recipient: null, put: "1.00", earned: "0.00", returned: "0.00", openedAt: null, firstCountedAt: null }),
  ]);
  assert.deepEqual([totals.gifts, totals.funders, totals.recipients], [3, 1, 1], "one funder, one recipient, three gifts");
  assert.deepEqual([totals.put, totals.earned, totals.returned], ["31.00", "5.00", "25.00"]);
  assert.equal(totals.hoursToOpen, 3, "two gifts were opened, after 2 and 4 hours");
  assert.equal(totals.hoursToFirstCount, 12, "one gift had a counted reading");
  assert.deepEqual(totals.out, { "bank exit": 1, "card exit": 0, send: 1, "gift card": 0, "top-up": 0 }, "the same send, seen under two gifts of one account, is one send");
  assert.equal(totalsOf([]).hoursToOpen, null);
});

test("the report names nobody: gift numbers and abbreviated accounts, in words and in JSON", () => {
  const report = buildReport({
    readAt: "2026-10-01T04:00:00.000Z",
    founderAccounts: [FOUNDER],
    judgeAccounts: [JUDGE],
    gifts: [gift({}), gift({ gift: "2", funder: { account: shortAccount(FOUNDER), kind: "founder" } })],
  });
  assert.deepEqual(report.founderAccounts, ["0x0000…0001"]);
  assert.equal(report.groups.testers.gifts, 1);
  assert.equal(report.groups["founder to tester"].gifts, 1);
  assert.equal(report.groups["judge credit"].gifts, 0);
  assert.equal(report.gifts.reduce((sum, one) => sum + (one.group ? 1 : 0), 0), 2);
  const words = reportInWords(report);
  const json = JSON.stringify(report);
  for (const text of [words, json]) {
    assert.doesNotMatch(text, /0x[0-9a-fA-F]{40}/, "no whole account");
    assert.doesNotMatch(text, /@|username|recipient_name|funder_name/i);
  }
  assert.match(words, /Each gift is in one group only\. The groups are never added together\./);
  assert.match(words, /Testers' own gifts[^\n]*\n  1 gift\(s\), 1 funder\(s\), 1 recipient\(s\)\./);
  assert.match(words, /Gift 1, duolingo-daily: \$20\.00, partly earned\. Group: testers\./);
  // With no founder account given, the report says the separation rests on nothing.
  assert.match(reportInWords(buildReport({ readAt: "2026-10-01T04:00:00.000Z", founderAccounts: [], judgeAccounts: [], gifts: [] })), /none given, so nothing below is separated from him/);
});

test("each gift is counted under the version of the contract that holds it, within its group, and an unknown contract is no version", () => {
  const EARLIER = "0xE04CD59bB93765333200a9da01df83149D4C4d67";
  const V2 = "0xC83d8028347967Fc84D0e36Ae5876d9b29EAEc51";
  const V3 = "0x591d76863177E70FfcA2C793212d4715A367Ec70";
  const MILESTONE = "0x8dc281Ac8a1c789fdb65a063b9225E98eC522F0e";
  const MILESTONE_V2 = "0x493c87A27E637bBc7179C17bE2B215fC18523CC0";
  const all = { daily: [EARLIER, ESCROW, V2, V3], milestone: [MILESTONE, MILESTONE_V2] };
  // The first daily contract has two addresses, the earlier and the current: both are the first version.
  assert.deepEqual(heldBy(EARLIER, all), { kind: "daily", version: 1 });
  assert.deepEqual(heldBy(ESCROW.toUpperCase().replace("0X", "0x"), all), { kind: "daily", version: 1 }, "whatever the case of the address");
  assert.deepEqual(heldBy(V2, all), { kind: "daily", version: 2 });
  assert.deepEqual(heldBy(V3, all), { kind: "daily", version: 3 });
  assert.deepEqual(heldBy(MILESTONE, all), { kind: "milestone", version: 1 });
  assert.deepEqual(heldBy(MILESTONE_V2, all), { kind: "milestone", version: 2 });
  // A run that was not told the third version's address does not know its gifts: never read as the first version's.
  const withoutTheThird = { daily: [EARLIER, ESCROW, V2, null], milestone: [MILESTONE, MILESTONE_V2] };
  assert.equal(heldBy(V3, withoutTheThird), null);
  assert.deepEqual(heldBy(V2, withoutTheThird), { kind: "daily", version: 2 });
  assert.equal(heldBy(V2, { daily: [EARLIER, ESCROW, null, null], milestone: [MILESTONE, null] }), null);
  const script = readFileSync("scripts/pilot-report.ts", "utf8");
  assert.match(script, /const holders = \{ daily: \[EARLIER_GIFT_ESCROW, GIFT_ESCROW, giftEscrowV2Address\(\), giftEscrowV3Address\(\)\], milestone: \[MILESTONE_GIFT, milestoneGiftV2Address\(\)\] \};/);
  assert.match(script, /if \(!held\) \{\n\s*throw new Error\(`Gift \$\{id\} is on a contract this run does not know/);
  assert.match(script, /const milestone = held\.kind === "milestone";/, "a milestone of the second version is read as a milestone");

  // The count, within a group: the founder's gifts and a tester's are never added together.
  const founder = { account: shortAccount(FOUNDER), kind: "founder" as const };
  const report = buildReport({
    readAt: "2026-10-04T00:00:00.000Z",
    founderAccounts: [FOUNDER],
    judgeAccounts: [],
    gifts: [
      gift({ gift: "1" }),
      gift({ gift: "4", heldBy: { kind: "daily", version: 2 } }),
      gift({ gift: "1000012", heldBy: { kind: "milestone", version: 2 } }),
      gift({ gift: "1000", heldBy: { kind: "daily", version: 3 }, funder: founder, recipient: founder }),
    ],
  });
  assert.deepEqual(report.groups.testers.byVersion, { 1: 1, 2: 2, 3: 0 });
  assert.deepEqual(report.groups["founder only"].byVersion, { 1: 0, 2: 0, 3: 1 });
  assert.deepEqual(totalsOf([]).byVersion, { 1: 0, 2: 0, 3: 0 });
  const words = reportInWords(report);
  assert.match(words, /Testers' own gifts[^\n]*\n(  [^\n]*\n)*  By version of the contracts: 1 on the first, 2 on the second, 0 on the third\./);
  assert.match(words, /The founder's own tries[^\n]*\n(  [^\n]*\n)*  By version of the contracts: 0 on the first, 0 on the second, 1 on the third\./);
  assert.match(words, /Gift 1000, duolingo-daily: [^\n]*\n  Held by the third version of the daily contract\./);
  assert.match(words, /Gift 1000012, duolingo-daily: [^\n]*\n  Held by the second version of the milestone contract\./);
});

test("the command reads and never writes, and selects no name", () => {
  const script = readFileSync("scripts/pilot-report.ts", "utf8");
  assert.doesNotMatch(script, /INSERT|UPDATE |DELETE |ALTER |CREATE /, "read only");
  assert.doesNotMatch(script, /recipient_name|funder_name|goal_username|username|phone_number|external_id/, "no first name, no source account, no phone number");
  assert.doesNotMatch(script, /writeContract|sendTransaction|RELAYER_PRIVATE_KEY/, "nothing is sent to the chain");
  assert.equal(JSON.parse(readFileSync("package.json", "utf8")).scripts["pilot:report"], "tsx scripts/pilot-report.ts");
});
