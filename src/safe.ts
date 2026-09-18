import { concatHex, encodeFunctionData, getAddress, getContractAddress, hashTypedData, keccak256, numberToHex, padHex, type Address, type Hex } from "viem";

/**
 * A Safe of two keys, standing where one key stands today: what the four contracts' owner becomes (mitigation a).
 *
 * The four contracts are plain `Ownable`: one `transferOwnership` and the old owner is gone, with no second step to
 * accept and no way back. Whatever is written here decides where that power lands, so nothing in this file guesses.
 * Every address below was read on Monad mainnet on 19 Sep 2026, and the shape of a creation is the shape of a Safe
 * that already lives there: Lock-In's 2 of 2, `0xf1be884698B9Ba4438f529699eC92320427b4dA1`, made on 15 Jul 2026
 * through this same factory and this same singleton. `test/safe.test.ts` rebuilds that Safe's address from its own
 * creation transaction, so a change here that would send money to a different address fails the tests before it can
 * be signed.
 *
 * Browser safe and key free: it encodes calls and hashes, it never reads a key and never sends anything.
 */

/** Safe 1.4.1, the version Lock-In's Safe runs and the one these addresses belong to. */
export const SAFE_VERSION = "1.4.1";

/**
 * The L2 singleton, not the plain one: it emits an event per transaction, which is how Safe's own service follows a
 * Safe on a chain like this one. Lock-In's Safe points at it (`masterCopy` in Safe's service, and storage slot 0 on
 * chain), and Safe's service reports that Safe as "1.4.1+L2".
 */
export const SAFE_L2_SINGLETON = getAddress("0x29fcB43b46531BcA003ddC8FCB67FFE91900C762");
export const SAFE_PROXY_FACTORY = getAddress("0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67");
export const SAFE_FALLBACK_HANDLER = getAddress("0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99");

/** What a Safe is asked, to prove it is one before anything is handed to it. */
export const safeAbi = [
  { type: "function", name: "VERSION", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "getOwners", stateMutability: "view", inputs: [], outputs: [{ type: "address[]" }] },
  { type: "function", name: "getThreshold", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "nonce", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "setup",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_owners", type: "address[]" },
      { name: "_threshold", type: "uint256" },
      { name: "to", type: "address" },
      { name: "data", type: "bytes" },
      { name: "fallbackHandler", type: "address" },
      { name: "paymentToken", type: "address" },
      { name: "payment", type: "uint256" },
      { name: "paymentReceiver", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getTransactionHash",
    stateMutability: "view",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "data", type: "bytes" },
      { name: "operation", type: "uint8" },
      { name: "safeTxGas", type: "uint256" },
      { name: "baseGas", type: "uint256" },
      { name: "gasPrice", type: "uint256" },
      { name: "gasToken", type: "address" },
      { name: "refundReceiver", type: "address" },
      { name: "_nonce", type: "uint256" },
    ],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "execTransaction",
    stateMutability: "payable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "data", type: "bytes" },
      { name: "operation", type: "uint8" },
      { name: "safeTxGas", type: "uint256" },
      { name: "baseGas", type: "uint256" },
      { name: "gasPrice", type: "uint256" },
      { name: "gasToken", type: "address" },
      { name: "refundReceiver", type: "address" },
      { name: "signatures", type: "bytes" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

export const safeProxyFactoryAbi = [
  {
    type: "function",
    name: "createProxyWithNonce",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_singleton", type: "address" },
      { name: "initializer", type: "bytes" },
      { name: "saltNonce", type: "uint256" },
    ],
    outputs: [{ type: "address" }],
  },
  { type: "function", name: "proxyCreationCode", stateMutability: "pure", inputs: [], outputs: [{ type: "bytes" }] },
] as const;

/** `Ownable`, the whole of what these four contracts hold about who may act. */
export const ownableAbi = [
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "transferOwnership", stateMutability: "nonpayable", inputs: [{ name: "newOwner", type: "address" }], outputs: [] },
] as const;

/** Refuses a set of owners that would make a Safe nobody can use, or one two keys do not really hold. */
export function checkOwners(owners: readonly Address[], threshold: number): readonly Address[] {
  const seen = owners.map((owner) => getAddress(owner));
  if (seen.length < threshold) throw new Error(`A threshold of ${threshold} needs at least ${threshold} owners, and ${seen.length} were given`);
  if (threshold < 1) throw new Error("A threshold below one would let anybody act");
  if (new Set(seen).size !== seen.length) throw new Error("The same owner was given twice, so one key would count for two");
  if (seen.some((owner) => owner === "0x0000000000000000000000000000000000000000")) throw new Error("The empty address cannot be an owner");
  return seen;
}

/**
 * What a new Safe is set up with. The two zeros at the end are the payment Safe's own factory can take for the
 * creation, which nobody uses here: the sender pays the gas and nothing else moves.
 */
export function safeSetupData(owners: readonly Address[], threshold: number, fallbackHandler: Address = SAFE_FALLBACK_HANDLER): Hex {
  return encodeFunctionData({
    abi: safeAbi,
    functionName: "setup",
    args: [checkOwners(owners, threshold), BigInt(threshold), "0x0000000000000000000000000000000000000000", "0x", fallbackHandler, "0x0000000000000000000000000000000000000000", 0n, "0x0000000000000000000000000000000000000000"],
  });
}

export function safeCreationData(initializer: Hex, saltNonce: bigint, singleton: Address = SAFE_L2_SINGLETON): Hex {
  return encodeFunctionData({ abi: safeProxyFactoryAbi, functionName: "createProxyWithNonce", args: [singleton, initializer, saltNonce] });
}

/**
 * Where that creation lands, worked out before it is sent. The factory salts with the initializer's hash and the
 * nonce, and deploys the proxy's own code with the singleton appended, so the address is a fact of the four inputs
 * and not a thing to wait and see.
 */
export function predictSafeAddress(input: { proxyCreationCode: Hex; initializer: Hex; saltNonce: bigint; singleton?: Address; factory?: Address }): Address {
  const salt = keccak256(concatHex([keccak256(input.initializer), numberToHex(input.saltNonce, { size: 32 })]));
  const bytecode = concatHex([input.proxyCreationCode, padHex(input.singleton ?? SAFE_L2_SINGLETON, { size: 32 })]);
  return getContractAddress({ opcode: "CREATE2", from: input.factory ?? SAFE_PROXY_FACTORY, salt, bytecode });
}

/** One transaction a Safe is asked to make. The refund fields stay at zero: the owner executing it pays the gas. */
export type SafeTransaction = Readonly<{
  to: Address;
  value: bigint;
  data: Hex;
  /** 0 is a call. A delegate call (1) is never built here: it would run somebody else's code as the Safe. */
  operation: 0;
  safeTxGas: bigint;
  baseGas: bigint;
  gasPrice: bigint;
  gasToken: Address;
  refundReceiver: Address;
  nonce: bigint;
}>;

const ZERO = "0x0000000000000000000000000000000000000000" as const;

/** A plain call from the Safe, with every refund field at zero and the Safe's own next nonce. */
export function safeCall(to: Address, data: Hex, nonce: bigint, value = 0n): SafeTransaction {
  return { to: getAddress(to), value, data, operation: 0, safeTxGas: 0n, baseGas: 0n, gasPrice: 0n, gasToken: ZERO, refundReceiver: ZERO, nonce };
}

/** What each owner signs: Safe's own typed data, which its contract hashes the same way (`getTransactionHash`). */
export function safeTxTypedData(safe: Address, chainId: number, tx: SafeTransaction) {
  return {
    domain: { chainId, verifyingContract: getAddress(safe) },
    types: {
      SafeTx: [
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "data", type: "bytes" },
        { name: "operation", type: "uint8" },
        { name: "safeTxGas", type: "uint256" },
        { name: "baseGas", type: "uint256" },
        { name: "gasPrice", type: "uint256" },
        { name: "gasToken", type: "address" },
        { name: "refundReceiver", type: "address" },
        { name: "nonce", type: "uint256" },
      ],
    },
    primaryType: "SafeTx",
    message: { ...tx, operation: tx.operation },
  } as const;
}

export function safeTxHash(safe: Address, chainId: number, tx: SafeTransaction): Hex {
  return hashTypedData(safeTxTypedData(safe, chainId, tx));
}

/**
 * The signatures as the contract reads them: one 65 byte block per owner, ordered by owner address, lowest first.
 * Safe walks that list expecting each recovered owner to come after the last, so an order swap is a refusal and not
 * a silent acceptance.
 */
export function packSafeSignatures(parts: readonly { owner: Address; signature: Hex }[]): Hex {
  if (parts.length === 0) throw new Error("No signature to pack");
  const seen = new Set<string>();
  for (const part of parts) {
    const owner = getAddress(part.owner);
    if (seen.has(owner)) throw new Error(`${owner} signed twice, and one key never counts for two`);
    seen.add(owner);
    if (part.signature.length !== 132) throw new Error(`A signature of ${(part.signature.length - 2) / 2} bytes is not one of 65`);
  }
  const ordered = [...parts].sort((left, right) => (BigInt(getAddress(left.owner)) < BigInt(getAddress(right.owner)) ? -1 : 1));
  return concatHex(ordered.map((part) => part.signature));
}

export function execTransactionData(tx: SafeTransaction, signatures: Hex): Hex {
  return encodeFunctionData({
    abi: safeAbi,
    functionName: "execTransaction",
    args: [tx.to, tx.value, tx.data, tx.operation, tx.safeTxGas, tx.baseGas, tx.gasPrice, tx.gasToken, tx.refundReceiver, signatures],
  });
}

/** The call that hands one contract over. The address it names is the one thing nobody gets to be wrong about. */
export function transferOwnershipData(newOwner: Address): Hex {
  return encodeFunctionData({ abi: ownableAbi, functionName: "transferOwnership", args: [getAddress(newOwner)] });
}
