import { NextResponse } from "next/server";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { readJsonBody } from "@/src/api-guard";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { relayCheckIn } from "@/src/gift-relay";
import { loadAttestation } from "@/src/proof-session-store";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";
import { admitRelay } from "@/src/relay-admission";
import { loadGift } from "@/src/gift-store";
import { assertGiftContractConfigured, escrowOf } from "@/src/relayer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Relays the check-in attestation recorded by the verify route, for the rare case where the verify
 * route recorded it but could not submit. Idempotent: a session is relayed once.
 */
export async function POST(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("relay", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const body = await readJsonBody<{ sessionId?: string }>(request, 2 * 1_024);
    const sessionId = String(body.sessionId ?? "").trim();
    if (!/^[a-zA-Z0-9_-]{6,200}$/.test(sessionId)) throw new GiftApiError("UNKNOWN_SESSION", "Unknown check-in", 404);
    assertGiftContractConfigured();
    const stored = await loadAttestation(sessionId);
    if (!stored || String(stored.message.recipient).toLowerCase() !== auth.account.toLowerCase()) {
      throw new GiftApiError("UNKNOWN_SESSION", "Unknown check-in", 404);
    }
    const gift = await loadGift(String(stored.message.giftId));
    if (!gift) throw new GiftApiError("UNKNOWN_SESSION", "Unknown check-in", 404);
    await admitRelay(request, auth.account);
    const relayed = await relayCheckIn(sessionId, escrowOf(gift));
    return NextResponse.json({ recorded: true, creditedDays: relayed.creditedDays, alreadyRecorded: relayed.alreadyRelayed }, { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
