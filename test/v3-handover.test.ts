import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Hex } from "viem";
import { DAILY_GOALS } from "../src/daily-goals";
import { GOAL_NUMBERS, type GoalsHeld } from "../src/v2-handover";
import { numberingProblems, thirdHandoverProblems, type EarlierDaily, type ThirdDailyRead } from "../src/v3-handover";

/**
 * What the hand-over check holds the third daily contract to before the app is told where it is (3 Oct 2026): the Safe
 * owns it, nothing the deploying key could do meanwhile was left behind, and no number it gives out is one an earlier
 * daily contract gives out too.
 */
const SAFE = "0x00000000000000000000000000000000000005AF" as Hex;
const DEPLOYER = "0x0000000000000000000000000000000000000DE9" as Hex;
const SIGNER = "0x00000000000000000000000000000000000051C2" as Hex;
const OTHER = "0x000000000000000000000000000000000000B0b0" as Hex;
const NOBODY = "0x0000000000000000000000000000000000000000" as Hex;
const NOW = Date.UTC(2026, 9, 8, 9, 0, 0) / 1_000;
const NO_PROVIDER = `0x${"0".repeat(64)}` as Hex;

const held = (): GoalsHeld => ({ providers: Array.from({ length: GOAL_NUMBERS }, (_unused, index) => DAILY_GOALS.find((goal) => goal.goalType === index + 1)?.providerId ?? NO_PROVIDER) });
const SECOND: EarlierDaily = { name: "the second version's daily contract", address: "0x00000000000000000000000000000000000000d2", nextGiftId: 5n, creationPaused: true };
const FIRST: EarlierDaily = { name: "the first version's daily contract", address: "0x00000000000000000000000000000000000000a1", nextGiftId: 4n, creationPaused: true };
const expected = { owner: SAFE, signer: SIGNER, nowSeconds: NOW };
const third: ThirdDailyRead = {
  name: "GiftEscrowV3",
  target: "escrow-v3",
  pauseAction: "checkin-paused",
  address: "0x00000000000000000000000000000000000000e3",
  owner: SAFE,
  pendingOwner: NOBODY,
  evidenceSigner: SIGNER,
  pendingEvidenceSigner: NOBODY,
  pausedUntil: 0n,
  creationPaused: false,
  nextGiftId: 5n,
  schemaId: 3,
  earlier: [SECOND, FIRST],
  goals: held(),
  register: DAILY_GOALS,
};
const problemsOf = (over: Partial<ThirdDailyRead> = {}) => thirdHandoverProblems(expected, { ...third, ...over }).problems;

test("the third contract as the deployment left it, accepted by the Safe, its numbering continued: nothing to put right", () => {
  assert.deepEqual(thirdHandoverProblems(expected, third), { problems: [], notes: [] });
});

test("it is held to what the second version's contracts were: the Safe's, no signer waiting, no pause sent, creation open", () => {
  assert.match(problemsOf({ owner: DEPLOYER, pendingOwner: SAFE }).join("\n"), /its owner is .+, not the Safe .+\. The Safe has not accepted it yet\n.+its ownership is still offered to/);
  assert.match(problemsOf({ pendingEvidenceSigner: OTHER })[0], /an evidence signer is waiting/);
  assert.match(problemsOf({ evidenceSigner: OTHER })[0], /its evidence signer is .+, not /);
  assert.match(problemsOf({ pausedUntil: BigInt(NOW + 3_600) })[0], /a pause of its readings was sent.+ACTION=checkin-paused PAUSED=false TARGET=escrow-v3/);
  assert.match(problemsOf({ creationPaused: true })[0], /creation is closed on it.+TARGET=escrow-v3/);
  // And it is the third contract, by what it answers itself.
  assert.match(problemsOf({ schemaId: 2 })[0], /it answers schema 2, and the third daily contract answers 3/);
});

test("the numbering never meets an earlier contract's: continued with creation closed behind it, or started further on", () => {
  // Continued, and the second version still open: its next gift would take the third's first number.
  assert.match(problemsOf({ earlier: [{ ...SECOND, creationPaused: false }, FIRST] })[0], /creation is open on the second version's daily contract .+, whose next gift takes 5, a number this contract gives out too\. The Safe closes it first/);
  // Behind an earlier contract: two gifts would carry one number, open or not.
  assert.match(problemsOf({ nextGiftId: 4n })[0], /its next gift is 4, behind 5 on the second version's daily contract/);
  // Started further on, with the second version left open behind it: said, and nothing to put right.
  const apart = thirdHandoverProblems(expected, { ...third, nextGiftId: 100n, earlier: [{ ...SECOND, creationPaused: false }, FIRST] });
  assert.deepEqual(apart.problems, []);
  assert.deepEqual(apart.notes, ["the second version's daily contract 0x00000000000000000000000000000000000000d2 still makes gifts: 95 number(s) are left before its numbering meets this contract's, at gift 100. It is closed before then"]);
  // Never inside the milestone numbering.
  assert.match(numberingProblems("GiftEscrowV3", 1_000_000n, [SECOND]).problems[0], /inside the milestone numbering/);
  assert.deepEqual(numberingProblems("GiftEscrowV3", 999_999n, [SECOND]).problems, []);
});

test("every goal is the register's, and there is no other", () => {
  const rogue = held();
  const withRogue = { providers: rogue.providers.map((provider, index) => (index === 200 ? (`0x${"ab".repeat(32)}` as Hex) : provider)) };
  assert.match(problemsOf({ goals: withRogue })[0], /goal 201 is registered .+ and the register holds no goal 201\. A goal is added and never changed/);
  const first = DAILY_GOALS[0].goalType;
  const missing = { providers: rogue.providers.map((provider, index) => (index === first - 1 ? NO_PROVIDER : provider)) };
  assert.match(problemsOf({ goals: missing })[0], new RegExp(`goal ${first} of the register is not registered`));
});

test("the deployment refuses what the hand-over would name, and reads everything it relies on from the chain", () => {
  const script = readFileSync("scripts/deploy-v3.ts", "utf8");
  // The second version is set, the Safe owns its daily contract, the signer is its own and no other waits there.
  assert.match(script, /for \(const name of SECOND_VERSION_SETTINGS\) required\(name\);/);
  assert.match(script, /if \(ownedBy !== owner\) throw new Error\(`Refusing to deploy: OWNER_ADDRESS is/);
  assert.match(script, /if \(signedBy !== evidenceSigner\) throw new Error\(`Refusing to deploy: EVIDENCE_SIGNER_ADDRESS is/);
  assert.match(script, /if \(!NOBODY\.test\(waiting\)\) throw new Error\(`Refusing to deploy: an evidence signer is announced/);
  // The numbering is the hand-over's own rule, asked before anything is sent.
  assert.match(script, /const numbering = numberingProblems\("GiftEscrowV3", firstGiftId, earlier\);\n\s*if \(numbering\.problems\.length > 0 && !dryRun\) throw new Error/);
  assert.match(script, /const firstGiftId = asked \? BigInt\(asked\) : continues;/);
  // No private key of the evidence signer, and a local node is a rehearsal or nothing.
  assert.ok(!script.includes("EVIDENCE_SIGNER_PRIVATE_KEY"));
  assert.match(script, /const transport = scriptTransport\(rpc, rehearsal\);/);
  // What it prints to do next is the Safe tool's own target and the check's own name.
  assert.match(script, /ACTION=accept-ownership TARGET=escrow-v3 TARGET_ADDRESS=\$\{at\} pnpm safe:action/);
  assert.match(script, /pnpm check:v3-handover/);
  const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts as Record<string, string>;
  assert.equal(scripts["deploy:v3"], "tsx scripts/deploy-v3.ts");
  assert.equal(scripts["check:v3-handover"], "tsx scripts/check-v3-handover.ts");
});
