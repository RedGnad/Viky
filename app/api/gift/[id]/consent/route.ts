import { NextResponse } from "next/server";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { consentBytes, fromHex } from "@/src/consent";
import { giftConsent, giftConsentText, termsFor } from "@/src/consent-server";
import { readingLeave, type ReadingLeave } from "@/src/consent-guard";
import { ed25519Verifies, keepConsent, keepConsentKey, latestConsent } from "@/src/consent-store";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A recipient's agreement to what Viky reads for one gift, and their stop (the founder, 29 Sep 2026).
 *
 * GET answers the gift's two people: its state (agreed on, stopped on, or nothing yet) and what it covers in the
 * reader's own voice; to the person it is for, also the exact texts to sign. POST takes a yes or a stop signed by the
 * person's consent key: the server writes the text itself, checks the signature against it and against the key the
 * account first signed with, and keeps it. It applies at once, on every device, since every device reads it here.
 */

function viewerOf(request: Request): string | null {
  try {
    return readAccountAuthSession(request).account.toLowerCase();
  } catch {
    return null;
  }
}

/** What a reading would find now: the yes, the time before agreements, or no agreement (never given, or stopped). */
function readingOf(leave: ReadingLeave): "agreed" | "before_agreements" | "no_agreement" {
  if (!leave.allowed) return "no_agreement";
  return leave.beforeAgreements ? "before_agreements" : "agreed";
}

function stateOf(row: Awaited<ReturnType<typeof latestConsent>>) {
  return row ? { kind: row.kind, signedAt: row.signedAt.toISOString() } : null;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const rate = checkRateLimit("status", request);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const { id } = await context.params;
    if (!/^\d{1,78}$/.test(id)) throw new GiftApiError("UNKNOWN_GIFT", "Unknown gift", 404);
    const viewer = viewerOf(request);
    const consent = await giftConsent(id);
    if (!consent) throw new GiftApiError("UNKNOWN_GIFT", "Unknown gift", 404);
    const isRecipient = viewer !== null && viewer === consent.recipient?.toLowerCase();
    const isFunder = viewer !== null && viewer === consent.funder.toLowerCase();
    if (!isRecipient && !isFunder) throw new GiftApiError("NOT_YOURS", "This gift is not yours.", 403);
    const [latest, leave] = await Promise.all([latestConsent(id), readingLeave(id, consent.fundedAt)]);
    return NextResponse.json(
      {
        giftId: id,
        state: stateOf(latest),
        reading: readingOf(leave),
        opened: consent.recipient !== null,
        finished: consent.finished,
        terms: termsFor(consent, isRecipient ? "yours" : "theirs"),
        until: consent.until,
        ...(isRecipient ? { texts: { yes: giftConsentText("yes", consent, viewer), stop: giftConsentText("stop", consent, viewer) } } : {}),
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    return giftErrorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("status", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const { id } = await context.params;
    if (!/^\d{1,78}$/.test(id)) throw new GiftApiError("UNKNOWN_GIFT", "Unknown gift", 404);
    const body = (await request.json().catch(() => ({}))) as { kind?: unknown; publicKey?: unknown; signature?: unknown };
    const kind = body.kind === "stop" ? "stop" : body.kind === "yes" ? "yes" : null;
    if (!kind) throw new GiftApiError("INVALID_REQUEST", "Please try again");
    const publicKey = typeof body.publicKey === "string" ? fromHex(body.publicKey) : null;
    const signature = typeof body.signature === "string" ? fromHex(body.signature) : null;
    if (!publicKey || publicKey.length !== 32 || !signature || signature.length !== 64) throw new GiftApiError("INVALID_SIGNATURE", "The signature is malformed");
    const account = auth.account.toLowerCase();
    const consent = await giftConsent(id);
    if (!consent) throw new GiftApiError("UNKNOWN_GIFT", "Unknown gift", 404);
    // Only the person it is for, as the contract knows them, says yes or stop for what is read of them.
    if (consent.recipient?.toLowerCase() !== account) throw new GiftApiError("NOT_YOURS", "Only the person the gift is for can agree or stop.", 403);
    const text = giftConsentText(kind, consent, account);
    if (!ed25519Verifies(publicKey, consentBytes(text), signature)) throw new GiftApiError("INVALID_SIGNATURE", "The signature does not match what this gift's agreement says.");
    // The key the account first signed with, and no other: the same passkey makes it on every device.
    const publicKeyHex = String(body.publicKey).toLowerCase();
    const kept = await keepConsentKey(account, publicKeyHex);
    if (kept !== publicKeyHex) throw new GiftApiError("ANOTHER_KEY", "This was signed with another passkey than the one this account agrees with.", 403);
    const row = await keepConsent({ giftId: id, account, kind, text, publicKey: publicKeyHex, signature: String(body.signature) });
    return NextResponse.json({ giftId: id, state: stateOf(row) }, { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
