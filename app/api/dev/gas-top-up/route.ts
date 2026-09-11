import { NextResponse } from "next/server";
import { getAddress, parseEther } from "viem";
import { requireOperator } from "@/src/dev-access";
import { giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { monadChain, waitForFinality } from "@/src/monad/chain";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";
import { relayerClients, relayerPreflight } from "@/src/relayer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TOP_UP = parseEther("0.05");

/**
 * Dev-only plumbing for the exit leg of KT1: the relayer sends a little MON to the signed-in account so it
 * can send its own swap. A consumer screen never shows this; the productised exit is a later task.
 */
export async function POST(request: Request) {
  try {
    const auth = requireOperator(request);
    const rate = checkRateLimit("relay", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });

    const clients = relayerClients();
    await relayerPreflight(clients);
    const to = getAddress(auth.account);
    const balance = await clients.publicClient.getBalance({ address: to });
    if (balance >= TOP_UP) return NextResponse.json({ toppedUp: false, reason: "ENOUGH" }, { headers: NO_STORE });
    const hash = await clients.walletClient.sendTransaction({
      account: clients.walletClient.account!,
      chain: monadChain,
      to,
      value: TOP_UP,
      gas: 21_000n,
    });
    await waitForFinality(clients.publicClient, hash);
    return NextResponse.json({ toppedUp: true, hash }, { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
