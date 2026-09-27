// "A treasury that cannot pay refuses" holds before the person's money moves (the money path audit of 27 Sep 2026): the
// ETH must cover a fee reserve, not one wei, and the USDC this order plus the orders already received and not yet paid.

import assert from "node:assert/strict";
import test from "node:test";
import type { Hex } from "viem";
import { BASE_FEE_RESERVE_WEI, treasuryCovers, type BaseClients } from "../src/phone-treasury";

const holding = (usdcUnits: bigint, ethWei: bigint) =>
  ({
    account: { address: "0x2222222222222222222222222222222222222222" as Hex },
    publicClient: { readContract: async () => usdcUnits, getBalance: async () => ethWei },
    walletClient: {},
  }) as unknown as BaseClients;

test("one wei of ETH no longer passes: the fee reserve does", async () => {
  assert.equal(await treasuryCovers(5_000_000n, holding(60_000_000n, 1n), async () => 0n), false);
  assert.equal(await treasuryCovers(5_000_000n, holding(60_000_000n, BASE_FEE_RESERVE_WEI - 1n), async () => 0n), false);
  assert.equal(await treasuryCovers(5_000_000n, holding(60_000_000n, BASE_FEE_RESERVE_WEI), async () => 0n), true);
});

test("the USDC of orders already received and not yet paid is counted before a new one", async () => {
  // 60 USDC held, 50 already owed to Bitrefill for an order whose AUSD came in: a new order of 20 cannot be paid.
  assert.equal(await treasuryCovers(20_000_000n, holding(60_000_000n, BASE_FEE_RESERVE_WEI), async () => 50_000_000n), false);
  assert.equal(await treasuryCovers(10_000_000n, holding(60_000_000n, BASE_FEE_RESERVE_WEI), async () => 50_000_000n), true);
});
