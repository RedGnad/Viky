import type { RailReach } from "./rail-country";
import { WAY_OUT_CARD, WAY_OUT_EURO, type PublishedFee } from "./rails";

/**
 * "Use your money" (D270, the founder's decision of 26 Sep 2026, the mockups use.html and use-france.html): the way
 * out said as uses, one card per use, filtered and ordered by the country of the person's number and by the amount.
 * Browser safe: no fetch, no key.
 *
 * Four uses: their phone (Bitrefill, D238), a gift card (Bitrefill, D271), their bank (Ramp, euros), their card
 * (Mercuryo). Every one whose code is complete is offered to everybody the day it is deployed (the founder, 26 Sep
 * 2026): what is missing is said where it is missing, by the route that refuses.
 */
export type Use = "phone" | "giftcard" | "bank" | "card";

/**
 * Where the card rail pays no card, whatever its currencies endpoint says: France, the rest of the European Economic
 * Area and the United States, published in Mercuryo's help centre on 15 Sep 2026 (D72) and not in any answer a screen
 * can read. The Area's members are fixed by its agreement, not by a service, which is why this one list is written
 * here: the twenty-seven of the Union, Iceland, Liechtenstein and Norway, and the United States.
 */
export const CARD_PAYOUT_CLOSED: readonly string[] = [
  "at", "be", "bg", "hr", "cy", "cz", "dk", "ee", "fi", "fr", "de", "gr", "hu", "ie", "it", "lv", "lt", "lu", "mt",
  "nl", "pl", "pt", "ro", "sk", "si", "es", "se", "is", "li", "no", "us",
];

/**
 * The uses offered for this number's country: only what works there (the README's second rule). The phone and the gift
 * card always, the gift card with a country to list cards for; the bank unless its own payout list says it pays nobody there; the card unless its
 * own list restricts that country or it is one the card rail pays no card in. A country nobody knows yet hides nothing.
 */
export function usesFor(country: string | null, reach: Readonly<Record<string, RailReach>>, phoneOffered: boolean, giftCardsOffered = false): readonly Use[] {
  const uses: Use[] = [];
  if (phoneOffered) uses.push("phone");
  // A gift card is chosen from the cards Bitrefill lists for the number's country, so it needs one (D271).
  if (giftCardsOffered && country) uses.push("giftcard");
  if (reach[WAY_OUT_EURO.name] !== "does-not") uses.push("bank");
  if (reach[WAY_OUT_CARD.name] !== "does-not" && !(country && CARD_PAYOUT_CLOSED.includes(country.toLowerCase()))) uses.push("card");
  return uses;
}

/**
 * Whether an amount is small for a rail: its published minimum fee would take more than a tenth of it. Below that, the
 * phone gives more of the money than a rail that keeps a fixed part of it.
 */
export const SMALL_SHARE = 0.1;
export function smallFor(fee: PublishedFee, euros: number | undefined): boolean {
  if (euros === undefined || !(euros > 0)) return false;
  return fee.minimum / euros > SMALL_SHARE;
}

/**
 * The order of the cards, the first taking the sun (the README's fourth rule): the one that gives this person the most
 * without a word of crypto. A rail whose amount is not small comes first, the one that leaves more when both are
 * offered; otherwise the phone. The rest follow, rails by what they leave, then the phone.
 */
export function orderUses(uses: readonly Use[], euros: number | undefined, net: (use: "bank" | "card") => number | undefined): readonly Use[] {
  const fee = (use: "bank" | "card") => (use === "bank" ? WAY_OUT_EURO.fee : WAY_OUT_CARD.fee);
  const rails = uses.filter((use): use is "bank" | "card" => use === "bank" || use === "card").sort((left, right) => (net(right) ?? 0) - (net(left) ?? 0));
  const worth = rails.filter((use) => !smallFor(fee(use), euros));
  const candidates: readonly Use[] = [...worth, ...(uses.includes("phone") ? (["phone"] as const) : []), ...rails, ...(uses.includes("giftcard") ? (["giftcard"] as const) : [])];
  const first: Use | undefined = candidates.length > 0 ? candidates[0] : undefined;
  if (!first) return [];
  const rest: Use[] = [...rails, ...(uses.includes("phone") ? (["phone"] as const) : [])];
  // The gift card second, whatever leads, as both mockups draw it (use.html, use-france.html, 26 Sep 2026).
  const gift: Use[] = uses.includes("giftcard") && first !== "giftcard" ? ["giftcard"] : [];
  return [first, ...gift, ...rest.filter((use) => use !== first)];
}
