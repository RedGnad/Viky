import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  erc20Abi,
  type Hash,
  type Hex,
  type LocalAccount,
  type PublicClient,
  type WalletClient,
} from "viem";
import { isNative, type Coin } from "../coins";
import { addMonadGasBuffer } from "../monad-gas";
import { AUSD_ADDRESS, monadChain, monadTransport, waitForFinality } from "../monad/chain";

/**
 * The passkey account sending its own transactions from the browser (the funder's swap and funding,
 * the recipient's exit). Every limit is explicit with the Monad margin, and nothing is reported done
 * before finality.
 */

let cachedPublic: PublicClient | undefined;

export function browserPublicClient(): PublicClient {
  if (!cachedPublic) cachedPublic = createPublicClient({ chain: monadChain, transport: monadTransport() });
  return cachedPublic;
}

export function browserWalletClient(account: LocalAccount): WalletClient {
  return createWalletClient({ account, chain: monadChain, transport: monadTransport() });
}

export async function readMonBalance(address: Hex): Promise<bigint> {
  return browserPublicClient().getBalance({ address });
}

export async function readAusdBalance(address: Hex): Promise<bigint> {
  return browserPublicClient().readContract({ address: AUSD_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [address] });
}

/**
 * What an account holds of any one coin, the chain's own included (D77). Since the way out exists an account
 * can hold three different things, and a screen showing only what a gift holds would tell somebody who had
 * just changed their money that they had nothing.
 */
export async function readCoinBalance(coin: Coin, address: Hex): Promise<bigint> {
  if (isNative(coin)) return browserPublicClient().getBalance({ address });
  return browserPublicClient().readContract({ address: coin.address, abi: erc20Abi, functionName: "balanceOf", args: [address] });
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
 * Sends exactly the amount asked for in the chain's own coin, and says plainly what it costs to do so.
 *
 * This is the one thing Viky cannot do for somebody. Every other movement of money here is a signature the
 * relayer submits and pays for, because a token with EIP-3009 lets anyone carry an authorization. The chain's
 * own coin has no such thing: nobody can move it on another person's behalf, so the person's own account sends
 * it and the fee comes out of the same coin. A payout service is ordered for an exact quantity (D75), so the
 * fee is checked against what is left over rather than taken out of the amount, and the send is refused if the
 * two do not both fit.
 */
export async function sendMon(account: LocalAccount, to: Hex, amount: bigint): Promise<{ hash: Hash; fee: bigint }> {
  const publicClient = browserPublicClient();
  const [balance, fees, estimate] = await Promise.all([
    publicClient.getBalance({ address: account.address }),
    publicClient.estimateFeesPerGas(),
    publicClient.estimateGas({ account: account.address, to, value: 1n }),
  ]);
  const gas = estimate === 21_000n ? estimate : addMonadGasBuffer(estimate);
  const fee = gas * fees.maxFeePerGas;
  if (amount + fee > balance) throw new Error("Not enough left to send that and pay what it costs to send it");
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
  return { hash, fee };
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
  if (amount <= 0n) throw new Error("Nothing left to send once the transfer fee is kept");
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
