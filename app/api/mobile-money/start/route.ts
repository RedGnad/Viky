import { NextResponse } from "next/server";
import type { Hex } from "viem";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { readJsonBody } from "@/src/api-guard";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { startPayout } from "@/src/mobile-money-server";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Opens the payout for the dollars an exchange just made, for the signed-in account: the exchange is named by its
 * transaction, and the amount is read from it, never taken from the browser. Nothing moves here: Switch answers where
 * to send those dollars, once, within 30 minutes, and the person's own signature sends them next.
 */
export async function POST(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("relay", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const body = await readJsonBody<{ exitTx?: string; country?: string; network?: string; number?: string; holderName?: string }>(request, 2 * 1_024);
    const exitTx = String(body.exitTx ?? "");
    if (!/^0x[0-9a-fA-F]{64}$/.test(exitTx)) throw new GiftApiError("INVALID_REQUEST", "Please try again");
    const origin = process.env.NEXT_PUBLIC_APP_URL?.trim() || new URL(request.url).origin;
    const started = await startPayout({
      account: auth.account,
      exitTx: exitTx as Hex,
      country: String(body.country ?? "").toUpperCase(),
      network: String(body.network ?? ""),
      number: String(body.number ?? "").replace(/\D/g, ""),
      holderName: String(body.holderName ?? "").trim(),
      callbackUrl: `${origin}/api/mobile-money/webhook`,
    });
    return NextResponse.json(started, { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
