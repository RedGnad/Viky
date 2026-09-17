import assert from "node:assert/strict";
import test from "node:test";
import { encodeAbiParameters, encodeEventTopics, type Abi, type Log } from "viem";
import { settledDaysFromLogs } from "../src/day-record";
import { giftEscrowAbi } from "../src/gift-escrow-abi";

/**
 * The record per day is read from the contract's events (D86), so it must decode exactly what the contract emitted:
 * a credit names its first and last day, a drain or a finalise names the days it marked missed, and the first reading,
 * which credits nothing, names no day.
 */

const abi = giftEscrowAbi as unknown as Abi;
const ESCROW = "0x995Ab09d8B20511d057E9E87D00fa1f41fC0e233" as const;
const RECIPIENT = "0x000000000000000000000000000000000000b0b0" as const;

function log(topics: readonly `0x${string}`[], data: `0x${string}`): Log {
  return { address: ESCROW, topics: topics as [`0x${string}`, ...`0x${string}`[]], data, blockHash: null, blockNumber: null, logIndex: null, transactionHash: null, transactionIndex: null, removed: false } as unknown as Log;
}

function checkIn(giftId: bigint, fromDay: number, toDay: number, credited: number): Log {
  const topics = encodeEventTopics({ abi, eventName: "CheckInAccepted", args: { giftId, recipient: RECIPIENT } });
  const data = encodeAbiParameters(
    [{ type: "uint32" }, { type: "uint32" }, { type: "uint32" }, { type: "uint64" }, { type: "uint64" }],
    [fromDay, toDay, credited, 1_234n, 1_789_000_000n],
  );
  return log(topics as `0x${string}`[], data);
}

function drained(giftId: bigint, fromDay: number, toDay: number): Log {
  const topics = encodeEventTopics({ abi, eventName: "DaysDrained", args: { giftId } });
  const data = encodeAbiParameters([{ type: "uint32" }, { type: "uint32" }, { type: "uint32" }, { type: "uint256" }], [fromDay, toDay, toDay - fromDay + 1, 1_000_000n]);
  return log(topics as `0x${string}`[], data);
}

test("a credit and a drain become one row per day, earned and returned, in day order", () => {
  assert.deepEqual(settledDaysFromLogs("3", [drained(3n, 20_709, 20_711), checkIn(3n, 20_708, 20_708, 1)]), [
    { day: 20_708, outcome: "earned" },
    { day: 20_709, outcome: "returned" },
    { day: 20_710, outcome: "returned" },
    { day: 20_711, outcome: "returned" },
  ]);
  // Two days credited by one reading, a catch-up.
  assert.deepEqual(settledDaysFromLogs("3", [checkIn(3n, 20_712, 20_713, 2)]).map((day) => day.day), [20_712, 20_713]);
});

test("the first reading credits nothing and names no day; another gift's events are not this gift's", () => {
  assert.deepEqual(settledDaysFromLogs("3", [checkIn(3n, 20_708, 20_708, 0)]), []);
  assert.deepEqual(settledDaysFromLogs("3", [checkIn(4n, 20_708, 20_709, 2), drained(4n, 20_710, 20_710)]), []);
  assert.deepEqual(settledDaysFromLogs("3", []), []);
});
