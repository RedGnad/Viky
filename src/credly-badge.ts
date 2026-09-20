import { keccak256, stringToHex, type Hex } from "viem";

/**
 * A certification on Credly, the "get a certification" family (the founder's line of 20 Sep 2026). Browser safe.
 *
 * Only the goal lives here for now: the number and the provider id the founder registers on `MilestoneGift`, in the
 * session the whole set is signed in. The reading itself comes with the line that offers it, and nothing is offered
 * until then.
 *
 * What the reading will be, measured on 20 Sep 2026 and to be measured again when it is built: Credly hosts Open
 * Badges v2. The assertion at `credly.com/api/v1/obi/v2/badge_assertions/<badge id>` carries `issuedOn`, a `badge`
 * URL that pins the issuer's id and the badge class's id in one string, and the holder as a hashed email; the public
 * page at `credly.com/badges/<badge id>/public_url` carries one `og:title` of a fixed shape, "<title> was issued by
 * <issuer> to <holder>.", and answers 500 when asked for JSON. The day is in the assertion and nowhere in the page.
 */

/** The goal type on the milestone contract, after the four Chess.com cadences, the test, Lichess and Coursera. */
export const CREDLY_GOAL_TYPE = 11;

export function credlyProviderId(): Hex {
  return keccak256(stringToHex("viky:provider:credly-badge-zkfetch:v1"));
}
