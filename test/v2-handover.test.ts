import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Hex } from "viem";
import { DAILY_GOALS } from "../src/daily-goals";
import { MILESTONE_GOALS } from "../src/milestone-goals";
import { GOAL_NUMBERS, goalProblems, handoverProblems, type AnchorRead, type GiftContractRead, type GoalExpected, type GoalsHeld, type HandoverExpected } from "../src/v2-handover";

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

const NO_PROVIDER = `0x${"0".repeat(64)}` as Hex;
const ROGUE = `0x${"ab".repeat(32)}` as Hex;
/** A contract's 255 goal numbers as it holds them when exactly the register was registered. */
function held(register: readonly GoalExpected[], shaped: boolean): GoalsHeld {
  const providers = Array.from({ length: GOAL_NUMBERS }, (_unused, index) => register.find((goal) => goal.goalType === index + 1)?.providerId ?? NO_PROVIDER);
  const shapes = Array.from({ length: GOAL_NUMBERS }, (_unused, index) => register.find((goal) => goal.goalType === index + 1)?.shape ?? 0);
  return shaped ? { providers, shapes } : { providers };
}
/** The same, with one number changed. */
function withGoal(goals: GoalsHeld, goalType: number, change: Readonly<{ provider?: Hex; shape?: number }>): GoalsHeld {
  const providers = goals.providers.map((provider, index) => (index === goalType - 1 && change.provider ? change.provider : provider));
  const shapes = goals.shapes?.map((shape, index) => (index === goalType - 1 && change.shape !== undefined ? change.shape : shape));
  return shapes ? { providers, shapes } : { providers };
}

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
  goals: held(DAILY_GOALS, false),
  register: DAILY_GOALS,
};
const milestone: GiftContractRead = {
  ...daily,
  name: "MilestoneGiftV2",
  target: "milestone-v2",
  pauseAction: "proof-paused",
  address: "0x00000000000000000000000000000000000000d2",
  nextGiftId: 1_000_006n,
  replaces: [{ name: "the milestone contract", address: "0x00000000000000000000000000000000000000a2", nextGiftId: 1_000_006n, creationPaused: true }],
  goals: held(MILESTONE_GOALS, true),
  register: MILESTONE_GOALS,
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

test("every one of the 255 goal numbers is held to the register: a goal is added and never changed", () => {
  // The two registers as the deployment writes them: nothing to say.
  assert.deepEqual(goalProblems("GiftEscrowV2", held(DAILY_GOALS, false), DAILY_GOALS), []);
  assert.deepEqual(goalProblems("MilestoneGiftV2", held(MILESTONE_GOALS, true), MILESTONE_GOALS), []);
  assert.equal(GOAL_NUMBERS, 255);
  assert.ok(DAILY_GOALS.length > 0 && MILESTONE_GOALS.length > 0);

  // A number the register does not hold, written by the deploying key before the Safe accepted: there for good.
  const free = Array.from({ length: GOAL_NUMBERS }, (_unused, index) => index + 1).find((goalType) => !MILESTONE_GOALS.some((goal) => goal.goalType === goalType)) as number;
  const added = goalProblems("MilestoneGiftV2", withGoal(held(MILESTONE_GOALS, true), free, { provider: ROGUE, shape: 1 }), MILESTONE_GOALS);
  assert.deepEqual(added, [`MilestoneGiftV2: goal ${free} is registered (${ROGUE}, having it or not) and the register holds no goal ${free}. A goal is added and never changed: this contract cannot be put right. Set nothing, and deploy again`]);
  // The last number of all is read like the first.
  assert.equal(goalProblems("GiftEscrowV2", withGoal(held(DAILY_GOALS, false), 255, { provider: ROGUE }), DAILY_GOALS).length, 1);

  // A climb registered in the shape of a certificate: the whole gift on a single reading.
  const climb = MILESTONE_GOALS.find((goal) => goal.shape === 0) as (typeof MILESTONE_GOALS)[number];
  const reshaped = goalProblems("MilestoneGiftV2", withGoal(held(MILESTONE_GOALS, true), climb.goalType, { shape: 1 }), MILESTONE_GOALS);
  assert.deepEqual(reshaped, [`MilestoneGiftV2: goal ${climb.goalType} is registered as having it or not, and the register says a climb: it would pay a whole gift on a single reading. A goal is added and never changed: this contract cannot be put right. Set nothing, and deploy again`]);
  // The other way round is named too, without that clause.
  const certificate = MILESTONE_GOALS.find((goal) => goal.shape === 1) as (typeof MILESTONE_GOALS)[number];
  assert.match(goalProblems("MilestoneGiftV2", withGoal(held(MILESTONE_GOALS, true), certificate.goalType, { shape: 0 }), MILESTONE_GOALS)[0], /is registered as a climb, and the register says having it or not\. A goal is added/);

  // Another provider under a number of the register.
  const first = DAILY_GOALS[0];
  assert.deepEqual(goalProblems("GiftEscrowV2", withGoal(held(DAILY_GOALS, false), first.goalType, { provider: ROGUE }), DAILY_GOALS), [
    `GiftEscrowV2: goal ${first.goalType} is registered with the provider ${ROGUE}, and the register says ${first.providerId}. A goal is added and never changed: this contract cannot be put right. Set nothing, and deploy again`,
  ]);
  // A goal of the register that is missing is the one thing that can still be put right.
  assert.deepEqual(goalProblems("GiftEscrowV2", withGoal(held(DAILY_GOALS, false), first.goalType, { provider: NO_PROVIDER }), DAILY_GOALS), [`GiftEscrowV2: goal ${first.goalType} of the register is not registered. The owner can still add it, with the register's own provider`]);
  // A register that was not read whole is never taken for a clean one.
  assert.deepEqual(goalProblems("GiftEscrowV2", { providers: held(DAILY_GOALS, false).providers.slice(0, 200) }, DAILY_GOALS), ["GiftEscrowV2: its 255 goal numbers were not all read"]);

  // And the hand-over refuses on it, with everything else in order.
  assert.equal(problemsOf([daily, { ...milestone, goals: withGoal(milestone.goals, free, { provider: ROGUE, shape: 0 }) }]).length, 1);
});

test("the script reads each of these on the chain, asks for the relayer by name, and prints the settings last", () => {
  const script = readFileSync("scripts/check-v2-handover.ts", "utf8");
  for (const view of ["owner", "pendingOwner", "pendingEvidenceSigner", "evidenceSigner", "checkInPausedUntil", "proofPausedUntil", "creationPaused", "nextGiftId", "anchorer"]) {
    assert.match(script, new RegExp(`view\\("${view}", `), view);
  }
  assert.match(script, /relayer: named\("RELAYER_ADDRESS"\)/);
  // The 255 goal numbers of each contract, and their shapes on the milestone contract, against the two tables the
  // deployment registers.
  assert.match(script, /for \(let from = 1; from <= GOAL_NUMBERS; from \+= GOALS_AT_ONCE\)/);
  assert.match(script, /functionName: "goalProviders", args: \[goalType\]/);
  assert.match(script, /if \(shaped\) shapes\.push\([\s\S]*?functionName: "goalShapes", args: \[goalType\]/);
  assert.match(script, /\], false, DAILY_GOALS\),/);
  assert.match(script, /\], true, MILESTONE_GOALS\),/);
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
