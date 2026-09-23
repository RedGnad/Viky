import { NextResponse } from "next/server";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { readJsonBody } from "@/src/api-guard";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { parseSealedSpace, SEALED_CIPHERTEXT_MAX_LENGTH } from "@/src/private-space";
import { keepPrivateSpace, loadPrivateSpace } from "@/src/private-space-store";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The funder's private space, sealed. This route keeps and answers an envelope it cannot open: the key is derived in
 * the browser from the passkey and is never sent here. Only the account signed in on this browser reads or writes its
 * own envelope.
 */
export async function GET(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("status", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly.", code: "RATE_LIMITED" }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    return NextResponse.json(await loadPrivateSpace(auth.account), { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("status", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly.", code: "RATE_LIMITED" }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const body = await readJsonBody<{ sealed?: unknown; revision?: unknown }>(request, SEALED_CIPHERTEXT_MAX_LENGTH + 1_024);
    const sealed = parseSealedSpace(body.sealed);
    if (!sealed) throw new GiftApiError("NOT_A_SEALED_SPACE", "This could not be kept. Open your private space again.");
    const revision = body.revision;
    if (typeof revision !== "number" || !Number.isInteger(revision) || revision < 0) throw new GiftApiError("NOT_A_SEALED_SPACE", "This could not be kept. Open your private space again.");
    const kept = await keepPrivateSpace(auth.account, sealed, revision);
    if (kept === null) throw new GiftApiError("CHANGED_ELSEWHERE", "It was changed on another device. Open it again to see the latest.", 409);
    return NextResponse.json({ revision: kept }, { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
