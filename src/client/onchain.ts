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

export async function transferAusd(account: LocalAccount, to: Hex, amount: bigint): Promise<Hash> {
  const data = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to, amount] });
  return (await sendWithExplicitGas(account, { to: AUSD_ADDRESS, data })).hash;
}

/**
 * Sends the whole MON balance minus the gas of the transfer itself. Monad charges gas on the declared
 * limit, so a plain transfer to an EOA declares exactly 21,000; a contract recipient gets the estimate
 * with the usual margin. The fee cap is passed explicitly so the reserve is computed on the same number
 * the node will charge against.
 */
export async function sendAllMon(account: LocalAccount, to: Hex): Promise<{ hash: Hash; amount: bigint }> {
  const publicClient = browserPublicClient();
  const [balance, fees, estimate] = await Promise.all([
    publicClient.getBalance({ address: account.address }),
    publicClient.estimateFeesPerGas(),
    publicClient.estimateGas({ account: account.address, to, value: 1n }),
  ]);
  const gas = estimate === 21_000n ? estimate : addMonadGasBuffer(estimate);
  const amount = balance - gas * fees.maxFeePerGas;
  if (amount <= 0n) throw new Error("Nothing left to send after the transfer's own gas");
  const hash = await browserWalletClient(account).sendTransaction({
    account,
    chain: monadChain,
    to,
    value: amount,
    gas,
    maxFeePerGas: fees.maxFeePerGas,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
  });
  const receipt = await waitForFinality(publicClient, hash);
  if (receipt.status !== "success") throw new Error("The transfer was included but did not succeed");
  return { hash, amount };
}
