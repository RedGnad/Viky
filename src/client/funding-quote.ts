import type { Hex } from "viem";
import { postJson } from "./api";
import { browserPublicClient } from "./onchain";
import { sendsExactly, type FundingQuote } from "../funding-quote";
import { EXIT_ROUTER } from "../viky-contracts";

/**
 * The conversion of what a card bought, asked of the server and checked here before the funder's account sends it
 * (the audit of 1 Oct 2026). The server already refuses an answer of the exchange that names another destination or
 * another amount; the browser does not take its word for it. The amount is compared with the one it asked for, and the
 * destination is held against the chain: it must be an exchange the way out's contract was opened to by its owner,
 * which is the one exchange Viky uses. An answer that fails either is never sent.
 */

const ZERO = "0x0000000000000000000000000000000000000000";
const PIN_ABI = [{ type: "function", name: "mustPointAt", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "address" }] }] as const;

/** Whether the way out's contract knows this address as its exchange. */
export async function isTheExchange(address: Hex, read: (address: Hex) => Promise<string> = pinOf): Promise<boolean> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return false;
  return (await read(address)).toLowerCase() !== ZERO;
}

function pinOf(address: Hex): Promise<string> {
  return browserPublicClient().readContract({ address: EXIT_ROUTER, abi: PIN_ABI, functionName: "mustPointAt", args: [address] }) as Promise<string>;
}

/** The transaction that converts `amount`, or a refusal when the answer is not for that amount or not for the exchange. */
export async function fundingQuote(amount: bigint, read?: (address: Hex) => Promise<string>): Promise<FundingQuote> {
  const quote = await postJson<FundingQuote>("/api/fund/quote", { amount: amount.toString() });
  if (!sendsExactly(quote, amount) || !(await isTheExchange(quote.to, read))) throw new Error("The conversion answered is not the one asked for");
  return quote;
}
