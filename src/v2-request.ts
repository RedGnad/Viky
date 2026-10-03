import { getAddress, isAddress, type Hex } from "viem";
import { GiftApiError } from "./gift-api";
import { milestoneGiftV2Address, newDailyGiftsContract } from "./v2";

/**
 * What a creation request of the second version carries beside the terms (the audit of 1 Oct 2026): the address of the
 * key that opens the gift, which the funder signed into the terms, and the fingerprint of the link's preview token,
 * which is what the link sends in `?t=`. Never the link's secret: it was made in the funder's browser, it travels after
 * the `#` of the link, and no request of Viky's code carries it (the review of 2 Oct 2026, R-01). A secret that reaches
 * the server all the same, in `?t=` or in a request's body, is refused (src/v2-opening.ts).
 *
 * Server only. The two versions never mix: a request without a link is refused once the second version is set, since
 * the page that sent it was loaded before; a request with one is refused while it is not set.
 */

export type RequestedLink = Readonly<{ openingKey: Hex; fingerprint: string }>;

const FINGERPRINT = /^[0-9a-f]{64}$/;

export function requestedLink(body: Readonly<{ openingKey?: unknown; linkFingerprint?: unknown }>, kind: "daily" | "milestone"): RequestedLink | null {
  const second = kind === "daily" ? newDailyGiftsContract() : milestoneGiftV2Address();
  const carriesOne = body.openingKey !== undefined || body.linkFingerprint !== undefined;
  if (!carriesOne) {
    if (second) throw new GiftApiError("OUT_OF_DATE", "This page is out of date. Load it again and send the gift from there. Nothing was taken.", 409);
    return null;
  }
  if (!second) throw new GiftApiError("NOT_CONFIGURED", "Viky is not ready for this yet. Nothing was changed.", 503);
  const openingKey = String(body.openingKey ?? "");
  const fingerprint = String(body.linkFingerprint ?? "");
  if (!isAddress(openingKey) || /^0x0{40}$/.test(openingKey) || !FINGERPRINT.test(fingerprint)) {
    throw new GiftApiError("OUT_OF_DATE", "This page is out of date. Load it again and send the gift from there. Nothing was taken.", 400);
  }
  return { openingKey: getAddress(openingKey), fingerprint };
}

/** The link a creation answers: the server's own on the first version, none on the second, where the browser builds it. */
export function answeredLink(origin: string, giftId: string, claimToken: string): string | null {
  return claimToken ? `${origin}/g/${giftId}?t=${claimToken}` : null;
}
