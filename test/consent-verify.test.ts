import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { contractsToVerify, heldAt, PUBLISHED_CONTRACTS, type AnchoredEntry } from "../src/consent-verify";

/**
 * What `pnpm verify:consent` decides once it has read the anchor (the audit of 1 Oct 2026, section 3.7): which yes or
 * stop held at the moment of a reading. The reading of the chain itself runs against the real contracts in the fork
 * rehearsal (scripts/rehearse-v2-fork.ts, step 6).
 */

const DIGEST = `0x${"ab".repeat(32)}` as const;
const entry = (sequence: number, kind: AnchoredEntry["kind"], anchoredAt: number, stands = true): AnchoredEntry => ({ sequence, kind, anchoredAt, digest: DIGEST, stands });

test("a reading is held by the latest yes or stop anchored by its moment, and by nothing before the first", () => {
  const entries = [entry(0, "yes", 100), entry(1, "stop", 200), entry(2, "yes", 300)];
  assert.equal(heldAt(entries, 99), "nothing", "before the first yes");
  assert.equal(heldAt(entries, 100), "yes", "the block of the yes itself");
  assert.equal(heldAt(entries, 150), "yes");
  assert.equal(heldAt(entries, 250), "stop", "a reading after a stop is not covered by the yes before it");
  assert.equal(heldAt(entries, 300), "yes", "agreeing again covers again");
  assert.equal(heldAt([], 1_000), "nothing");
});

test("an entry the bound key did not sign counts for nothing: neither a yes it would give, nor a stop it would lift", () => {
  // A yes nobody signed, written by whoever holds the relayer's key: it covers no reading.
  assert.equal(heldAt([entry(0, "yes", 100, false)], 150), "nothing");
  // And such a yes after a real stop does not lift the stop.
  assert.equal(heldAt([entry(0, "yes", 100), entry(1, "stop", 200), entry(2, "yes", 300, false)], 350), "stop");
  // A stop nobody signed does not end a real yes either: only the person's own key says stop.
  assert.equal(heldAt([entry(0, "yes", 100), entry(1, "stop", 200, false)], 250), "yes");
  // A kind the contract does not know is nothing.
  assert.equal(heldAt([entry(0, "unknown", 100)], 150), "nothing");
});

test("with nothing named, the command reads the published contracts: a clone with nothing set needs a Monad RPC and nothing else", () => {
  // It stopped there until 8 Oct 2026 ("Nothing to verify"), in the very clone a judge copies the line into.
  assert.equal(contractsToVerify({ anchor: null, daily: [], milestone: null }), PUBLISHED_CONTRACTS);
  // The published contracts are the ones docs/CONTRACTS.md names, row by row: the anchor, the milestone contract of
  // the second version, and the two daily contracts opened by a link, the second version then the third.
  const table = readFileSync("docs/CONTRACTS.md", "utf8");
  const row = (name: string) => table.match(new RegExp(`^\\| \`${name}\`[^|]*\\| \`(0x[0-9a-fA-F]{40})\` \\|$`, "m"))?.[1];
  assert.equal(PUBLISHED_CONTRACTS.anchor, row("ConsentAnchor"));
  assert.equal(PUBLISHED_CONTRACTS.milestone, row("MilestoneGiftV2"));
  assert.deepEqual(PUBLISHED_CONTRACTS.daily, [row("GiftEscrowV2"), row("GiftEscrowV3")]);
  // And the document says what the command needs and what it printed the day it ran on mainnet.
  assert.match(table, /it needs a Monad RPC and nothing else: with\nno address named it reads the contracts of the table above/);
  assert.match(table, /`PASSED: 5 gifts, every reading that moved money was taken under a yes anchored before it\.`/);
  assert.doesNotMatch(table, /never on mainnet/);
});

test("what is named is read alone: no published contract is added to a run that names its own", () => {
  const anchor = "0x00000000000000000000000000000000000000A1";
  const daily = "0x00000000000000000000000000000000000000D1";
  // A rehearsal on a fork names its three: the real third daily contract is not read against the rehearsal's anchor.
  assert.deepEqual(contractsToVerify({ anchor, daily: [daily], milestone: null }), { anchor, daily: [daily], milestone: null });
  // A deployment's settings name the second daily contract and the third: both are read, one after the other.
  assert.deepEqual(contractsToVerify({ anchor, daily: [daily, anchor], milestone: daily })?.daily, [daily, anchor]);
  // An anchor with no gift contract, or a gift contract with no anchor: nothing to verify, and the command says so.
  assert.equal(contractsToVerify({ anchor, daily: [], milestone: null }), null);
  assert.equal(contractsToVerify({ anchor: null, daily: [daily], milestone: null }), null);
  const script = readFileSync("scripts/verify-consent.ts", "utf8");
  assert.match(script, /if \(!contracts\) \{\n    throw new Error\("Nothing to verify: an address is named and the anchor, or every gift contract, is not\./);
  // `--daily` names every daily contract read; without it, the settings of the second and third versions.
  assert.match(script, /if \(named !== undefined\) return named\.split\(","\)/);
  assert.match(script, /\["NEXT_PUBLIC_GIFT_ESCROW_V2_ADDRESS", "NEXT_PUBLIC_GIFT_ESCROW_V3_ADDRESS"\]/);
});

test("a gift made today, on the third daily contract, is read: the daily contracts are passed one after the other", () => {
  const script = readFileSync("scripts/verify-consent.ts", "utf8");
  assert.match(script, /for \(const \[kind, contract\] of \[\.\.\.contracts\.daily\.map\(\(daily\) => \["daily", daily\] as const\), \["milestone", contracts\.milestone\] as const\]\)/);
  const reads = readFileSync("src/consent-verify.ts", "utf8");
  // Every log of every daily contract is looked at, and the logs asked of the chain are those of all of them.
  assert.match(reads, /logs: from\(contracts\.daily\) as Log\[\]/);
  assert.match(reads, /const address = \[\.\.\.contracts\.daily, contracts\.milestone\]/);
  // The page of the judges says which gifts the line it gives covers.
  assert.match(readFileSync("app/judges/JudgesMera.tsx", "utf8"), /for every gift of the second version and of the third daily contract, the key/);
});
