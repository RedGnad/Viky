import assert from "node:assert/strict";
import test from "node:test";
import { decodeFunctionData, encodeFunctionData, getAddress, hexToBigInt, keccak256, sliceHex, stringToHex, type Abi, type Hex } from "viem";
import { giftEscrowAbi } from "../src/gift-escrow-abi";
import { milestoneGiftAbi } from "../src/milestone-gift-abi";
import { MILESTONE_GOALS } from "../src/milestone-goals";
import { SHAPE_HAVE_OR_NOT } from "../src/milestone-protocol";
import { MULTI_SEND_CALL_ONLY, multiSendData, safeCall, safeMultiSendCallOnly, safeTxHash } from "../src/safe";
import { DAILY_SESSION_GOALS } from "../scripts/safe-session";

/**
 * The goals' session as one Safe transaction (D194): a delegate call to Safe's canonical MultiSendCallOnly 1.4.1,
 * built in one place, with the eleven calls packed as the library reads them. The hash pinned below is the one the
 * founder signs at nonce 7; it was read back from the Safe's own `getTransactionHash` on Monad on 23 Sep 2026, and the
 * batch was rehearsed from the Safe's address without a revert (672,256 gas for the calls alone).
 */
const SAFE = getAddress("0xE08D926c148A5065F4Df2892702785a183de86F9");
const MILESTONE = getAddress("0x8dc281Ac8a1c789fdb65a063b9225E98eC522F0e");
const ESCROW = getAddress("0x995Ab09d8B20511d057E9E87D00fa1f41fC0e233");

/**
 * Goal 22, a Udemy course finished (D178), was in the session signed on 23 Sep 2026 and left the register on 28 Sep
 * 2026 (a course is marked finished by its own account): the session is history, so its call is written out here.
 */
const UDEMY_GOAL_OF_THE_SESSION = { goalType: 22, providerId: keccak256(stringToHex("viky:provider:udemy-course-shown:v1")), shape: SHAPE_HAVE_OR_NOT };

function sessionCalls() {
  const goals = [...MILESTONE_GOALS.filter((goal) => goal.goalType >= 15 && goal.goalType <= 23), UDEMY_GOAL_OF_THE_SESSION].sort((one, other) => one.goalType - other.goalType);
  const milestone = goals.map((goal) => ({
    to: MILESTONE,
    data: encodeFunctionData({ abi: milestoneGiftAbi as unknown as Abi, functionName: "registerGoal", args: [goal.goalType, goal.providerId, goal.shape] }),
  }));
  const daily = DAILY_SESSION_GOALS.map((goal) => ({ to: ESCROW, data: encodeFunctionData({ abi: giftEscrowAbi as unknown as Abi, functionName: "registerGoal", args: [goal.goalType, goal.providerId] }) }));
  return [...milestone, ...daily];
}

/** Reads MultiSend's packed bytes back: operation, target, value, length, data, one after the other. */
function unpack(transactions: Hex): Array<{ operation: number; to: string; value: bigint; data: Hex }> {
  const out: Array<{ operation: number; to: string; value: bigint; data: Hex }> = [];
  let at = 0;
  const size = (transactions.length - 2) / 2;
  while (at < size) {
    const operation = Number(hexToBigInt(sliceHex(transactions, at, at + 1)));
    const to = getAddress(sliceHex(transactions, at + 1, at + 21));
    const value = hexToBigInt(sliceHex(transactions, at + 21, at + 53));
    const length = Number(hexToBigInt(sliceHex(transactions, at + 53, at + 85)));
    const data = length === 0 ? "0x" : sliceHex(transactions, at + 85, at + 85 + length);
    out.push({ operation, to, value, data: data as Hex });
    at += 85 + length;
  }
  return out;
}

test("the session is eleven plain calls, in the order of the nonces the table used to give them", () => {
  const calls = sessionCalls();
  assert.equal(calls.length, 11);
  const data = multiSendData(calls);
  const { args } = decodeFunctionData({ abi: [{ type: "function", name: "multiSend", stateMutability: "payable", inputs: [{ name: "transactions", type: "bytes" }], outputs: [] }], data });
  const inner = unpack(args[0] as Hex);
  assert.equal(inner.length, 11);
  for (const [index, call] of inner.entries()) {
    assert.equal(call.operation, 0, "never a delegate call inside the batch");
    assert.equal(call.value, 0n);
    assert.equal(call.to, calls[index].to);
    assert.equal(call.data, calls[index].data);
  }
  const goals = inner.map((call) => Number(decodeFunctionData({ abi: (call.to === ESCROW ? giftEscrowAbi : milestoneGiftAbi) as unknown as Abi, data: call.data }).args?.[0]));
  assert.deepEqual(goals, [15, 16, 17, 18, 19, 20, 21, 22, 23, 6, 4]);
});

test("the one delegate call goes to Safe's canonical MultiSendCallOnly, and its hash is the one the Safe computes", () => {
  const tx = safeMultiSendCallOnly(sessionCalls(), 7n);
  assert.equal(tx.to, MULTI_SEND_CALL_ONLY);
  assert.equal(tx.to, "0x9641d764fc13c8B624c04430C7356C1C7C8102e2");
  assert.equal(tx.operation, 1);
  assert.equal(tx.value, 0n);
  assert.equal(safeTxHash(SAFE, 143, tx), "0x8b90a99b778fe7b46119e2eaa5443d2300879f614fe22d83edf754d5fa222d99", "read back from Safe.getTransactionHash on Monad, 23 Sep 2026");
  assert.notEqual(safeTxHash(SAFE, 143, { ...safeCall(tx.to, tx.data, 7n) }), safeTxHash(SAFE, 143, tx), "the operation is part of what is signed");
  assert.throws(() => multiSendData([]), /no call/);
});
