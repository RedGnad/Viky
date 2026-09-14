/**
 * The rails that turn euros into what a gift holds, and back. The journey never mentions one: a person
 * adds money, and later takes it out. Which company stands behind that is one object, so replacing it is
 * replacing this object and nothing else, with no change to any step the person takes (D42).
 *
 * Today both ways run on Mercuryo's consumer page, which takes no parameters from us, so the person does
 * the last stretch with their own hands. A partner rail would keep the same shape and only drop the
 * handing over: the amount and the destination would already be filled in.
 */

import { PAYOUT_MINIMUM } from "./exit-plan";

/**
 * Where this rail serves nobody, read from its own availability page on 14 Sep 2026 (updated there 2 Sep).
 * It decides who a gift can be sent to, so it is a fact about the product and not a footnote: a recipient in
 * one of these countries can be given a gift and can earn it, and can never turn it into money.
 *
 * Senegal and Ivory Coast are deliberately absent from this list and were checked for: the cross-border
 * gifts of the pilot are aimed there, and at France and the rest of the union outside Hungary and Iceland.
 */
export const RAIL_CLOSED_IN: readonly string[] = [
  "Abkhazia", "Afghanistan", "Algeria", "Angola", "Antarctica", "Aland Islands", "Bangladesh", "Barbados",
  "Belarus", "Bolivia", "Burundi", "Cambodia", "Central African Republic", "Chile", "China", "Colombia",
  "Congo", "Costa Rica", "Crimea and the occupied territories of eastern Ukraine", "Cuba",
  "Democratic Republic of the Congo", "Ecuador", "French Guiana", "French Polynesia", "Guam", "Guatemala",
  "Guinea-Bissau", "Haiti", "Honduras", "Hungary", "Iceland", "Iran", "Iraq", "Kosovo", "Lebanon", "Liberia",
  "Libya", "Mali", "Morocco", "Myanmar", "Nepal", "Nicaragua", "North Korea", "Pakistan", "Palestine",
  "Panama", "Papua New Guinea", "Russian Federation", "Sierra Leone", "Somalia", "South Ossetia",
  "South Sudan", "Sudan", "Syria", "Tunisia", "Venezuela", "Western Sahara", "Yemen", "Zimbabwe",
];

export type RailHandoff = Readonly<{
  /** The company doing the payment. Named on screen because they are the ones taking the money. */
  name: string;
  /** Their page, opened beside ours. */
  page: string;
  /**
   * What the person must be told before they are sent anywhere, in their own words and their own currency.
   * Measured, never guessed: see the decision each one cites.
   */
  smallest: string;
  /**
   * The same smallest amount as the rail itself counts it, when we enforce it. The sentence above is for a
   * person and drifts with the rate; this is the number a route refuses below, and the two are checked
   * against each other so a screen can never promise a floor the code does not keep.
   */
  smallestInCoin?: bigint;
  fee: string;
  /** Anything that stops a person before they start, in the order they would meet it. Measured, never guessed. */
  conditions: readonly string[];
  /** Countries where this rail will not serve anybody, whatever else is true. */
  closedIn: readonly string[];
  /** True while the person has to carry something across by hand. A partner rail sets this to false. */
  byHand: true;
}>;

/** Adding money (D20, D32). */
export const WAY_IN: RailHandoff = {
  name: "Mercuryo",
  page: "https://exchange.mercuryo.io",
  smallest: "25 EUR",
  fee: "about 3.8%",
  conditions: ["Identity check the first time, once.", "A card in your name."],
  closedIn: RAIL_CLOSED_IN,
  byHand: true,
};

/**
 * Taking it out (D20, D41, and corrected by D59 and D60).
 *
 * The figures here were wrong until 14 Sep: this said the smallest payout was about five dollars and the fee
 * a flat three euros. Their own limits endpoint says the smallest sell order is 879.889 of the coin, close to
 * twenty one dollars at the rate of that day, and their fee runs to 3.95 % with a floor of four euros. A
 * twenty dollar gift therefore cannot be cashed out here at all, which is a fact about the product and not a
 * detail of the rail, so it is written where a screen can read it.
 */
export const WAY_OUT: RailHandoff = {
  name: "Mercuryo",
  page: "https://exchange.mercuryo.io/?type=sell&currency=MON&network=MONAD",
  smallest: "about $21.00",
  smallestInCoin: PAYOUT_MINIMUM,
  fee: "up to 3.95%, and never less than 4 EUR",
  conditions: [
    "Identity check before your first payout, once.",
    "It goes back to a card, in euros or dollars. Not to a bank account.",
    "Once you place the order you have six hours to send it. Viky sends it in one go, straight away.",
  ],
  closedIn: [...RAIL_CLOSED_IN, "United Kingdom"],
  byHand: true,
};
