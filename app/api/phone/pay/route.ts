import { NextResponse } from "next/server";
import type { Hex } from "viem";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { readJsonBody } from "@/src/api-guard";
import { NO_STORE } from "@/src/gift-api";
import { phoneErrorResponse } from "@/src/phone-api";
import { payPhoneTopUp, PhoneOrderError, PHONE_REFUSALS } from "@/src/phone-order";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";
import { admitRelay, countedIfSent } from "@/src/relay-admission";
import { canonicalSignature } from "@/src/signature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * The person's AUSD to the treasury, from the authorization they signed, then Bitrefill's invoice paid (D238). The
 * server chooses nothing: the order says the amount and the treasury, and the signature must be for exactly those.
 */
export async function POST(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("relay", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const body = await readJsonBody<{ orderId?: unknown; value?: unknown; validAfter?: unknown; validBefore?: unknown; nonce?: unknown; signature?: unknown }>(request, 4 * 1_024);
    const orderId = String(body.orderId ?? "");
    const nonce = String(body.nonce ?? "");
    if (!/^ph_[A-Za-z0-9_-]{6,40}$/.test(orderId) || !/^0x[0-9a-fA-F]{64}$/.test(nonce)) throw new PhoneOrderError("INVALID_AUTHORIZATION", PHONE_REFUSALS.invalidAuthorization, 400);
    let authorization;
    try {
      authorization = { value: BigInt(String(body.value)), validAfter: BigInt(String(body.validAfter)), validBefore: BigInt(String(body.validBefore)), nonce: nonce as Hex, signature: canonicalSignature(String(body.signature ?? "")) };
    } catch {
      throw new PhoneOrderError("INVALID_AUTHORIZATION", PHONE_REFUSALS.invalidAuthorization, 400);
    }
    // Counted against the account's and the connection's ceilings before the relayer is asked for anything (D204).
    const admitted = await admitRelay(request, auth.account);
    const status = await countedIfSent(admitted, () => payPhoneTopUp({ account: auth.account as Hex, orderId, authorization }));
    return NextResponse.json(status, { headers: NO_STORE });
  } catch (error) {
    return phoneErrorResponse(error);
  }
}
