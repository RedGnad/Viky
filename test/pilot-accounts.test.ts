import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { IndexedGift } from "../src/envio-index";
import { between, FOUNDER_TEST_ACCOUNTS, founderAccounts, shortOf, usageOf } from "../src/pilot-accounts";

/**
 * "Who has used Viky" on the judges page (the audit of 1 Oct 2026, D-08; the founder, 2 Oct 2026): the count is made
 * from the index's gifts and tells the founder's own test accounts from everybody else's, so one person testing is
 * never read as people using it.
 */

const FOUNDER = FOUNDER_TEST_ACCOUNTS[0];
const FOUNDER_TWO = FOUNDER_TEST_ACCOUNTS[3];
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

test("the founder's accounts are five whole addresses, compared in one case, with the deployment's operator accounts beside them", () => {
  assert.equal(FOUNDER_TEST_ACCOUNTS.length, 5);
  for (const account of FOUNDER_TEST_ACCOUNTS) assert.match(account, /^0x[0-9a-f]{40}$/);
  assert.equal(new Set(FOUNDER_TEST_ACCOUNTS).size, 5);
  const all = founderAccounts(["0xabcdef0123456789abcdef0123456789abcdef01", "not an account"]);
  assert.equal(all.size, 6);
  assert.ok(all.has("0xabcdef0123456789abcdef0123456789abcdef01"));
  assert.equal(shortOf(ANNA), "0x3D14…0Eec");
});

test("a gift is between two others, from the founder to another, from another to the founder, or the founder's own try", () => {
  const founders = founderAccounts();
  assert.equal(between({ funder: ANNA, recipient: BEN }, founders), "two others");
  assert.equal(between({ funder: FOUNDER, recipient: ANNA }, founders), "founder to another");
  assert.equal(between({ funder: ANNA, recipient: FOUNDER_TWO.toUpperCase().replace("0X", "0x") }, founders), "another to founder");
  assert.equal(between({ funder: FOUNDER, recipient: FOUNDER_TWO }, founders), "the founder's own try");
  // Nobody opened it yet: it is judged by who funded it, and never counted as somebody else's use.
  assert.equal(between({ funder: FOUNDER, recipient: null }, founders), "the founder's own try");
  assert.equal(between({ funder: ANNA, recipient: null }, founders), "two others");
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
  assert.deepEqual(usage.between, { "two others": 1, "founder to another": 1, "another to founder": 0, "the founder's own try": 2 });
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
