import assert from "node:assert/strict";
import test from "node:test";
import { decodeFunctionData, encodeFunctionData, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { MONAD_CHAIN_ID } from "../src/monad/chain";
import {
  checkOwners,
  execTransactionData,
  packSafeSignatures,
  predictSafeAddress,
  safeCall,
  safeCreationData,
  safeProxyFactoryAbi,
  safeSetupData,
  safeTxHash,
  SAFE_FALLBACK_HANDLER,
  SAFE_L2_SINGLETON,
  SAFE_PROXY_FACTORY,
  transferOwnershipData,
} from "../src/safe";

/**
 * The Safe this repository would create, checked against a Safe that already exists on Monad mainnet.
 *
 * Handing the four contracts over is one call with no second step and no way back, so the address these functions
 * work out must be right the first time. Rather than trust the encoding, every fixture here was read from the chain
 * on 19 Sep 2026 and belongs to Lock-In's 2 of 2 Safe, `0xf1be884698B9Ba4438f529699eC92320427b4dA1`, created on
 * 15 Jul 2026: its creation transaction, the factory's proxy code, and a transaction hash the Safe itself computed.
 * If a change here would land a different address or sign a different thing, one of these fails.
 */

/** Safe's own transaction, `0x7dc01682b59c74c8af75bfaf9cde28a1f8cc2b0844e6328c834830bd4032bd38`, as the chain gave it. */
const LOCK_IN_CREATION_INPUT: Hex =
  "0x1688f0b900000000000000000000000029fcb43b46531bca003ddc8fcb67ffe91900c762000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000003558dd66b0000000000000000000000000000000000000000000000000000000000000184b63e800d0000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000160000000000000000000000000fd0732dc9e303f09fcef3a7388ad10a83459ec990000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002000000000000000000000000344412229b3b581c19572f9bf1f5d08d4ae897e600000000000000000000000079c53151315fad9163f75a65a8bd4d04a10e1e45000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

const LOCK_IN_SAFE: Address = "0xf1be884698B9Ba4438f529699eC92320427b4dA1";
const LOCK_IN_OWNERS: readonly Address[] = ["0x344412229B3b581C19572f9BF1F5d08d4Ae897E6", "0x79C53151315FaD9163f75a65A8Bd4D04a10e1e45"];

/** `proxyCreationCode()` on the factory, 486 bytes, read on 19 Sep 2026. */
const PROXY_CREATION_CODE: Hex =
  "0x608060405234801561001057600080fd5b506040516101e63803806101e68339818101604052602081101561003357600080fd5b8101908080519060200190929190505050600073ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff1614156100ca576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260228152602001806101c46022913960400191505060405180910390fd5b806000806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055505060ab806101196000396000f3fe608060405273ffffffffffffffffffffffffffffffffffffffff600054167fa619486e0000000000000000000000000000000000000000000000000000000060003514156050578060005260206000f35b3660008037600080366000845af43d6000803e60008114156070573d6000fd5b3d6000f3fea264697066735822122003d1488ee65e08fa41e58e888a9865554c535f2c77126a82cb4c0f917f31441364736f6c63430007060033496e76616c69642073696e676c65746f6e20616464726573732070726f7669646564";

function creationArguments(): { singleton: Address; initializer: Hex; saltNonce: bigint } {
  const decoded = decodeFunctionData({ abi: safeProxyFactoryAbi, data: LOCK_IN_CREATION_INPUT });
  assert.equal(decoded.functionName, "createProxyWithNonce");
  const [singleton, initializer, saltNonce] = decoded.args as readonly [Address, Hex, bigint];
  return { singleton, initializer, saltNonce };
}

test("the setup this repository encodes is byte for byte the one that made a Safe on Monad", () => {
  const { singleton, initializer } = creationArguments();
  assert.equal(singleton.toLowerCase(), SAFE_L2_SINGLETON.toLowerCase(), "the singleton is the L2 one");
  assert.equal(safeSetupData(LOCK_IN_OWNERS, 2), initializer);
  // And the fallback handler it names is the one this file holds, not something that happened to match.
  assert.match(initializer.toLowerCase(), new RegExp(SAFE_FALLBACK_HANDLER.slice(2).toLowerCase()));
});

test("the address worked out before sending is the address the chain gave that Safe", () => {
  const { singleton, initializer, saltNonce } = creationArguments();
  const predicted = predictSafeAddress({ proxyCreationCode: PROXY_CREATION_CODE, initializer, saltNonce, singleton, factory: SAFE_PROXY_FACTORY });
  assert.equal(predicted, LOCK_IN_SAFE);
  // A different nonce is a different Safe: the prediction depends on what is sent, not on who sends it.
  const other = predictSafeAddress({ proxyCreationCode: PROXY_CREATION_CODE, initializer, saltNonce: saltNonce + 1n, singleton, factory: SAFE_PROXY_FACTORY });
  assert.notEqual(other, LOCK_IN_SAFE);
});

test("the creation call rebuilds that transaction's own data", () => {
  const { singleton, initializer, saltNonce } = creationArguments();
  assert.equal(safeCreationData(initializer, saltNonce, singleton), LOCK_IN_CREATION_INPUT);
});

test("what an owner signs is what the Safe contract hashes", () => {
  // `getTransactionHash` read from the Lock-In Safe on 19 Sep 2026, for pausing creation on the live escrow.
  const pauseCreation = encodeFunctionData({
    abi: [{ type: "function", name: "setCreationPaused", stateMutability: "nonpayable", inputs: [{ name: "paused", type: "bool" }], outputs: [] }] as const,
    functionName: "setCreationPaused",
    args: [true],
  });
  assert.equal(pauseCreation, "0xa21d131c0000000000000000000000000000000000000000000000000000000000000001");
  const tx = safeCall("0x995Ab09d8B20511d057E9E87D00fa1f41fC0e233", pauseCreation, 0n);
  assert.equal(safeTxHash(LOCK_IN_SAFE, MONAD_CHAIN_ID, tx), "0x5d27931c13228b711a0e62343cf436c096bfe4ae0223c17ee0176b1831d9417d");
  // The chain is part of what is signed: the same call on another chain is another hash.
  assert.notEqual(safeTxHash(LOCK_IN_SAFE, 1, tx), "0x5d27931c13228b711a0e62343cf436c096bfe4ae0223c17ee0176b1831d9417d");
});

test("signatures are packed in the order the contract walks them, lowest owner first", async () => {
  const keys = ["0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba"] as const;
  const accounts = keys.map((key) => privateKeyToAccount(key));
  const tx = safeCall("0x995Ab09d8B20511d057E9E87D00fa1f41fC0e233", "0x", 7n);
  const hash = safeTxHash(LOCK_IN_SAFE, MONAD_CHAIN_ID, tx);
  const parts = await Promise.all(accounts.map(async (account) => ({ owner: account.address, signature: await account.sign({ hash }) })));
  const lowestFirst = [...parts].sort((left, right) => (BigInt(left.owner) < BigInt(right.owner) ? -1 : 1));
  const packed = packSafeSignatures([...parts].reverse());
  assert.equal(packed, `0x${lowestFirst.map((part) => part.signature.slice(2)).join("")}`);
  assert.equal((packed.length - 2) / 2, 130, "two signatures of 65 bytes");
  // Execution carries them as they are, and one owner signing twice is refused rather than packed.
  assert.match(execTransactionData(tx, packed), /^0x6a761202/);
  assert.throws(() => packSafeSignatures([parts[0], parts[0]]), /signed twice/);
  assert.throws(() => packSafeSignatures([{ owner: accounts[0].address, signature: "0x1234" }]), /is not one of 65/);
});

test("a set of owners that would lose the Safe, or let one key act alone, is refused", () => {
  assert.deepEqual(checkOwners(LOCK_IN_OWNERS, 2), ["0x344412229B3b581C19572f9BF1F5d08d4Ae897E6", "0x79C53151315FaD9163f75a65A8Bd4D04a10e1e45"]);
  assert.throws(() => checkOwners([LOCK_IN_OWNERS[0]], 2), /at least 2 owners/);
  assert.throws(() => checkOwners([LOCK_IN_OWNERS[0], LOCK_IN_OWNERS[0]], 2), /twice/);
  assert.throws(() => checkOwners([LOCK_IN_OWNERS[0], "0x0000000000000000000000000000000000000000"], 2), /empty address/);
  assert.throws(() => safeSetupData(LOCK_IN_OWNERS, 0), /below one/);
});

test("handing a contract over names the new owner and nothing else", () => {
  assert.equal(
    transferOwnershipData(LOCK_IN_SAFE),
    `0xf2fde38b000000000000000000000000${LOCK_IN_SAFE.slice(2).toLowerCase()}`,
  );
});
