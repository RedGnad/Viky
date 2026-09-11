import { NextResponse } from "next/server";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { readJsonBody } from "@/src/api-guard";
import { BINDING_CODE_TTL_SECONDS, isValidDuolingoUsername, newBindingCode } from "@/src/duolingo-public-terms";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { loadGift, setRecipientUsername } from "@/src/gift-store";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The recipient names their own Duolingo account (the funder did not). A fresh code is issued; the
 * person puts it in their Duolingo display name for a minute and the bind route proves it (D27).
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const rate = checkRateLimit("session", request);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const { id } = await context.params;
    const auth = readAccountAuthSession(request);
    const body = await readJsonBody<{ username?: string }>(request, 1_024);
    const username = String(body.username ?? "").trim();
    if (!isValidDuolingoUsername(username)) throw new GiftApiError("INVALID_USERNAME", "That does not look like a Duolingo username.", 400);
    const gift = await loadGift(id);
    if (!gift || !gift.recipient || gift.recipient.toLowerCase() !== auth.account.toLowerCase()) throw new GiftApiError("NOT_RECIPIENT", "Open the gift first.", 403);
    if (gift.boundAt) throw new GiftApiError("ALREADY_BOUND", "This gift is already counting.", 409);
    if (gift.usernameSource === "funder" && gift.goalUsername) throw new GiftApiError("NAMED_BY_FUNDER", "The person who sent this gift already named your account.", 409);
    const code = newBindingCode(() => crypto.getRandomValues(new Uint8Array(1))[0]);
    const expiresAt = new Date(Date.now() + BINDING_CODE_TTL_SECONDS * 1_000);
    const saved = await setRecipientUsername(id, username, code, expiresAt);
    if (!saved) throw new GiftApiError("ALREADY_BOUND", "This gift is already counting.", 409);
    return NextResponse.json({ giftId: id, username, code, expiresAt: expiresAt.toISOString() }, { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
