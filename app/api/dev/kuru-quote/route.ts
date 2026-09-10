import { NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { readJsonBody } from "@/src/api-guard";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KURU = "https://ws.kuru.io";
export const NATIVE_MON = "0x0000000000000000000000000000000000000000";

/**
 * Dev-only plumbing for the first mainnet chain (KT1): a Kuru Flow quote for the signed-in account,
 * fetched server side because Kuru's token endpoint is rate-limited per address and the calldata is
 * then sent by the person's own account from the browser. Never part of a consumer screen.
 */
export async function POST(request: Request) {
  try {
    if (process.env.VIKY_DEV_PAGES !== "1") throw new GiftApiError("NOT_FOUND", "Not found", 404);
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("status", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const body = await readJsonBody<{ tokenIn?: string; tokenOut?: string; amount?: string }>(request, 1_024);
    const tokenIn = String(body.tokenIn ?? "");
    const tokenOut = String(body.tokenOut ?? "");
    if (!isAddress(tokenIn) || !isAddress(tokenOut)) throw new GiftApiError("INVALID_REQUEST", "Invalid pair");
    let amount: bigint;
    try {
      amount = BigInt(String(body.amount ?? ""));
    } catch {
      throw new GiftApiError("INVALID_REQUEST", "Invalid amount");
    }
    if (amount <= 0n) throw new GiftApiError("INVALID_REQUEST", "Invalid amount");

    const userAddress = getAddress(auth.account);
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
      body: JSON.stringify({ userAddress, tokenIn, tokenOut, amount: amount.toString(), autoSlippage: true }),
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
      throw new GiftApiError("QUOTE_UNAVAILABLE", quote.message || "No route for this swap right now.", 503);
    }
    return NextResponse.json(
      {
        output: quote.output,
        minOut: quote.minOut,
        to: getAddress(quote.transaction.to),
        data: quote.transaction.calldata.startsWith("0x") ? quote.transaction.calldata : `0x${quote.transaction.calldata}`,
        value: quote.transaction.value ?? "0",
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    return giftErrorResponse(error);
  }
}
