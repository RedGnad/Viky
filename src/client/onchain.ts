import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  erc20Abi,
  http,
  type Hash,
  type Hex,
  type LocalAccount,
  type PublicClient,
  type WalletClient,
} from "viem";
import { addMonadGasBuffer } from "../monad-gas";
import { AUSD_ADDRESS, monadChain, monadRpcUrl, waitForFinality } from "../monad/chain";

/**
 * The passkey account sending its own transactions from the browser (the funder's swap and funding,
 * the recipient's exit). Every limit is explicit with the Monad margin, and nothing is reported done
 * before finality.
 */

let cachedPublic: PublicClient | undefined;

export function browserPublicClient(): PublicClient {
  if (!cachedPublic) cachedPublic = createPublicClient({ chain: monadChain, transport: http(monadRpcUrl()) });
  return cachedPublic;
}

export function browserWalletClient(account: LocalAccount): WalletClient {
  return createWalletClient({ account, chain: monadChain, transport: http(monadRpcUrl()) });
}

export async function readMonBalance(address: Hex): Promise<bigint> {
  return browserPublicClient().getBalance({ address });
}

export async function readAusdBalance(address: Hex): Promise<bigint> {
  return browserPublicClient().readContract({ address: AUSD_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [address] });
}

export async function sendWithExplicitGas(
  account: LocalAccount,
  transaction: { to: Hex; data?: Hex; value?: bigint },
): Promise<{ hash: Hash; gasUsed: bigint }> {
  const publicClient = browserPublicClient();
  const estimate = await publicClient.estimateGas({ account: account.address, to: transaction.to, data: transaction.data, value: transaction.value });
  const gas = addMonadGasBuffer(estimate);
  const hash = await browserWalletClient(account).sendTransaction({
    account,
    chain: monadChain,
    to: transaction.to,
    data: transaction.data,
    value: transaction.value,
    gas,
  });
  const receipt = await waitForFinality(publicClient, hash);
  if (receipt.status !== "success") throw new Error("The transaction was included but did not succeed");
  return { hash, gasUsed: receipt.gasUsed };
}

export async function approveAusd(account: LocalAccount, spender: Hex, amount: bigint): Promise<Hash> {
  const data = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, amount] });
  return (await sendWithExplicitGas(account, { to: AUSD_ADDRESS, data })).hash;
}
