import assert from "node:assert/strict";
import test from "node:test";
import { giftGasLimit } from "../src/gift-gas";
import { relayGasLimit } from "../src/relayer";

/**
 * The limit a call declares. Monad charges the limit, not what is used, so an inaccurate one either wastes
 * the relayer's money or, as happened with the withdrawal path, under-declares and the transaction is mined
 * and fails with nothing to report (D52). The recorded figures came from a mock token; these come from the
 * chain, with the recorded ones kept only as a floor.
 */

const FLOOR = giftGasLimit("withdrawEarnedWithIntent");

const call = { address: "0x00000000000000000000000000000000000000e1", abi: [] as never, functionName: "withdrawEarnedWithIntent", args: [] } as const;

function clients(estimate: bigint | Error) {
  return {
    address: "0x150d3066F615FC012a40E7779dB748D53F7CCFE4",
    publicClient: {
      estimateContractGas: async () => {
        if (estimate instanceof Error) throw estimate;
        return estimate;
      },
    },
  } as never;
}

test("what the chain says, plus the margin, when that is more than the recorded figure", async () => {
  // The real cost measured on 14 Sep against the live contract and the real token.
  const limit = await relayGasLimit(clients(169_600n), call, FLOOR);
  assert.equal(limit, 169_600n + (169_600n * 750n + 9_999n) / 10_000n);
  assert.ok(limit > 172_000n, "and comfortably past the figure that was failing");
});

test("never below the recorded figure, however small the estimate", async () => {
  assert.equal(await relayGasLimit(clients(1_000n), call, FLOOR), 172_000n);
});

test("an estimate that cannot be taken falls back rather than refusing", async () => {
  assert.equal(await relayGasLimit(clients(new Error("node said no")), call, FLOOR), 172_000n);
});

test("a runaway estimate is refused rather than paid for", async () => {
  await assert.rejects(relayGasLimit(clients(5_000_000n), call, FLOOR), /not ready for this yet/);
});

/**
 * The way out carries an exchange's own call inside it, so its cost cannot be written down in advance: it
 * depends on the route the exchange picks that minute. It declares what the chain says and nothing else.
 */
test("a call with no recorded figure declares what the chain says", async () => {
  const exit = { ...call, functionName: "exit" };
  assert.equal(await relayGasLimit(clients(400_000n), exit), 400_000n + (400_000n * 750n + 9_999n) / 10_000n);
});

test("and an estimate it cannot take is refused rather than guessed", async () => {
  await assert.rejects(
    relayGasLimit(clients(new Error("node said no")), { ...call, functionName: "exit" }),
    /could not work out what this costs/,
  );
});
