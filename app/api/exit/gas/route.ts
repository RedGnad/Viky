import { NextResponse } from "next/server";
import { erc20Abi, getAddress, parseEther } from "viem";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { monadChain, waitForFinality, AUSD_ADDRESS } from "@/src/monad/chain";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";
import { relayerClients, relayerPreflight } from "@/src/relayer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Enough to pay for the two transactions the way out needs, and no more. */
const TOP_UP = parseEther("0.05");

/**
 * Viky pays for the recipient's way out, as it pays for everything else they do. This is not a tap anyone
 * can turn: the account must already hold something to convert, which only a gift can give it, and it must
 * be short of what the conversion costs. Both are checked on chain, not taken from the request.
 */
export async function POST(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("relay", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });

    const clients = relayerClients();
    await relayerPreflight(clients);
    const to = getAddress(auth.account);

    const held = (await clients.publicClient.readContract({
      address: AUSD_ADDRESS,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [to],
    })) as bigint;
    if (held <= 0n) throw new GiftApiError("NOTHING_TO_MOVE", "There is nothing to take out yet.", 409);

    const balance = await clients.publicClient.getBalance({ address: to });
    if (balance >= TOP_UP) return NextResponse.json({ ready: true, sent: false }, { headers: NO_STORE });

    const hash = await clients.walletClient.sendTransaction({
      account: clients.walletClient.account!,
      chain: monadChain,
      to,
      value: TOP_UP - balance,
      gas: 21_000n,
    });
    await waitForFinality(clients.publicClient, hash);
    return NextResponse.json({ ready: true, sent: true }, { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
