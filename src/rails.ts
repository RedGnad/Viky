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

/**
 * One way in of the two (D101). What a person needs before they choose one, in their own words, and what the screens
 * compute from: the coin that arrives decides whether anything has to be swapped afterwards, and the floor and the
 * fee decide what a card payment costs.
 */
export type WayIn = Readonly<{
  name: string;
  /** Their own page, opened beside ours. */
  page: string;
  /** What lands in the account: what a gift holds, or the chain's own coin, which must then be swapped. */
  arrives: "gift" | "chain";
  /**
   * The two words that rail's own page asks the person to set. They are that service's names for a coin and a
   * network, not ours: a data contract with a page we do not control (D32), quoted and never explained away.
   */
  delivers: Readonly<{ coin: string; network: string }>;
  /** Their smallest purchase, in euros, as they publish it. */
  smallestEur: number;
  /** How long they say a payment takes, in their own words, when they say it. Absent rather than guessed. */
  takes?: string;
  /** What they keep, as they publish it. */
  fee: PublishedFee;
  conditions: readonly string[];
  /** Where the sentences above were read, and when. Shown on screen, so nobody has to take our word for it. */
  source: string;
  read: string;
  /** Countries where this rail serves nobody, whatever else is true. */
  closedIn: readonly string[];
}>;

/**
 * Adding money by buying what a gift already holds (D101). Their own asset list carries `MONAD_AUSD` at the address
 * this app pays gifts in, enabled, beside the chain's coin and the euro one, with a purchase floor of 6 EUR and fees
 * of 0.99 % to 3.9 % with a 2.49 EUR minimum, all read on 18 Sep 2026 at
 * `https://api.ramp.network/api/host-api/assets`. Nothing is swapped after it: what arrives is what a gift holds.
 *
 * What is not known here is which countries may buy: their per-country answer needs a key we do not have, and the
 * payout list is about paying out, which is a different question. So this rail says nothing about a country, and the
 * screen orders what it can and hides nothing (R1).
 */
export const WAY_IN_GIFT_COIN: WayIn = {
  name: "Ramp",
  page: "https://app.ramp.network/?swapAsset=MONAD_AUSD&flow=onramp",
  arrives: "gift",
  delivers: { coin: "AUSD", network: "Monad" },
  // `minPurchaseAmountEur: 6`, `minFeePercent: 0.99`, `maxFeePercent: 3.9`, `minFeeAmountEur: 2.49`, the same figures
  // on 18 Sep and on 20 Sep 2026 at the endpoint above, with `MONAD_AUSD` enabled and not hidden.
  smallestEur: 6,
  fee: { percent: 3.9, upTo: true, minimum: 2.49, currency: "EUR" },
  conditions: ["Identity check the first time, once.", "A card or a bank account in your name."],
  source: "Ramp's own asset list",
  read: "20 Sep 2026",
  closedIn: RAIL_CLOSED_IN,
};

/**
 * Adding money by buying the chain's own coin, which is then swapped for what a gift holds. The rail Viky started
 * with (D20, D32), kept because it serves places the other may not.
 *
 * Its floor is published, not inferred: `fiat_payment_methods.EUR.limits.min` is "25" at
 * `https://api.mercuryo.io/v1.6/lib/currencies` for card, Google Pay and Apple Pay, read 10 Sep, 14 Sep and again
 * 20 Sep 2026. Their `public/convert` endpoint prices a 1 EUR purchase quite happily (fee 0.04 EUR, 20 Sep), and
 * that is the same lesson as D79 on the other rail: an endpoint that quotes is not a service that pays. The
 * published limit is the figure a screen may act on (D125).
 */
export const WAY_IN_CHAIN_COIN: WayIn = {
  name: "Mercuryo",
  page: "https://exchange.mercuryo.io",
  arrives: "chain",
  delivers: { coin: "MON", network: "Monad" },
  smallestEur: 25,
  takes: "most payments take 30 to 60 minutes, and sometimes several hours",
  fee: { percent: 3.8, upTo: false, minimum: 0, currency: "EUR" },
  conditions: ["Identity check the first time, once.", "A card in your name."],
  source: "Mercuryo's own limits and currencies",
  read: "20 Sep 2026",
  // Buying the coin is shut in the United Kingdom as well as selling it: their own currencies endpoint lists `gb`
  // under both `restricted_countries_onramp` and `restricted_countries_offramp` for MON on MONAD, read on 15 Sep
  // 2026 at https://api.mercuryo.io/v1.6/lib/currencies (D72), and again on 16 Sep for D77.
  closedIn: [...RAIL_CLOSED_IN, "United Kingdom"],
};

/** Both ways in, in the order the screen shows them before a country says otherwise: the one with nothing to swap. */
export const WAYS_IN: readonly WayIn[] = [WAY_IN_GIFT_COIN, WAY_IN_CHAIN_COIN];

/** The rail money was added through before there were two, kept for what still reads a single one. */
export const WAY_IN: RailHandoff = {
  name: WAY_IN_CHAIN_COIN.name,
  page: WAY_IN_CHAIN_COIN.page,
  smallest: `${WAY_IN_CHAIN_COIN.smallestEur} EUR`,
  fee: "about 3.8%",
  conditions: WAY_IN_CHAIN_COIN.conditions,
  closedIn: WAY_IN_CHAIN_COIN.closedIn,
  byHand: true,
};

/**
 * What a payout service keeps, as they publish it. Structured rather than a sentence, so the card and the
 * review can each build their own sentence from the same three facts and never disagree (decision 1 of the
 * design pass, 17 Sep 2026: their published fee and delay are their facts, and they go on the card with their
 * source and date).
 */
export type PublishedFee = Readonly<{
  /** The share they keep, in percent of what is sold. */
  percent: number;
  /** True when the percent is a ceiling they publish ("up to"), false when it is the rate itself. */
  upTo: boolean;
  /** Never less than this much, in `currency`. */
  minimum: number;
  currency: string;
}>;

/**
 * One way out of the two. What a person needs before they choose one, and nothing they would have to take on
 * trust: every sentence here was read at the source named, on the date named.
 */
export type WayOut = Readonly<{
  name: string;
  /**
   * What the card is called in the person's words: where the money goes, never who carries it (D124). The company is
   * named where it is met, on the steps that open its page, and behind the fold that says where the figures come from.
   */
  title: string;
  /** Their own sell page, opened beside ours. */
  page: string;
  /** What this service buys, and therefore the coin the router must hand back (D77). Never printed. */
  sells: string;
  /** That coin on chain. Zero is the chain's own coin, which is how `ExitTerms.tokenOut` names it. */
  coin: Hex;
  /** Where it pays, in one sentence, in the words a person would use. */
  where: string;
  /**
   * The one line under the figure on the card that decides (out.html, 19 Sep 2026): how it arrives, how soon, and
   * where this way is shut. Everything else about this way is said on the step where it is met.
   */
  line: string;
  /** What they keep, as they publish it, and the sentence built from it for the card. */
  fee: PublishedFee;
  /** How soon they pay, in their own words. */
  pays: string;
  /** Anything that stops a person before they start, in the order they would meet it. */
  conditions: readonly string[];
  /** Where the sentences above were read, and when. Shown on screen, so nobody has to take our word for it. */
  source: string;
  read: string;
  /** True while the person has to carry something across by hand. */
  byHand: true;
}>;

/** "Ramp keeps 0.99 % with a minimum of 1.99 EUR", built from the published figures and never retyped. */
export function feeSentence(way: { name: string; fee: PublishedFee }): string {
  const share = `${way.fee.upTo ? "up to " : ""}${way.fee.percent} %`;
  // A service that publishes no floor for its fee gets no sentence about one: "a minimum of 0.00" would be a figure
  // nobody read (the card rail in, whose published figure is a share alone).
  if (way.fee.minimum <= 0) return `${way.name} keeps ${share}`;
  return `${way.name} keeps ${share} with a minimum of ${way.fee.minimum.toFixed(2)} ${way.fee.currency}`;
}

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
  title: "Your bank",
  page: "https://app.ramp.network/?swapAsset=MONAD_USDC&flow=offramp",
  sells: "USDC on Monad",
  coin: USDC_ADDRESS,
  where: "To your bank account, in euros.",
  line: "A transfer in euros through Ramp, within 2 business days. Not in Senegal or Ivory Coast.",
  fee: { percent: 0.99, upTo: false, minimum: 1.99, currency: "EUR" },
  pays: "within 2 business days",
  // What stops a person at the service itself, said on the step that opens its page and not on the card that decides.
  conditions: ["Identity check before your first payout, once.", "The account must be in your own name."],
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
 * This is the corridor the euro rail cannot serve. What each rail serves is said by that rail's own conditions and by
 * the order the screen puts them in (R1), never by a sentence naming the other one. Their currencies endpoint restricts selling MON on Monad in
 * the United Kingdom and nowhere else, so Senegal and Ivory Coast are open here. What it cannot do is pay in
 * France or the rest of the EEA: that is not a currency restriction but a payout one, published in their own
 * help centre on 15 Sep, that no Visa and no Mastercard payout is made there (D72). The two facts come from
 * two different sources and are kept apart on purpose.
 */
export const WAY_OUT_CARD: WayOut = {
  name: "Mercuryo",
  title: "Your card",
  page: "https://exchange.mercuryo.io/?type=sell&currency=MON&network=MONAD",
  sells: "MON on Monad",
  coin: NATIVE_OUT,
  where: "To your card.",
  line: "Onto a Visa or Mastercard through Mercuryo. Not in France, the rest of Europe, or the United States.",
  fee: { percent: 3.95, upTo: true, minimum: 4, currency: "EUR" },
  pays: "onto a Visa or Mastercard card",
  // What stops a person at the service itself, said on the step that opens its page. The United Kingdom, where
  // selling is shut, is not a sentence here any more: the screen reads that restriction live from the endpoint
  // below and says it under the card for whoever is there, and a sentence about selling on a card about a
  // withdrawal was noise for everybody else (the founder, 20 Sep 2026). The six hours the order gives are said at
  // step 2, where they start running.
  conditions: ["Identity check before your first payout, once.", "The card must be in your own name."],
  // Selling restrictions for MON on MONAD: https://api.mercuryo.io/v1.6/lib/currencies, where
  // `restricted_countries_offramp` is exactly ["gb"], read 16 Sep 2026. The absence of card payouts in France,
  // the EEA and the United States is their help centre article of 15 Sep 2026 (D72). Fee and the six hour
  // window from their limits endpoint, read 14 Sep 2026 (D59, D60).
  source: "Mercuryo's own list of currencies and help centre",
  read: "16 Sep 2026 (payout countries 15 Sep 2026)",
  byHand: true,
};

/**
 * Both, in the order the screen shows them. Neither is offered as "the" way out: between them they cover the
 * pilot's corridors, and which one fits is something the person knows and Viky does not ask.
 */
export const WAYS_OUT: readonly WayOut[] = [WAY_OUT_EURO, WAY_OUT_CARD];

/**
 * Where a converted figure comes from, so a screen can say "about 9.53 EUR (rate of 16 Sep)" and mean it.
 *
 * The gift stays in dollars on chain; each account reads it in one display currency (decision 1 of the design
 * pass, 17 Sep 2026). One daily read gives both currencies offered: the euro against the dollar comes from the
 * source below, and the CFA franc has a fixed parity with the euro, so it is derived rather than read. No rate is
 * ever invented: when the source has not answered for three days, the dollar shows alone and the screen says so.
 *
 * The parity is sourced twice. The figure, 655.957 per euro, buying and selling, is on the BCEAO's manual
 * exchange-rate page of 16 Sep 2026 (https://www.bceao.int/fr/content/cours-de-change). The fixed parity itself,
 * guaranteed by a budgetary commitment of the French Treasury and in force since 1 January 1999, is Council
 * Decision 98/683/EC of 23 November 1998 (https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:31998D0683),
 * whose text carries the guarantee and not the figure. Both read 17 Sep 2026.
 */
export const RATE_SOURCE = {
  name: "European Central Bank, euro foreign exchange reference rates",
  /** The daily file, one line per currency against the euro, dated by its own `time` attribute. */
  url: "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml",
  /** Published around 16:00 CET on TARGET working days, so a Friday's figure is the latest until Monday. */
  read: "17 Sep 2026",
  /** After this long without an answer from the source, no converted figure is shown at all. */
  staleAfterDays: 3,
  /** The CFA franc per euro, fixed. See above for where it comes from. */
  cfaFrancsPerEuro: 655.957,
  cfaSource: "BCEAO manual exchange rates, 16 Sep 2026, and Council Decision 98/683/EC",
} as const;
