import { getAddress, type Hex } from "viem";
import { GiftApiError } from "./gift-api";

/**
 * Kuru Flow, the exchange that turns the MON a funder buys with a card into the AUSD a gift holds
 * (D8). The quote is fetched server side because Kuru's token endpoint is rate limited per address;
 * the calldata it returns is then sent by the person's own account from their browser, so Viky never
 * moves their money itself.
 */

const KURU = "https://ws.kuru.io";
export const NATIVE_MON = "0x0000000000000000000000000000000000000000" as const;

export type SwapQuote = Readonly<{ output: string; minOut: string; to: Hex; data: Hex; value: string }>;

export async function kuruQuote(input: { userAddress: Hex; tokenIn: string; tokenOut: string; amount: bigint }): Promise<SwapQuote> {
  const userAddress = getAddress(input.userAddress);
  const tokenResponse = await fetch(`${KURU}/api/generate-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_address: userAddress }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!tokenResponse.ok) throw new GiftApiError("QUOTE_UNAVAILABLE", "The exchange is not answering. Try again shortly.", 503);
  const { token } = (await tokenResponse.json()) as { token?: string };
  if (!token) throw new GiftApiError("QUOTE_UNAVAILABLE", "The exchange is not answering. Try again shortly.", 503);

  const quoteResponse = await fetch(`${KURU}/api/quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ userAddress, tokenIn: input.tokenIn, tokenOut: input.tokenOut, amount: input.amount.toString(), autoSlippage: true }),
    signal: AbortSignal.timeout(15_000),
  });
  const quote = (await quoteResponse.json()) as {
    status?: string;
    output?: string;
    minOut?: string;
    message?: string | null;
    transaction?: { to?: string; calldata?: string; value?: string };
  };
  if (!quoteResponse.ok || quote.status !== "success" || !quote.transaction?.to || !quote.transaction.calldata) {
    throw new GiftApiError("QUOTE_UNAVAILABLE", quote.message || "No route for this right now. Try again shortly.", 503);
  }
  return {
    output: String(quote.output ?? "0"),
    minOut: String(quote.minOut ?? "0"),
    to: getAddress(quote.transaction.to),
    data: (quote.transaction.calldata.startsWith("0x") ? quote.transaction.calldata : `0x${quote.transaction.calldata}`) as Hex,
    value: quote.transaction.value ?? "0",
  };
}
