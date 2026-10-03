import { NextResponse } from "next/server";
import { getAddress } from "viem";
import { readAccountAuthSession } from "@/src/account-auth-server";
import { readJsonBody } from "@/src/api-guard";
import { GiftApiError, giftErrorResponse, NO_STORE, refuseOwnGift } from "@/src/gift-api";
import { relayClaim } from "@/src/gift-relay";
import { loadGift, loadGiftForClaim, markClaimed } from "@/src/gift-store";
import { milestoneErrorResponse } from "@/src/milestone-api";
import { isMilestoneGiftId } from "@/src/milestone-protocol";
import { milestoneClaim } from "@/src/milestone-routes";
import { checkRateLimit, rateLimitResponseHeaders } from "@/src/rate-limit";
import { admitWayOut, countedIfSent } from "@/src/relay-admission";
import { assertGiftContractConfigured, escrowOf } from "@/src/relayer";
import { opensByItsLink } from "@/src/v2";
import { openingOf, openWithTheLinkKey, versionOfGift } from "@/src/v2-opening";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Binds the signed-in account to the gift its claim link points to. The link secret is all that is
 * checked, so whoever holds the link takes the gift (D58, D72); the evidence signer attests it and the
 * relayer submits. The money is already in the recipient's name; this is where it gets an account.
 *
 * A gift of the second version is opened by the key of its link instead (src/v2-opening.ts): the person's browser
 * makes that key from the secret after the link's `#` and signs with it, the server is sent the signature alone, and
 * the evidence signer attests nothing. A key in the body of such a request is refused, whatever it is.
 */
export async function POST(request: Request) {
  try {
    const auth = readAccountAuthSession(request);
    const rate = checkRateLimit("relay", request, auth.account);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: rateLimitResponseHeaders(rate) });
    const body = await readJsonBody<{ giftId?: string; token?: string; opening?: { deadline?: string; signature?: string } }>(request, 2 * 1_024);
    const giftId = String(body.giftId ?? "").trim();
    if (!/^\d{1,78}$/.test(giftId)) throw new GiftApiError("CLAIM_LINK_INVALID", "This link is not valid", 404);
    // The second version: the opening is the link key's own signature, and the server takes no secret for it.
    if (body.opening !== undefined) {
      // The signature is all an opening carries. A key beside it is one the server should never have been sent.
      if (body.token !== undefined) throw new GiftApiError("OUT_OF_DATE", "This page is out of date. Load it again to open your gift. Nothing was changed.", 409);
      const opening = openingOf(body.opening);
      assertGiftContractConfigured();
      const known = await loadGift(giftId);
      if (!known || !opensByItsLink(versionOfGift(known)) || known.recipient) throw new GiftApiError("CLAIM_LINK_INVALID", "This link is not valid or was already used", 404);
      refuseOwnGift(known, auth.account);
      // Counted once the signature has been held to the gift's own opening key, and held against the part of
      // everybody's count kept for the ways out (the review of 2 Oct 2026, R-16).
      const admit = () => admitWayOut(request, auth.account);
      // A milestone gift's own refusals are said in its own words, as on the first version.
      const opened = isMilestoneGiftId(giftId)
        ? await openWithTheLinkKey(known, auth.account, opening, admit).catch((error: unknown) => milestoneErrorResponse(error))
        : await openWithTheLinkKey(known, auth.account, opening, admit);
      if (opened instanceof NextResponse) return opened;
      await markClaimed(giftId, auth.account, opened.hash);
      return NextResponse.json({ giftId, opened: true }, { headers: NO_STORE });
    }
    const token = String(body.token ?? "").trim();
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) throw new GiftApiError("CLAIM_LINK_INVALID", "This link is not valid", 404);
    assertGiftContractConfigured();
    // A gift of the second version is never opened by the server's own attestation, and takes no key in a request's
    // body, whatever that key is: its preview token, or the secret of its link, which no request should carry (the
    // review of 2 Oct 2026, R-01). A page loaded before the second version was set sends one here, and is asked to load
    // again rather than told its link is bad. Refused before the key is compared with anything.
    const named = await loadGift(giftId);
    if (named && opensByItsLink(versionOfGift(named))) throw new GiftApiError("OUT_OF_DATE", "This page is out of date. Load it again to open your gift. Nothing was changed.", 409);
    const gift = await loadGiftForClaim(giftId, token);
    if (!gift) throw new GiftApiError("CLAIM_LINK_INVALID", "This link is not valid or was already used", 404);
    refuseOwnGift(gift, auth.account);
    const admitted = await admitWayOut(request, auth.account);
    // A milestone gift is opened on its own contract (C2), with the same link and the same rule.
    if (isMilestoneGiftId(giftId)) return await countedIfSent(admitted, () => milestoneClaim({ record: gift, recipient: auth.account })).catch((error: unknown) => milestoneErrorResponse(error));

    const result = await countedIfSent(admitted, () => relayClaim({ giftId, escrow: escrowOf(gift), recipient: getAddress(auth.account), contactHash: gift.contactHash }));
    await markClaimed(giftId, auth.account, result.hash);
    return NextResponse.json({ giftId, opened: true }, { headers: NO_STORE });
  } catch (error) {
    return giftErrorResponse(error);
  }
}
