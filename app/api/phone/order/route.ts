import { NextResponse } from "next/server";
import type { Hex } from "viem";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { NO_STORE } from "@/src/gift-api";
import { phoneErrorResponse } from "@/src/phone-api";
import { followPhoneTopUp, PhoneOrderError, PHONE_REFUSALS } from "@/src/phone-order";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Where one of the person's top-ups stands (D238), moving it on when Bitrefill has: delivered, or its money sent back. */
export async function GET(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("verify", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const orderId = new URL(request.url).searchParams.get("id") ?? "";
    if (!/^ph_[A-Za-z0-9_-]{6,40}$/.test(orderId)) throw new PhoneOrderError("NOT_YOURS", PHONE_REFUSALS.notYours, 404);
    return NextResponse.json(await followPhoneTopUp({ account: auth.account as Hex, orderId }, undefined, 20_000), { headers: NO_STORE });
  } catch (error) {
    return phoneErrorResponse(error);
  }
}
