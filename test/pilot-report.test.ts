import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildReport, fundingOf, groupOf, KURU_ROUTER, kindOfAccount, reportInWords, shortAccount, totalsOf, type Arrival, type PilotGift } from "../src/pilot-report";

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
});

const gift = (over: Partial<PilotGift>): PilotGift => ({
  gift: "1",
  condition: "duolingo-daily",
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

test("the command reads and never writes, and selects no name", () => {
  const script = readFileSync("scripts/pilot-report.ts", "utf8");
  assert.doesNotMatch(script, /INSERT|UPDATE |DELETE |ALTER |CREATE /, "read only");
  assert.doesNotMatch(script, /recipient_name|funder_name|goal_username|username|phone_number|external_id/, "no first name, no source account, no phone number");
  assert.doesNotMatch(script, /writeContract|sendTransaction|RELAYER_PRIVATE_KEY/, "nothing is sent to the chain");
  assert.equal(JSON.parse(readFileSync("package.json", "utf8")).scripts["pilot:report"], "tsx scripts/pilot-report.ts");
});
