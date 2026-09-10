import assert from "node:assert/strict";
import test from "node:test";
import { encodeErrorResult, parseEther, type Abi } from "viem";
import { giftEscrowAbi } from "../src/gift-escrow-abi";
import { decodeContractError, relayerPreflight, RelayerError, RELAYER_MIN_BALANCE, type RelayerClients } from "../src/relayer";

function clients(overrides: { chainId?: number; balance?: bigint }): RelayerClients {
  return {
    address: "0x000000000000000000000000000000000000A11C",
    publicClient: {
      getChainId: async () => overrides.chainId ?? 143,
      getBalance: async () => overrides.balance ?? parseEther("20"),
    } as unknown as RelayerClients["publicClient"],
    walletClient: {} as RelayerClients["walletClient"],
  };
}

test("the preflight refuses another chain and a balance below the reserve plus margin", async () => {
  assert.equal(RELAYER_MIN_BALANCE, parseEther("12"));
  await assert.rejects(relayerPreflight(clients({ chainId: 10143 })), (error: unknown) => error instanceof RelayerError && error.code === "WRONG_CHAIN");
  await assert.rejects(
    relayerPreflight(clients({ balance: parseEther("11.9") })),
    (error: unknown) => error instanceof RelayerError && error.code === "RESERVE_TOO_LOW",
  );
  const ok = await relayerPreflight(clients({ balance: parseEther("12") }));
  assert.equal(ok.chainId, 143);
});

test("a revert is decoded to the contract's typed error name", () => {
  const abi = giftEscrowAbi as unknown as Abi;
  const data = encodeErrorResult({ abi, errorName: "InsufficientProgress" });
  assert.equal(decodeContractError({ cause: { cause: { data } } }), "InsufficientProgress");
  assert.equal(decodeContractError({ errorName: "NullifierAlreadyUsed" }), "NullifierAlreadyUsed");
  assert.equal(decodeContractError({ data: "0xdeadbeef" }), undefined);
  assert.equal(decodeContractError(new Error("network down")), undefined);
});
