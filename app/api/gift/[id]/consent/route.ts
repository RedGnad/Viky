import { NextResponse } from "next/server";
import { assertSameOrigin } from "@/src/api-guard";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { consentBytes, fromHex } from "@/src/consent";
import { giftConsent, giftConsentText, termsFor } from "@/src/consent-server";
import { anchorContract, anchorOffer, anchorSignatureStands, anchorWaitingRows, bindingStands, requestedAnchor } from "@/src/consent-anchoring";
import { readingLeave, type ReadingLeave } from "@/src/consent-guard";
import { consentsWaitingForAnchor, ed25519Verifies, keepBinding, keepConsent, keepConsentKey, latestConsent } from "@/src/consent-store";
import { GiftApiError, giftErrorResponse, NO_STORE } from "@/src/gift-api";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";
import { admitRelay, countedIfSent } from "@/src/relay-admission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A recipient's agreement to what Viky reads for one gift, and their stop (the founder, 29 Sep 2026).
 *
 * GET answers the gift's two people: its state (agreed on, stopped on, or nothing yet) and what it covers in the
 * reader's own voice; to the person it is for, also the exact texts to sign. POST takes a yes or a stop signed by the
 * person's consent key: the server writes the text itself, checks the signature against it and against the key the
 * account first signed with, and keeps it. It applies at once, on every device, since every device reads it here.
 *
 * Once the anchor is set (src/consent-anchoring.ts), the person it is for is also told what to sign for the public
 * record, and a yes or a stop that comes with it is written there by the relayer once it is kept. The agreement never
 * waits on that: a row that could not be written stays kept, and applies.
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
    // The state is read here and no reading is taken: nothing is sent to the anchor by a page being opened.
    const [latest, leave, anchor] = await Promise.all([latestConsent(id), readingLeave(id, consent.fundedAt, false), isRecipient ? anchorOffer(viewer, id) : null]);
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
        ...(anchor ? { anchor } : {}),
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    return giftErrorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("status", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const { id } = await context.params;
    if (!/^\d{1,78}$/.test(id)) throw new GiftApiError("UNKNOWN_GIFT", "Unknown gift", 404);
    const body = (await request.json().catch(() => ({}))) as { kind?: unknown; publicKey?: unknown; signature?: unknown; anchor?: unknown };
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
    // What came for the public record is checked before anything is kept, so a row never waits with a signature
    // the anchor's readers would find wrong. Without the anchor set, whatever came is left aside.
    const contract = anchorContract();
    const signed = contract ? requestedAnchor(body.anchor) : null;
    if (signed === false) throw new GiftApiError("INVALID_SIGNATURE", "The signature is malformed");
    if (contract && signed) {
      if (!anchorSignatureStands(contract, { account, giftId: id, kind, text, publicKey: publicKeyHex }, signed)) throw new GiftApiError("INVALID_SIGNATURE", "The signature does not match what this gift's agreement says.");
      if (signed.binding && !(await bindingStands(contract, account, publicKeyHex, signed.binding))) throw new GiftApiError("INVALID_SIGNATURE", "The signature does not match what this gift's agreement says.");
    }
    const kept = await keepConsentKey(account, publicKeyHex);
    if (kept !== publicKeyHex) throw new GiftApiError("ANOTHER_KEY", "This was signed with another passkey than the one this account agrees with.", 403);
    const row = await keepConsent({ giftId: id, account, kind, text, publicKey: publicKeyHex, signature: String(body.signature), anchor: signed ? { sequence: signed.sequence, signature: signed.signature } : null });
    if (signed) {
      // Kept, and so in force. Writing it on the anchor is the relayer's cost, counted like any other, and a refusal
      // or a failure there changes nothing for the person: the row waits, and a yes is tried again before a reading.
      try {
        if (signed.binding) await keepBinding(account, signed.binding);
        const admitted = await admitRelay(request, account);
        // Whatever of this gift still waits is written first, in the order the places were signed: a stop cannot take
        // its place on the anchor before the yes it follows (the review of 2 Oct 2026, R-07).
        await countedIfSent(admitted, async () => {
          await anchorWaitingRows(await consentsWaitingForAnchor(id));
        });
      } catch (error) {
        console.error(`consent anchor: gift ${id}, row ${row.id}: left waiting: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return NextResponse.json({ giftId: id, state: stateOf(row) }, { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
