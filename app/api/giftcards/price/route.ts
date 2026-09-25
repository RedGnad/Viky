import { NextResponse } from "next/server";
import type { Hex } from "viem";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { readJsonBody } from "@/src/api-guard";
import { NO_STORE } from "@/src/gift-api";
import { phoneErrorResponse } from "@/src/phone-api";
import { priceGiftCard } from "@/src/phone-order";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Prices a gift card and writes it down (D271). Nothing moves: the answer is what the person will be asked to sign. */
export async function POST(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("verify", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const body = await readJsonBody<{ productId?: unknown; packageId?: unknown; value?: unknown }>(request, 2_048);
    const value = typeof body.value === "number" && Number.isFinite(body.value) && body.value > 0 ? body.value : undefined;
    const packageId = typeof body.packageId === "string" && body.packageId.length <= 120 ? body.packageId : undefined;
    const priced = await priceGiftCard({ account: auth.account as Hex, productId: String(body.productId ?? ""), packageId, value });
    return NextResponse.json({ ...priced, ausdUnits: priced.ausdUnits.toString() }, { headers: NO_STORE });
  } catch (error) {
    return phoneErrorResponse(error);
  }
}
