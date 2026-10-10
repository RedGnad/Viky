import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { IndexedGift } from "../src/envio-index";
import { creditedAccountsOf } from "../src/judge-credit";
import { between, countOfFounderAccounts, FOUNDER_TEST_ACCOUNTS, founderAccounts, shortOf, usageOf } from "../src/pilot-accounts";

/**
 * "Who has used Viky" on the judges page (the audit of 1 Oct 2026, D-08; the founder, 2 Oct 2026): the count is made
 * from the index's gifts and tells the founder's own test accounts from everybody else's, so one person testing is
 * never read as people using it.
 */

const FOUNDER = FOUNDER_TEST_ACCOUNTS[0];
const FOUNDER_TWO = FOUNDER_TEST_ACCOUNTS[2];
/** The account that opened gift 1: an outside person's, the first who tried Viky (the founder, 10 Oct 2026). */
const FIRST_TESTER = "0x91c964e745ffd6265c75df33ca9137d81c3c454d";
const ANNA = "0x3d14a79d4798f1ede23df9779d1a75cce9940eec";
const BEN = "0x9f30f9514361bcd2f56ad690a30e794fb9b0b81d";

function gift(over: Partial<IndexedGift>): IndexedGift {
  return {
    contract: "0x8dc281ac8a1c789fdb65a063b9225e98ec522f0e",
    giftId: "1000000",
    kind: "milestone",
    version: 1,
    status: "reached",
    funder: FOUNDER,
    recipient: null,
    amount: 3_010_000n,
    fundedAmount: 3_010_000n,
    amountEarned: 0n,
    amountWithdrawn: 0n,
    amountRefunded: 0n,
    createdInTransaction: `0x${"ab".repeat(32)}`,
    createdAt: "2026-09-28T22:10:18+00:00",
    ...over,
  };
}

test("the founder's accounts are four whole addresses, compared in one case, with the deployment's operator accounts beside them", () => {
  assert.equal(FOUNDER_TEST_ACCOUNTS.length, 4);
  for (const account of FOUNDER_TEST_ACCOUNTS) assert.match(account, /^0x[0-9a-f]{40}$/);
  assert.equal(new Set(FOUNDER_TEST_ACCOUNTS).size, 4);
  const all = founderAccounts(["0xabcdef0123456789abcdef0123456789abcdef01", "not an account"]);
  assert.equal(all.size, 5);
  assert.ok(all.has("0xabcdef0123456789abcdef0123456789abcdef01"));
  assert.equal(shortOf(ANNA), "0x3D14…0Eec");
});

test("a gift is between two others, from the founder to another, from another to the founder, or the founder's own try", () => {
  const founders = founderAccounts();
  assert.equal(between({ funder: ANNA, recipient: BEN }, founders), "two others");
  assert.equal(between({ funder: FOUNDER, recipient: ANNA }, founders), "founder to another");
  assert.equal(between({ funder: ANNA, recipient: FOUNDER_TWO.toUpperCase().replace("0X", "0x") }, founders), "another to founder");
  assert.equal(between({ funder: FOUNDER, recipient: FOUNDER_TWO }, founders), "the founder's own try");
  // Nobody opened it yet: a class of its own, whoever funded it. It is nobody's use of a gift, and never "between two".
  assert.equal(between({ funder: FOUNDER, recipient: null }, founders), "not opened yet");
  assert.equal(between({ funder: ANNA, recipient: null }, founders), "not opened yet");
});

test("the count: gifts, who funded and who opened them, what was earned and what went back, and the founder's tries apart", () => {
  const usage = usageOf(
    [
      gift({ giftId: "1", kind: "daily", funder: FOUNDER_TEST_ACCOUNTS[1], recipient: FOUNDER_TEST_ACCOUNTS[2], fundedAmount: 20_000_000n, amountEarned: 2_857_142n, amountRefunded: 17_142_858n }),
      gift({ giftId: "1000001", recipient: null, fundedAmount: 1_000_000n }),
      gift({ giftId: "1000004", recipient: ANNA, amountEarned: 3_010_000n }),
      gift({ giftId: "1000005", funder: ANNA, recipient: BEN, amountEarned: 3_010_000n, version: 2 }),
    ],
    founderAccounts(),
  );
  assert.equal(usage.gifts, 4);
  assert.equal(usage.opened, 3);
  assert.equal(usage.funded, 27_020_000n);
  assert.equal(usage.earned, 8_877_142n);
  assert.equal(usage.sentBack, 17_142_858n);
  assert.deepEqual(usage.funders, { all: 3, founders: 2 });
  assert.deepEqual(usage.recipients, { all: 3, founders: 1 });
  // The gift nobody opened is counted apart: it was one of the founder's own tries, by its funder alone.
  assert.deepEqual(usage.between, { "paid from a judge credit": 0, "two others": 1, "founder to another": 1, "another to founder": 0, "the founder's own try": 1, "not opened yet": 1 });
  assert.equal(usage.fromJudgeCredit, 0);
  assert.equal(usage.onSecondVersion, 1);
  assert.equal(usage.onThirdVersion, 0);
  // A gift on the third daily contract is counted there, and with neither the first version's nor the second's (the
  // advisor, 4 Oct 2026: the index read every version that was not 2 as 1).
  const withTheThird = usageOf([gift({ giftId: "1000", kind: "daily", version: 3 }), gift({ giftId: "4", kind: "daily", version: 2 }), gift({ giftId: "3", kind: "daily", version: 1 })], founderAccounts());
  assert.deepEqual([withTheThird.onSecondVersion, withTheThird.onThirdVersion, withTheThird.gifts], [1, 1, 3]);
  const who = readFileSync("app/judges/JudgesWhoUsed.tsx", "utf8");
  assert.match(who, /usage\.onThirdVersion > 0 \? `\$\{count\(usage\.onThirdVersion, "is", "are"\)\} on the third daily contract` : null,/);
  // Nothing indexed is nothing counted, not an error.
  assert.equal(usageOf([], founderAccounts()).gifts, 0);
});

test("a gift paid by an account the judge code credited is counted apart, and its accounts with it (the final audit of 9 Oct 2026)", () => {
  // The one credit given so far paid a rehearsal: a new account funded a gift the founder's account opened. Counted
  // with the rest, the page read it as "from somebody else to the founder", and its funder as an outside person; and
  // every judge who follows the page's own path adds two accounts and a gift "between two people".
  const JUDGE = "0x87383d8d34a15cc7039caf312943f265c31416fe";
  const JUDGE_SECOND = "0x00000000000000000000000000000000000000c3";
  const credited = creditedAccountsOf([
    { account: JUDGE.toUpperCase().replace("0X", "0x"), state: "sent" },
    { account: "0x00000000000000000000000000000000000000c4", state: "reserved" },
  ]);
  assert.deepEqual([...credited], [JUDGE], "the credits that were sent, in lower case, and no other line of the journal");
  const founders = founderAccounts();
  // First, whoever opened it and whether anybody did.
  assert.equal(between({ funder: JUDGE, recipient: FOUNDER }, founders, credited), "paid from a judge credit");
  assert.equal(between({ funder: JUDGE, recipient: JUDGE_SECOND }, founders, credited), "paid from a judge credit");
  assert.equal(between({ funder: JUDGE, recipient: null }, founders, credited), "paid from a judge credit");
  // What a credited account opened, somebody else paid for: it stays what it was.
  assert.equal(between({ funder: ANNA, recipient: JUDGE }, founders, credited), "two others");
  // With nobody credited nothing changes.
  assert.equal(between({ funder: JUDGE, recipient: FOUNDER }, founders), "another to founder");

  const gifts = [
    gift({ giftId: "1", kind: "daily", funder: FOUNDER, recipient: FOUNDER_TWO, fundedAmount: 20_000_000n }),
    gift({ giftId: "1000005", funder: ANNA, recipient: BEN, fundedAmount: 5_000_000n }),
    gift({ giftId: "1000009", funder: JUDGE, recipient: FOUNDER, fundedAmount: 3_000_000n }),
    gift({ giftId: "1000010", funder: JUDGE, recipient: JUDGE_SECOND, fundedAmount: 3_000_000n }),
  ];
  const before = usageOf(gifts, founders);
  assert.deepEqual([before.funders, before.recipients], [{ all: 3, founders: 1 }, { all: 4, founders: 2 }], "counted with the rest, a judge is two outside people");
  const usage = usageOf(gifts, founders, credited);
  // Every gift and all the money are still said; the accounts are those of the gifts no credit paid for.
  assert.equal(usage.gifts, 4);
  assert.equal(usage.funded, 31_000_000n);
  assert.equal(usage.fromJudgeCredit, 2);
  assert.deepEqual(usage.funders, { all: 2, founders: 1 });
  assert.deepEqual(usage.recipients, { all: 2, founders: 1 });
  assert.deepEqual(usage.between, { "paid from a judge credit": 2, "two others": 1, "founder to another": 0, "another to founder": 0, "the founder's own try": 1, "not opened yet": 0 });
  assert.equal(Object.values(usage.between).reduce((sum, one) => sum + one, 0), usage.gifts, "each gift in exactly one class");
});

test("the judges page reads the journal of credits once, shows no count when it cannot, and prints the list's length", () => {
  const page = readFileSync("app/judges/page.tsx", "utf8");
  assert.equal(page.match(/creditedByTheJudgeCode\(\)/g)?.length, 1, "read once, for the two blocks");
  assert.match(page, /const credited = judgeCredit \? await creditedByTheJudgeCode\(\)\.catch\(\(\) => null\) : new Set<string>\(\);/);
  assert.match(readFileSync("src/judge-credit.ts", "utf8"), /return creditedAccountsOf\(await loadJudgeCredits\(\)\);/);
  assert.match(page, /<JudgesWhoUsed index=\{index\} credited=\{credited\} \/>/);
  const who = readFileSync("app/judges/JudgesWhoUsed.tsx", "utf8");
  // No journal, no count: who was credited is not known, and a judge's try would be read as somebody's use.
  assert.match(who, /if \(!credited\) \{[\s\S]*?data-who-used="credits-unread"[\s\S]*?So no count is shown here rather than one that would take a judge&apos;s try\s+for somebody&apos;s use\./);
  assert.match(who, /Paid from a judge credit: \{usage\.between\["paid from a judge credit"\]\}\./);
  assert.match(who, /credited\.has\(one\) \? "credited by the judge code" : "not the founder's"/);
  const minute = readFileSync("app/judges/JudgesMinute.tsx", "utf8");
  assert.match(minute, /\{usage\.fromJudgeCredit === 1 \? "was" : "were"\} paid from a judge credit and\{" "\}\s+\{usage\.fromJudgeCredit === 1 \? "is" : "are"\} counted apart\. \{others === 1 \? "The other was" : `The \$\{others\} others were`\} funded by/);
  assert.match(minute, /"The journal of judge credits could not be read just now, so no count is given here: "/);
  // Each count carries its own share that is not the founder's, in the founder's words of 10 Oct 2026.
  const said = minute.replace(/\s+/g, " ");
  assert.ok(said.includes(`{count(usage.funders.all, "account", "accounts")}, {usage.funders.all - usage.funders.founders} of them not the founder&apos;s, and opened by {usage.recipients.all}, {usage.recipients.all - usage.recipients.founders} of them not his. {formatAusd(usage.earned)} earned, {formatAusd(usage.sentBack)} gone back. Counted from the index as this page is served:`));
  assert.doesNotMatch(said, /of which/);
  // "the four listed" is the list's own length, never a word typed beside it.
  assert.equal(countOfFounderAccounts(), "four");
  assert.match(who, /they are the\{" "\}\s+\{countOfFounderAccounts\(\)\} listed in <code>src\/pilot-accounts\.ts<\/code>/);
  assert.doesNotMatch(who, /they are the (four|five)/);
});

test("the first tester is nobody's test account: who opened gift 1 is counted with the people outside (the founder, 10 Oct 2026)", () => {
  // The account that opened gift 1 and did its lesson on 12 Sep 2026 stood in the founder's list until 10 Oct 2026.
  assert.equal(FOUNDER_TEST_ACCOUNTS.includes(FIRST_TESTER), false);
  assert.equal(founderAccounts().has(FIRST_TESTER), false);
  // Gift 1 as the index holds it: funded by one of the founder's accounts, opened by that person.
  const first = gift({ giftId: "1", kind: "daily", funder: FOUNDER_TEST_ACCOUNTS[1], recipient: FIRST_TESTER, fundedAmount: 20_000_000n, amountEarned: 2_857_142n, amountRefunded: 17_142_858n });
  assert.equal(between(first, founderAccounts()), "founder to another");
  const usage = usageOf([first, gift({ giftId: "1000005", funder: ANNA, recipient: BEN })], founderAccounts());
  assert.deepEqual(usage.funders, { all: 2, founders: 1 });
  assert.deepEqual(usage.recipients, { all: 2, founders: 0 });
  // A deployment that still names that account as an operator's counts it as the founder's: the setting is read
  // beside the list, and it is the deployment's to change.
  assert.equal(between(first, founderAccounts([FIRST_TESTER])), "the founder's own try");
});
