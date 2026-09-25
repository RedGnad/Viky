import { NextResponse } from "next/server";
import { getAddress, type Hex } from "viem";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { NO_STORE } from "@/src/gift-api";
import { phoneErrorResponse } from "@/src/phone-api";
import { followPhoneTopUp } from "@/src/phone-order";
import { giftCardsOf } from "@/src/phone-order-store";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The gift cards this account received, each with its code (D271): the page's history, the one other place a code is
 * shown. The codes are opened here for the signed-in owner and are never written anywhere else.
 */
export async function GET(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("verify", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const orders = await giftCardsOf(getAddress(auth.account));
    const cards = [];
    for (const order of orders) {
      const status = await followPhoneTopUp({ account: auth.account as Hex, orderId: order.id });
      cards.push({ orderId: order.id, name: order.operatorName, localAmount: order.localAmount, localCurrency: order.localCurrency, amount: status.amount, at: order.createdAt.toISOString(), ...(status.code ? { code: status.code } : {}) });
    }
    return NextResponse.json({ cards }, { headers: NO_STORE });
  } catch (error) {
    return phoneErrorResponse(error);
  }
}
