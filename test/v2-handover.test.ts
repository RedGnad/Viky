import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Hex } from "viem";
import { handoverProblems, type AnchorRead, type GiftContractRead, type HandoverExpected } from "../src/v2-handover";

/**
 * What the hand-over check holds the three new contracts to before the app is told where they are (the review of
 * 2 Oct 2026, R-05, and its delta re-read): the Safe owns them, and nothing the deploying key could do meanwhile
 * was left behind, a pause of readings and another anchorer included.
 */
const SAFE = "0x00000000000000000000000000000000000005AF" as Hex;
const DEPLOYER = "0x0000000000000000000000000000000000000DE9" as Hex;
const SIGNER = "0x00000000000000000000000000000000000051C2" as Hex;
const RELAYER = "0x0000000000000000000000000000000000002E1A" as Hex;
const OTHER = "0x000000000000000000000000000000000000B0b0" as Hex;
const NOBODY = "0x0000000000000000000000000000000000000000" as Hex;
const NOW = Date.UTC(2026, 9, 10, 9, 0, 0) / 1_000;
const DAY = 86_400;

const expected: HandoverExpected = { owner: SAFE, signer: SIGNER, relayer: RELAYER, nowSeconds: NOW };
const daily: GiftContractRead = {
  name: "GiftEscrowV2",
  target: "escrow-v2",
  pauseAction: "checkin-paused",
  address: "0x00000000000000000000000000000000000000d1",
  owner: SAFE,
  pendingOwner: NOBODY,
  evidenceSigner: SIGNER,
  pendingEvidenceSigner: NOBODY,
  pausedUntil: 0n,
  creationPaused: false,
  nextGiftId: 4n,
  replaces: [
    { name: "the daily contract", address: "0x00000000000000000000000000000000000000a1", nextGiftId: 4n, creationPaused: true },
    { name: "the earlier daily contract", address: "0x00000000000000000000000000000000000000a0", nextGiftId: 2n, creationPaused: true },
  ],
};
const milestone: GiftContractRead = {
  ...daily,
  name: "MilestoneGiftV2",
  target: "milestone-v2",
  pauseAction: "proof-paused",
  address: "0x00000000000000000000000000000000000000d2",
  nextGiftId: 1_000_006n,
  replaces: [{ name: "the milestone contract", address: "0x00000000000000000000000000000000000000a2", nextGiftId: 1_000_006n, creationPaused: true }],
};
const anchor: AnchorRead = { name: "ConsentAnchor", address: "0x00000000000000000000000000000000000000d3", owner: SAFE, pendingOwner: NOBODY, anchorer: RELAYER };

const problemsOf = (gifts: readonly GiftContractRead[] = [daily, milestone], anchored: AnchorRead = anchor, at: HandoverExpected = expected) => handoverProblems(at, gifts, anchored).problems;

test("three contracts as the deployment left them, accepted by the Safe: nothing to put right", () => {
  assert.deepEqual(handoverProblems(expected, [daily, milestone], anchor), { problems: [], notes: [] });
  // Addresses are compared whatever their letters' case.
  assert.deepEqual(problemsOf([{ ...daily, owner: SAFE.toLowerCase() as Hex, evidenceSigner: SIGNER.toLowerCase() as Hex }, milestone], { ...anchor, anchorer: RELAYER.toLowerCase() as Hex }), []);
});

test("before the Safe accepts, or while the ownership is offered elsewhere, each of the three is named", () => {
  const early = problemsOf([{ ...daily, owner: DEPLOYER, pendingOwner: SAFE }, { ...milestone, owner: DEPLOYER, pendingOwner: SAFE }], { ...anchor, owner: DEPLOYER, pendingOwner: SAFE });
  assert.equal(early.filter((problem) => problem.includes("The Safe has not accepted it yet")).length, 3);
  assert.equal(early.filter((problem) => problem.includes(`still offered to ${SAFE}`)).length, 3);
  assert.match(problemsOf([{ ...daily, pendingOwner: OTHER }, milestone])[0], new RegExp(`GiftEscrowV2: its ownership is still offered to ${OTHER}`));
});

test("a signer that waits, or another one in place, is named", () => {
  assert.match(problemsOf([{ ...daily, pendingEvidenceSigner: OTHER }, milestone])[0], new RegExp(`GiftEscrowV2: an evidence signer is waiting, ${OTHER}`));
  // Announced and applied before the acceptance: nothing waits any more, and the signer in place is what shows it.
  assert.match(problemsOf([daily, { ...milestone, evidenceSigner: OTHER }])[0], new RegExp(`MilestoneGiftV2: its evidence signer is ${OTHER}, not ${SIGNER}`));
});

test("a pause sent before the hand-over is named for as long as it leaves the Safe without its brake", () => {
  // Sent by the deploying key and still running: the Safe can end it, and cannot send another for a week after.
  const running = problemsOf([{ ...daily, pausedUntil: BigInt(NOW + 3 * DAY) }, milestone]);
  assert.equal(running.length, 1);
  assert.match(running[0], /^GiftEscrowV2: a pause of its readings was sent, which nobody sends on a new contract on purpose\. It runs until 2026-10-13T09:00:00\.000Z, and the Safe cannot pause this contract before 2026-10-20T09:00:01\.000Z/);
  assert.match(running[0], /the Safe can end the pause: ACTION=checkin-paused PAUSED=false TARGET=escrow-v2/);
  // Sent for a second and ended a minute ago: the same week without the brake.
  const flicked = problemsOf([daily, { ...milestone, pausedUntil: BigInt(NOW - 60) }]);
  assert.match(flicked[0], /^MilestoneGiftV2: a pause of its readings was sent.* It ended at 2026-10-10T08:59:00\.000Z, and the Safe cannot pause this contract before 2026-10-17T08:59:01\.000Z/);
  assert.doesNotMatch(flicked[0], /the Safe can end the pause/);
  // To the second: the contract refuses a pause until seven days after the end, that second included.
  assert.equal(problemsOf([{ ...daily, pausedUntil: BigInt(NOW - 7 * DAY) }, milestone]).length, 1);
  const rested = handoverProblems(expected, [{ ...daily, pausedUntil: BigInt(NOW - 7 * DAY - 1) }, milestone], anchor);
  assert.deepEqual(rested.problems, []);
  assert.match(rested.notes[0], /GiftEscrowV2: a pause of its readings was sent and ended at .* Its rest is over: the Safe can pause it again/);
});

test("an anchor that names another address than the relayer is named, with the action that puts it right", () => {
  const wrong = problemsOf([daily, milestone], { ...anchor, anchorer: OTHER });
  assert.deepEqual(wrong, [`ConsentAnchor: its anchorer is ${OTHER}, not the relayer ${RELAYER}. No agreement would ever be written down, and nothing else would fail. The Safe names the relayer: ACTION=anchorer VALUE=${RELAYER} TARGET=anchor`]);
});

test("creation closed on a new contract, open on one it replaces, and a numbering that starts behind are named", () => {
  assert.match(problemsOf([{ ...daily, creationPaused: true }, milestone])[0], /GiftEscrowV2: creation is closed on it, and the deployment had opened it\. The Safe opens it: ACTION=creation-paused PAUSED=false TARGET=escrow-v2/);
  const reopened = problemsOf([{ ...daily, replaces: [daily.replaces[0], { ...daily.replaces[1], creationPaused: false }] }, milestone]);
  assert.match(reopened[0], /GiftEscrowV2: creation is open on the earlier daily contract 0x00000000000000000000000000000000000000a0, which it replaces/);
  assert.match(problemsOf([daily, { ...milestone, nextGiftId: 1_000_005n }])[0], /MilestoneGiftV2: its next gift is 1000005, behind 1000006 on the contract it replaces: two gifts would carry one number/);
  // A gift made on the new contract by somebody speaking to it directly is worth knowing, and is not a fault.
  const ahead = handoverProblems(expected, [{ ...daily, nextGiftId: 6n }, milestone], anchor);
  assert.deepEqual(ahead.problems, []);
  assert.match(ahead.notes[0], /GiftEscrowV2: 2 gift\(s\) were already made on it, by somebody speaking to the contract itself/);
});

test("the script reads each of these on the chain, asks for the relayer by name, and prints the settings last", () => {
  const script = readFileSync("scripts/check-v2-handover.ts", "utf8");
  for (const view of ["owner", "pendingOwner", "pendingEvidenceSigner", "evidenceSigner", "checkInPausedUntil", "proofPausedUntil", "creationPaused", "nextGiftId", "anchorer"]) {
    assert.match(script, new RegExp(`view\\("${view}", `), view);
  }
  assert.match(script, /relayer: named\("RELAYER_ADDRESS"\)/);
  // The moment is the chain's own, so a rehearsal that moved the fork's clock is judged by that clock.
  assert.match(script, /nowSeconds: Number\(\(await client\.getBlock\(\)\)\.timestamp\)/);
  assert.match(script, /replaced\("the daily contract", GIFT_ESCROW\), await replaced\("the earlier daily contract", EARLIER_GIFT_ESCROW\)/);
  assert.match(script, /replaced\("the milestone contract", MILESTONE_GIFT\)/);
  assert.ok(script.indexOf("if (problems.length > 0)") < script.indexOf("console.log(`${contract.setting}=${contract.address}`)"));
  // The deployment prints the command with the relayer it was given, and the rehearsal walks the new readings.
  const deploy = readFileSync("scripts/deploy-v2.ts", "utf8");
  assert.match(deploy, /EVIDENCE_SIGNER_ADDRESS=\$\{evidenceSigner\} RELAYER_ADDRESS=\$\{anchorer\} pnpm check:v2-handover/);
  const rehearsal = readFileSync("scripts/rehearse-v2-fork.ts", "utf8");
  assert.match(rehearsal, /RELAYER_ADDRESS: relayer\.address, \.\.\.said/);
  assert.match(rehearsal, /an anchor that names another address than the relayer is said, and no setting is printed/);
  assert.match(rehearsal, /once a pause was sent, the hand-over check says the contract has no brake until its rest is over/);
  // And the rehearsal names the contracts in service itself, so it runs in a checkout that holds no env file.
  assert.match(rehearsal, /process\.env\.GIFT_ESCROW_ADDRESS = GIFT_ESCROW;\n\s*process\.env\.MILESTONE_GIFT_ADDRESS = MILESTONE_GIFT;/);
});
