import { NextResponse } from "next/server";
import { getAddress } from "viem";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { readJsonBody } from "@/src/api-guard";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { relayClaim } from "@/src/gift-relay";
import { loadGiftForClaim, markClaimed } from "@/src/gift-store";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Binds the signed-in account to the gift its claim link points to. The link secret proves the
 * caller received what the funder sent to the named contact; the evidence signer attests it and the
 * relayer submits. The money is already in the recipient's name; this is where it gets an account.
 */
export async function POST(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("relay", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const body = await readJsonBody<{ giftId?: string; token?: string }>(request, 2 * 1_024);
    const giftId = String(body.giftId ?? "").trim();
    const token = String(body.token ?? "").trim();
    if (!/^\d{1,78}$/.test(giftId) || !/^[A-Za-z0-9_-]{16,64}$/.test(token)) {
      throw new GiftApiError("CLAIM_LINK_INVALID", "This link is not valid", 404);
    }
    const gift = await loadGiftForClaim(giftId, token);
    if (!gift) throw new GiftApiError("CLAIM_LINK_INVALID", "This link is not valid or was already used", 404);

    const result = await relayClaim({ giftId, recipient: getAddress(auth.account), contactHash: gift.contactHash });
    await markClaimed(giftId, auth.account, result.hash);
    return NextResponse.json({ giftId, opened: true }, { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
