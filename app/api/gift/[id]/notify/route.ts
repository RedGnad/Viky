import { NextResponse } from "next/server";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { assertSameOrigin } from "@/src/api-guard";
import { NO_STORE } from "@/src/gift-api";
import { loadGift } from "@/src/gift-store";
import { pushConfigured } from "@/src/morning-send-live";
import { endpointOf } from "@/src/push-endpoint";
import { forgetSubscription, isSubscribed, rememberSubscription } from "@/src/push-store";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Being told each morning about one gift, and stopping (N1, 17 Sep 2026).
 *
 * This replaces the template's `/api/notification`, which sent whatever text it was given to whatever subscription it
 * was given: anybody could have written a notification from Viky to any browser whose endpoint they knew. Here the
 * caller says only which gift and which browser; what is ever sent is the keeper's own sentence about a settled day,
 * and only the two people the gift belongs to may ask for it.
 *
 * The browser's endpoint is personal, so it travels in the body and never in a URL.
 */

type Body = Readonly<{ intent?: unknown; subscription?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } }>;

const KEY = /^[A-Za-z0-9_-]{16,512}$/;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const rate = checkRateLimit("session", request);
  if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
  const { id } = await context.params;
  if (!/^\d{1,78}$/.test(id)) return NextResponse.json({ error: "UNKNOWN_GIFT" }, { status: 404, headers: NO_STORE });
  // Asked by Viky's own pages alone, as every route that reads a body is (src/api-guard.ts).
  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json({ error: "CROSS_ORIGIN" }, { status: 403, headers: NO_STORE });
  }

  let account: string;
  try {
    account = readAccountAuthSession(request).account.toLowerCase();
  } catch {
    return NextResponse.json({ error: "SIGN_IN_REQUIRED" }, { status: 401, headers: NO_STORE });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400, headers: NO_STORE });
  }
  const endpoint = endpointOf(body.subscription?.endpoint);
  if (!endpoint) return NextResponse.json({ error: "INVALID_SUBSCRIPTION" }, { status: 400, headers: NO_STORE });

  const record = await loadGift(id);
  if (!record) return NextResponse.json({ error: "UNKNOWN_GIFT" }, { status: 404, headers: NO_STORE });
  // Only the two people the gift is between. A gift is reachable by link, but being told about it every morning is not.
  const yours = record.funder.toLowerCase() === account || record.recipient?.toLowerCase() === account;
  if (!yours) return NextResponse.json({ error: "NOT_YOURS" }, { status: 403, headers: NO_STORE });

  if (body.intent === "off") {
    await forgetSubscription(endpoint, id);
    return NextResponse.json({ on: false }, { headers: NO_STORE });
  }
  if (body.intent === "check") {
    return NextResponse.json({ on: await isSubscribed(endpoint, id), possible: pushConfigured() }, { headers: NO_STORE });
  }
  if (body.intent !== "on") return NextResponse.json({ error: "UNKNOWN_INTENT" }, { status: 400, headers: NO_STORE });

  if (!pushConfigured()) return NextResponse.json({ error: "PUSH_NOT_CONFIGURED" }, { status: 503, headers: NO_STORE });
  const p256dh = body.subscription?.keys?.p256dh;
  const auth = body.subscription?.keys?.auth;
  if (typeof p256dh !== "string" || !KEY.test(p256dh) || typeof auth !== "string" || !KEY.test(auth)) {
    return NextResponse.json({ error: "INVALID_SUBSCRIPTION" }, { status: 400, headers: NO_STORE });
  }
  await rememberSubscription({ endpoint, giftId: id, account, p256dh, auth });
  return NextResponse.json({ on: true }, { headers: NO_STORE });
}
