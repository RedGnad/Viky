import type { Hex } from "viem";
import { NATIVE_OUT } from "./exit-terms";
import { USDC_ADDRESS } from "./monad/chain";

/**
 * The rails that turn euros into what a gift holds, and back.
 *
 * Adding money never names a company: a person adds money, and Viky does the rest (D42). Taking it out does
 * name them, and that is the change D77 makes. No single payout service covers everybody: one serves the euro
 * area and refuses West Africa outright, the other pays by card across West Africa and pays nothing in France
 * or the rest of the EEA. Between them the pilot's corridors are covered, so the way out shows what exists,
 * each with where it pays, its source and the date that source was read, and the person chooses.
 *
 * **No country list is copied into this file, deliberately.** One of these lists changed on 15 Sep and the
 * other dates from June. A list frozen here would be wrong within weeks, and a false sentence about somebody's
 * money is the thing this project refuses above all (D39). What is written here is what was read, when, and
 * where to read it again; what is checked at the moment it matters is asked of the service itself
 * (src/ramp.ts).
 */

/**
 * Where the card rail serves nobody, read from its own availability page on 14 Sep 2026 (updated there 2 Sep).
 * This decides who a gift can be **sent** to, which is a different question from who can cash one out, and it
 * is the only place a list of countries is still kept: adding money happens on one rail only, so there is
 * nothing to choose between and nothing to show.
 *
 * Senegal and Ivory Coast are deliberately absent and were checked for: the cross-border gifts of the pilot
 * are aimed there, and at France and the rest of the union outside Hungary and Iceland.
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
  fee: string;
  /** Anything that stops a person before they start, in the order they would meet it. Measured, never guessed. */
  conditions: readonly string[];
  /** Countries where this rail will not serve anybody, whatever else is true. */
  closedIn: readonly string[];
  /** True while the person has to carry something across by hand. A partner rail sets this to false. */
  byHand: true;
}>;

/** Adding money (D20, D32). One rail, so nothing is named and nothing is chosen. */
export const WAY_IN: RailHandoff = {
  name: "Mercuryo",
  page: "https://exchange.mercuryo.io",
  smallest: "25 EUR",
  fee: "about 3.8%",
  conditions: ["Identity check the first time, once.", "A card in your name."],
  // Buying the coin is shut in the United Kingdom as well as selling it: their own currencies endpoint lists `gb`
  // under both `restricted_countries_onramp` and `restricted_countries_offramp` for MON on MONAD, read on 15 Sep
  // 2026 at https://api.mercuryo.io/v1.6/lib/currencies (D72), and again on 16 Sep for D77.
  closedIn: [...RAIL_CLOSED_IN, "United Kingdom"],
  byHand: true,
};

/**
 * One way out of the two. What a person needs before they choose one, and nothing they would have to take on
 * trust: every sentence here was read at the source named, on the date named.
 */
export type WayOut = Readonly<{
  name: string;
  /** Their own sell page, opened beside ours. */
  page: string;
  /** What this service buys, and therefore the coin the router must hand back (D77). */
  sells: string;
  /** That coin on chain. Zero is the chain's own coin, which is how `ExitTerms.tokenOut` names it. */
  coin: Hex;
  /** Where it pays, in one sentence, in the words a person would use. */
  where: string;
  /**
   * What it costs, measured at the source named below and **not printed on any screen yet**: nothing says a
   * figure about fees until a real amount has actually gone through one of these (16 Sep). A fee nobody has
   * paid is a claim rather than a fact, and this project only prints the second kind.
   */
  fee: string;
  /** Anything that stops a person before they start, in the order they would meet it. */
  conditions: readonly string[];
  /** Where the sentences above were read, and when. Shown on screen, so nobody has to take our word for it. */
  source: string;
  read: string;
  /** True while the person has to carry something across by hand. */
  byHand: true;
}>;

/**
 * Selling a stablecoin for a bank transfer in euros.
 *
 * It cannot sell what a gift holds. Their own asset page states that under MiCA several stablecoins, AUSD
 * among them, cannot be bought or sold in the EU or the EEA, and names USDC as one that can. So the exchange
 * step is not a convenience here, it is the only lawful route out for somebody in France, which is why the
 * router hands back the coin the terms name (D77).
 *
 * Their quote endpoint disagrees with their own widget, and the widget wins (D79). Asked from France on
 * 16 Sep 2026 it priced AUSD quite happily: 16.20 EUR net on 20.994751 AUSD, fee 1.99, offering SEPA and card.
 * The widget a real customer meets does not list AUSD at all, while other assets appear in it greyed out with
 * a message about location. An endpoint that quotes is not a service that pays: the API is for preparing, and
 * never for promising. So France stays on USDC, and no screen offers what only an API would sell.
 */
export const WAY_OUT_EURO: WayOut = {
  name: "Ramp",
  page: "https://app.ramp.network/?swapAsset=MONAD_USDC&flow=offramp",
  sells: "USDC on Monad",
  coin: USDC_ADDRESS,
  where:
    "Pays into a bank account in euros across the euro area, France included, and to a card in many other countries. It does not serve Senegal or Ivory Coast at all.",
  fee: "0.99% for a bank transfer, and never less than 1.99 EUR",
  conditions: [
    "Identity check before your first payout, once.",
    "The account or card must be in your own name.",
    "A bank transfer arrives within two working days, and in about ten seconds where instant transfers work.",
    "The smallest and largest sale move with the rate, so Viky reads them from them at the moment you ask.",
  ],
  // Payout methods and their countries: https://api.ramp.network/api/host-api/v3/payout-methods (SEPA in 35
  // countries including fr, card in 119 not including us; neither lists sn or ci). Their currencies endpoint
  // returns nothing sellable for sn and ci. The MiCA sentence and the asset table are from their own article
  // 432. Fees from article 8957. All read 16 Sep 2026.
  source: "Ramp's own payout-methods list and asset page",
  read: "16 Sep 2026",
  byHand: true,
};

/**
 * Selling the chain's own coin for a card payout.
 *
 * This is the corridor the euro rail cannot serve. Their currencies endpoint restricts selling MON on Monad in
 * the United Kingdom and nowhere else, so Senegal and Ivory Coast are open here. What it cannot do is pay in
 * France or the rest of the EEA: that is not a currency restriction but a payout one, published in their own
 * help centre on 15 Sep, that no Visa and no Mastercard payout is made there (D72). The two facts come from
 * two different sources and are kept apart on purpose.
 */
export const WAY_OUT_CARD: WayOut = {
  name: "Mercuryo",
  page: "https://exchange.mercuryo.io/?type=sell&currency=MON&network=MONAD",
  sells: "MON on Monad",
  coin: NATIVE_OUT,
  where:
    "Pays onto a Visa or Mastercard card, which is how it reaches Senegal and Ivory Coast. It makes no card payout in France, anywhere else in the EEA, or the United States.",
  fee: "up to 3.95%, and never less than 4 EUR",
  conditions: [
    "Identity check before your first payout, once.",
    "It goes back to a card, not to a bank account.",
    "Selling is shut in the United Kingdom.",
    "Once you place the order you have six hours to send it.",
  ],
  // Selling restrictions for MON on MONAD: https://api.mercuryo.io/v1.6/lib/currencies, where
  // `restricted_countries_offramp` is exactly ["gb"], read 16 Sep 2026. The absence of card payouts in France,
  // the EEA and the United States is their help centre article of 15 Sep 2026 (D72). Fee and the six hour
  // window from their limits endpoint, read 14 Sep 2026 (D59, D60).
  source: "Mercuryo's own currencies endpoint and help centre",
  read: "16 Sep 2026 (payout countries 15 Sep 2026)",
  byHand: true,
};

/**
 * Both, in the order the screen shows them. Neither is offered as "the" way out: between them they cover the
 * pilot's corridors, and which one fits is something the person knows and Viky does not ask.
 */
export const WAYS_OUT: readonly WayOut[] = [WAY_OUT_EURO, WAY_OUT_CARD];
