import { randomBytes } from "node:crypto";
import { erc20Abi, getAddress, keccak256, type Abi, type Hex } from "viem";
import { exitNonce, type ExitTerms } from "./exit-terms";
import { exitRouterAbi } from "./exit-router-abi";
import { GiftApiError } from "./gift-api";
import { AUSD_ADDRESS, monadChain, waitForFinality } from "./monad/chain";
import { canonicalSignature } from "./signature";
import { decodeContractError, relayerClients, relayerPreflight, relayGasLimit, RelayerError, type RelayerClients } from "./relayer";

/**
 * The server half of the way out: where the exchange and the router live, and how one signed set of terms is
 * carried to the chain. Everything a second attempt needs is already written down, so this never quotes
 * again and never asks for another signature (src/exit-plan.ts says why that matters).
 */

export function exitRouterAddress(): Hex {
  const value = process.env.EXIT_ROUTER_ADDRESS?.trim();
  if (!value || !/^0x[0-9a-fA-F]{40}$/.test(value)) throw new GiftApiError("NOT_CONFIGURED", "Viky cannot pay out yet.", 503);
  return getAddress(value);
}

/**
 * The one exchange the router was opened to. Checked here as well as on chain: a quote that suddenly names
 * somewhere else is refused before anybody is asked to sign, rather than after they have signed and paid for
 * a transaction that reverts.
 */
export function exitExchangeAddress(): Hex {
  const value = process.env.EXIT_EXCHANGE_ADDRESS?.trim();
  if (!value || !/^0x[0-9a-fA-F]{40}$/.test(value)) throw new GiftApiError("NOT_CONFIGURED", "Viky cannot pay out yet.", 503);
  return getAddress(value);
}

export function newSalt(): Hex {
  return `0x${randomBytes(32).toString("hex")}`;
}

export type PreparedExit = Readonly<{ terms: ExitTerms; nonce: Hex; callData: Hex }>;

/**
 * Builds the terms one signature will cover. The floor comes from the caller, never from the quote.
 *
 * There is no destination to build in any more (D76): the proceeds go back to the payer, and the payer is the
 * account the token itself checks the signature against, so where the money ends up is not a field a relayer
 * could get wrong.
 */
export function buildExitTerms(input: {
  payer: Hex;
  amount: bigint;
  /** The coin that must come back, zero meaning the chain's own (D77). */
  tokenOut: Hex;
  floor: bigint;
  exchange: Hex;
  callData: Hex;
  deadline: bigint;
  salt?: Hex;
}): PreparedExit {
  const terms: ExitTerms = {
    payer: getAddress(input.payer),
    amount: input.amount,
    tokenOut: getAddress(input.tokenOut),
    minOut: input.floor,
    exchange: getAddress(input.exchange),
    callHash: keccak256(input.callData),
    deadline: input.deadline,
    salt: input.salt ?? newSalt(),
  };
  return { terms, nonce: exitNonce(terms), callData: input.callData };
}

const AUTHORIZATION_STATE_ABI = [
  {
    type: "function",
    name: "authorizationState",
    stateMutability: "view",
    inputs: [
      { name: "authorizer", type: "address" },
      { name: "nonce", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const satisfies Abi;

/** Whether this exact set of terms has already been paid for. The token, not our own record, is the truth. */
export async function alreadySpent(payer: Hex, nonce: Hex, clients: RelayerClients = relayerClients()): Promise<boolean> {
  return (await clients.publicClient.readContract({
    address: AUSD_ADDRESS,
    abi: AUTHORIZATION_STATE_ABI,
    functionName: "authorizationState",
    args: [getAddress(payer), nonce],
  })) as boolean;
}

export async function heldAusd(account: Hex, clients: RelayerClients = relayerClients()): Promise<bigint> {
  return (await clients.publicClient.readContract({ address: AUSD_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [getAddress(account)] })) as bigint;
}

export type ExitAuthorization = Readonly<{ validAfter: bigint; validBefore: bigint; v: number; r: Hex; s: Hex }>;

/**
 * Submits one way out and waits for finality.
 *
 * The gas is estimated for this exact call and nothing is declared from a table: the call carries an
 * exchange's own swap inside it, whose cost depends on the route the exchange picked that minute. A figure
 * written down in advance is what mined a withdrawal and failed it with nothing to report (D52).
 */
export async function relayExit(input: {
  terms: ExitTerms;
  authorization: ExitAuthorization;
  callData: Hex;
  clients?: RelayerClients;
}): Promise<{ hash: Hex }> {
  const clients = input.clients ?? relayerClients();
  await relayerPreflight(clients);
  const address = exitRouterAddress();
  const abi = exitRouterAbi as unknown as Abi;
  const args = [input.terms, input.authorization, input.callData] as const;
  try {
    await clients.publicClient.simulateContract({ address, abi, functionName: "exit", args: args as never, account: clients.address });
  } catch (error) {
    const name = decodeContractError(error, abi);
    const raw = name ? undefined : (error instanceof Error ? error.message : String(error)).slice(0, 400).replace(/\s+/g, " ");
    if (raw) console.error(`the way out was refused without a typed error: ${raw}`);
    throw new RelayerError("REVERTED", name ? `The contract refused: ${name}` : "The contract refused the transaction", name, raw);
  }
  const gas = await relayGasLimit(clients, { address, abi, functionName: "exit", args });
  const hash = await clients.walletClient.writeContract({
    address,
    abi,
    functionName: "exit",
    args: args as never,
    gas,
    account: clients.walletClient.account!,
    chain: monadChain,
  });
  const receipt = await waitForFinality(clients.publicClient, hash);
  if (receipt.status !== "success") throw new RelayerError("REVERTED", "That could not be paid out. Nothing was taken.");
  return { hash };
}

/** The 65-byte signature, split the way the router takes it. */
export function toExitAuthorization(validAfter: bigint, validBefore: bigint, signature: string): ExitAuthorization {
  const canonical = canonicalSignature(signature);
  const r = `0x${canonical.slice(2, 66)}` as Hex;
  const s = `0x${canonical.slice(66, 130)}` as Hex;
  const v = Number.parseInt(canonical.slice(130, 132), 16);
  return { validAfter, validBefore, v, r, s };
}
