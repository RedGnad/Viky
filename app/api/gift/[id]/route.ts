import { NextResponse } from "next/server";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { giftStatusFor } from "@/src/gift-status";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The account this request is signed in as, or nobody: reading a gift never needs one. */
function viewerOf(request: Request): string | null {
  try {
    return readAccountAuthSession(request).account;
  } catch {
    return null;
  }
}

/**
 * The state of a gift for its screens: what is already the recipient's, what came back, which day it
 * is. Numbers are raw units plus a formatted dollar string; the transaction list serves the judges
 * page only. Reading a gift needs no sign-in: the contract is public and the page is reached by link.
 *
 * The two names are not public. Gift numbers follow each other, so anyone could read gift after gift; the names go
 * only to a request that carries the link's key, or to the funder or the recipient signed in. That is what the check
 * screen promises the funder: the names show to whoever has the link. On the second version of the contracts what the
 * link carries in `?t=` is a preview token, and the secret that opens the gift is refused here should it ever be sent
 * (src/v2-opening.ts).
 *
 * What it answers is built in `src/gift-status.ts`, which the gift's page reads directly while it renders (D160).
 * This route is what the browser asks when it comes back to a page it already has.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const rate = checkRateLimit("status", request);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const { id } = await context.params;
    if (!/^\d{1,78}$/.test(id)) throw new GiftApiError("UNKNOWN_GIFT", "Unknown gift", 404);
    const status = await giftStatusFor(id, { account: viewerOf(request), linkKey: new URL(request.url).searchParams.get("t") });
    return NextResponse.json(status, { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
