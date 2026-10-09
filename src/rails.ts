import { upToTheCent } from "./euro-cents";
import type { Hex } from "viem";
import { NATIVE_OUT } from "./exit-terms";
import { USDC_ADDRESS } from "./monad/chain";
import { moneyIn } from "./pay-sum";

/**
 * The rails that turn euros into what a gift holds, and back.
 *
 * Adding money never names a company: a person adds money, and Viky does the rest (D42). Taking it out does
 * name them, and that is the change D77 makes. No single payout service covers everybody: each pays in the
 * countries of its own list, and where one is shut another may serve. So the way out shows what exists, each
 * with where it pays, its source and the date that source was read, and the person chooses.
 *
 * **No country list is copied into this file, deliberately.** One of these lists changed on 15 Sep and the
 * other dates from June. A list frozen here would be wrong within weeks, and a false sentence about somebody's
 * money is the thing this project refuses above all (D39). What is written here is what was read, when, and
 * where to read it again; what is checked at the moment it matters is asked of the service itself
 * (src/ramp.ts).
 */

/**
 * Where Mercuryo serves nobody, by the names its own availability page gives them, read on 14 Sep 2026 and again on
 * 29 Sep 2026 (updated there 15 Sep). `MERCURYO_CLOSED_IN` below is the same list as codes, which is what decides; Ramp
 * has its own (`RAMP_CLOSED_IN`).
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

/**
 * Where Ramp serves nobody, as two-letter codes, from its own list: "Which countries and US states are unsupported for
 * buying and selling crypto?" (https://support.rampnetwork.com/en/articles/433-which-countries-and-us-states-are-unsupported-for-buying-and-selling-crypto,
 * read 29 Sep 2026, 132 countries and territories, "determined by your physical location"). Senegal and Ivory Coast
 * are on it. Its eight US states (Louisiana, Minnesota, Nevada, New Jersey, New York, Pennsylvania, Vermont,
 * Washington) cannot be told from a country, and are left to Ramp's own check.
 */
export const RAMP_CLOSED_IN: readonly string[] = [
  "af", "ag", "ai", "am", "ao", "aw", "az", "ba", "bb", "bd", "bf", "bh", "bi", "bj", "bo", "bs", "by", "bz", "cf", "cg",
  "ci", "cm", "cn", "cu", "cw", "dj", "dm", "dz", "ec", "eg", "er", "et", "fj", "fm", "ga", "gd", "gh", "gm", "gn", "gq",
  "gt", "gw", "gy", "ht", "id", "iq", "ir", "jm", "jo", "jp", "ke", "kg", "kh", "ki", "km", "kn", "kp", "kr", "la", "lb",
  "lc", "lk", "lr", "ls", "ly", "ma", "me", "mg", "ml", "mm", "mn", "mo", "mr", "ms", "mu", "mv", "mw", "mz", "na", "ne",
  "ng", "ni", "np", "nu", "om", "pa", "pg", "pk", "pn", "pr", "ps", "pw", "qa", "ru", "rw", "sa", "sb", "sc", "sd", "sl",
  "sn", "so", "sr", "ss", "sy", "sz", "tc", "td", "tg", "th", "tj", "tl", "tm", "tn", "to", "tt", "tv", "tw", "tz", "ua",
  "ug", "uz", "vc", "ve", "vg", "vi", "vn", "vu", "ws", "xk", "ye", "zw",
];

/**
 * Where Ramp serves people and does not sell them what a gift holds: twenty-six countries of the European Economic
 * Area. Its own article says so ("What cryptoassets does Ramp Network support?", article 432, modified 7 Jul 2026:
 * AUSD is "not available to buy or sell in the EU/EEA"), and its widget's own answer says it per country:
 * `GET https://api.rampnetwork.com/api/assets?mode=ONRAMP&tj=RAMP_IE&countryCode=<code>` gives AUSD on Monad
 * `enabled: false, hidden: true, reason: "DISABLED_IN_TJ"` for each of these, read one by one on 1 Oct 2026 at 11:07
 * UTC. The partner list the sheet reads live (`RAMP_ASSETS`) takes no country and says "enabled" for everybody, which
 * is why these are written down.
 *
 * France, Ireland, Italy and the Netherlands are deliberately absent: the same answer gives them `enabled: true,
 * hidden: true`, which contradicts the article, and no real purchase has settled it yet (the founder's own try is
 * awaited). Where an aggregator quotes Ramp for one of the twenty-six, Ramp's own answer is the one followed.
 */
export const RAMP_NO_GIFT_COIN_IN: readonly string[] = [
  "at", "be", "bg", "cy", "cz", "de", "dk", "ee", "es", "fi", "gr", "hr", "hu", "is", "li", "lt", "lu", "lv", "mt", "no",
  "pl", "pt", "ro", "se", "si", "sk",
];

/**
 * Where Mercuryo serves nobody, as two-letter codes: `RAIL_CLOSED_IN` above, which its help centre still lists as it is
 * ("Where Is Mercuryo Widget/Wallet Available?", updated 15 Sep 2026, read 29 Sep 2026; Senegal and Ivory Coast open).
 * Abkhazia, South Ossetia and the occupied territories of Ukraine have no code of their own and are left to its check.
 */
export const MERCURYO_CLOSED_IN: readonly string[] = [
  "af", "ao", "aq", "ax", "bb", "bd", "bi", "bo", "by", "cd", "cf", "cg", "cl", "cn", "co", "cr", "cu", "dz", "ec", "eh",
  "gf", "gt", "gu", "gw", "hn", "ht", "hu", "iq", "ir", "is", "kh", "kp", "lb", "lr", "ly", "ma", "ml", "mm", "ni", "np",
  "pa", "pf", "pg", "pk", "ps", "ru", "sd", "sl", "so", "ss", "sy", "tn", "ve", "xk", "ye", "zw",
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
  /**
   * What lands in the account: what a gift holds; the chain's own coin, which must then be swapped; or another dollar
   * coin, USDC, which the screen that waits changes into what a gift holds by itself (src/usdc-router.ts).
   */
  arrives: "gift" | "chain" | "usdc";
  /**
   * The two words that rail's own page asks the person to set. They are that service's names for a coin and a
   * network, not ours: a data contract with a page we do not control (D32), quoted and never explained away.
   */
  delivers: Readonly<{ coin: string; network: string }>;
  /** Their smallest purchase, in euros, as they publish it. */
  smallestEur: number;
  /**
   * Whether its page takes an amount with cents, as read on that page. A service that does not is asked for whole
   * euros, and what a whole euro brings beyond the gift and the fee stays in the account.
   */
  cents?: boolean;
  /**
   * The currency its page is opened in when nothing quotes it (src/card-ask.ts): the euro when absent. Dollars for a
   * page that takes a currency and whose fee and floor are then said in dollars at the day's rate.
   */
  paidIn?: "USD";
  /** How long they say a payment takes, in their own words, when they say it. Absent rather than guessed. */
  takes?: string;
  /** What they keep, as they publish it. */
  fee: PublishedFee;
  conditions: readonly string[];
  /**
   * What the service asks of a person before it takes their card, as the words that follow "asks for" on the pay
   * sheet (the founder, 5 Oct 2026): said before the person enters its page, and of the service they are offered,
   * never of another. Where each was read is beside its value.
   */
  asks: string;
  /** Where the sentences above were read, and when. Shown on screen, so nobody has to take our word for it. */
  source: string;
  read: string;
  /**
   * Where this rail serves nobody, whatever else is true, as the two-letter codes a country is kept in: its own
   * published list (the founder, 29 Sep 2026: each partner follows its own list, never the other's).
   */
  closedIn: readonly string[];
  /**
   * For a rail that publishes where it serves rather than where it does not: the only countries it is offered in.
   * Absent, the rail is offered wherever `closedIn` does not shut it.
   */
  openIn?: readonly string[];
  /** Their own terms for a person buying, on their official site: what the payer accepts by paying by card. */
  terms: string;
  /**
   * True for a way in that opens inside Viky, already told what to deliver and where (the founder, 1 Oct 2026): the
   * person chooses no coin and pastes no code, and types the amount there, since its page takes none from us.
   */
  embedded?: true;
}>;

/**
 * Adding money by buying what a gift already holds (D101). Their own asset list carries `MONAD_AUSD` at the address
 * this app pays gifts in, enabled, beside the chain's coin and the euro one, with fees of 0.99 % to 3.9 % and a 2.49
 * EUR minimum, read on 18 Sep 2026 at `https://api.ramp.network/api/host-api/assets`. Nothing is swapped after it:
 * what arrives is what a gift holds.
 *
 * Its floor is the asset's own, 6.25 EUR (`minPurchaseAmount` on the `MONAD_AUSD` row of
 * `https://api.ramp.network/api/host-api/v3/assets?currencyCode=EUR`, read 1 Oct 2026), not the 6 EUR its list gives
 * for every asset at once: a payment of 6 EUR is under what it sells this coin for (the audit of 1 Oct 2026).
 *
 * Where it sells is its own list of countries (`RAMP_CLOSED_IN`), and where it sells this coin is narrower
 * (`RAMP_NO_GIFT_COIN_IN`): both shut it for a payer there, and the sheet goes to the next way.
 */
export const WAY_IN_GIFT_COIN: WayIn = {
  name: "Ramp",
  page: "https://app.ramp.network/?swapAsset=MONAD_AUSD&flow=onramp",
  arrives: "gift",
  delivers: { coin: "AUSD", network: "Monad" },
  // `minFeePercent: 0.99`, `maxFeePercent: 3.9`, `minFeeAmount: 2.49`, the same figures on 18 Sep, 20 Sep and 1 Oct
  // 2026 at the endpoint above, with `MONAD_AUSD` enabled and not hidden, and its own `minPurchaseAmount: 6.25`.
  smallestEur: 6.25,
  fee: { percent: 3.9, upTo: true, minimum: 2.49, currency: "EUR" },
  conditions: ["Identity check the first time, once.", "A card or a bank account in your name."],
  // Its help, "What are the KYC limits and requirements?" (updated 23 Sep 2025, read 5 Oct 2026): an identification
  // document for all purchases, and a proof of address above 5,000 EUR.
  asks: "your ID the first time",
  source: "Ramp's own asset list",
  read: "1 Oct 2026",
  closedIn: [...RAMP_CLOSED_IN, ...RAMP_NO_GIFT_COIN_IN],
  // Their terms of service, where ramp.network now redirects; section 7 asks that a user be at least 18 (read 29 Sep 2026).
  terms: "https://rampnetwork.com/terms-of-service",
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
 *
 * Its page cannot be drawn in a frame of ours without a partner's key (measured 4 Oct 2026, nothing paid):
 *   - `https://exchange.mercuryo.io` is served with nothing that forbids a frame, but it draws its form in a frame of
 *     its own, `https://widget.mercuryo.io/?origin=https://exchange.mercuryo.io&widget_id=<Mercuryo's own>`, served
 *     with `frame-ancestors https://exchange.mercuryo.io`. That rule holds every page above it, so with Viky above
 *     the browser refuses it (`ERR_BLOCKED_BY_RESPONSE`) and the frame is empty;
 *   - `https://widget.mercuryo.io` with no `widget_id` is served with `frame-ancestors 'none'` and `X-Frame-Options:
 *     DENY`. Its own documentation (widget.docs.mercuryo.io, and "Widget API v1.6" on its GitHub): `widget_id` is
 *     required, the domain that embeds it is entered in its dashboard, and `address` needs a `signature` made with
 *     the partner's secret;
 *   - on its public page the address's `type`, `currency`, `network`, `fiat_currency` and `fiat_amount` change nothing:
 *     opened with MON on Monad and 30 EUR, it showed BTC for 300 USD.
 * So its page opens beside, and the person sets everything there (`wayInFillsIn`). Whether that page has to stay open
 * until the money arrives is not known: its documentation says nothing of it, and it was not tried.
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
  // As it stood, and not read again on 5 Oct 2026: its help pages refuse a reader that is no browser. A search
  // engine reports its partners' help as letting a first 700 EUR through without a document: a lead, not a reading.
  asks: "your ID the first time",
  source: "Mercuryo's own limits and currencies",
  read: "20 Sep 2026",
  // Buying the coin is shut in the United Kingdom as well as selling it: their own currencies endpoint lists `gb`
  // under both `restricted_countries_onramp` and `restricted_countries_offramp` for MON on MONAD, read on 15 Sep
  // 2026 at https://api.mercuryo.io/v1.6/lib/currencies (D72), and again on 16 Sep for D77.
  closedIn: [...MERCURYO_CLOSED_IN, "gb"],
  // Their terms for individuals, the page that leads to the EEA version and the one for everywhere else; the EEA one
  // asks, in 3.1, that a user be at least 18 (read 29 Sep 2026).
  terms: "https://mercuryo.io/legal/terms/",
};

/**
 * Where Swapper's card gives nothing (read 1 Oct 2026, with no key and no account). Two reads, one list:
 *
 * - `GET https://swapper.finance/api/onramp/countries?accountFilter=true` lists 244 countries; China, Cuba, Iran, North
 *   Korea, Syria and Zimbabwe are not among them.
 * - `POST https://swapper.finance/api/onramp/quote` for 20 EUR by card, asked once of each of the 244: 207 answered at
 *   least one quote, 37 none. Ivory Coast, Mali, Burkina Faso, Guinea, Nigeria and Tunisia are among the 37 (Ivory
 *   Coast is quoted from 25 EUR, by Mercuryo alone, which Viky's own way in already offers from 25).
 *
 * The same route is asked again, live, for the payer's own country (`src/rail-availability.ts`): this list is what stands
 * when that read fails.
 */
export const SWAPPER_CLOSED_IN: readonly string[] = [
  "af", "am", "bf", "bi", "by", "cd", "cf", "ci", "cn", "cu", "er", "et", "ge", "gn", "gw", "ht", "iq", "ir", "kp", "kz",
  "la", "lb", "lk", "lr", "ly", "md", "mk", "ml", "mm", "mn", "ng", "ni", "ru", "sd", "so", "ss", "sy", "tn", "ua", "uz",
  "xk", "ye", "zw",
];

/**
 * Adding money by card inside Viky (the founder, 1 Oct 2026): Swapper's widget, told to deliver what a gift holds to
 * the payer's own account, so nothing is chosen and nothing is pasted. Its documentation is
 * `https://docs.swapper.finance`, its widget `https://deposit.swapper.finance/`.
 *
 * What was read on 1 Oct 2026, on its demo (`https://demo.swapper.finance`) and its own routes, without paying:
 *
 * - It takes AUSD on Monad as a destination. The card itself is taken by one of the card services it offers (Revolut,
 *   Banxa, Topper, Mercuryo, Stripe, by country), on that service's own page, in a window the widget opens. That
 *   service sells USDC on Polygon to a wallet Swapper makes for the payment, and Swapper then changes it into AUSD on
 *   Monad and sends it to the account (`POST /api/deposits/route`, Polygon to Monad, 0.02 USDC of fee on 22).
 * - What 20 EUR bought, against the European Central Bank's 1.1355 of 30 Sep: 22.14 AUSD through Revolut in France
 *   (2.5 % under), 21.9 through Topper in Senegal (3.6 % under), 20.8 through Banxa in both (8.5 % under); in the
 *   United States 20 USD bought 19.36 (Topper), 18.76 (Stripe) and 18.35 (Banxa). Hence "up to 9 %", a measured
 *   ceiling and not a figure it publishes: it publishes none.
 * - The smallest payment: quotes at 10 EUR in France, Senegal and the United States; none at 7 and 8 EUR in Senegal.
 * - Every quote carried `lowKyc: false`, and each service's page starts by signing in to an account with it (Banxa by
 *   e-mail, Revolut with a Revolut account, Topper by signing in).
 * - Its page takes no amount from us (its address reads no such word): the person types it there. Its
 *   `minDepositUsd` did not stop a card payment under it (20 EUR against 30 USD went on to the card service), so it
 *   is not relied on: a payment that falls short is met on the screen that waits, as on every way in.
 *
 * None of it has run end to end with real money: that waits for the integrator id (`swapperIntegratorId`).
 */
export const WAY_IN_EMBEDDED: WayIn = {
  name: "Swapper",
  page: "https://deposit.swapper.finance/",
  arrives: "gift",
  delivers: { coin: "AUSD", network: "Monad" },
  smallestEur: 10,
  fee: { percent: 9, upTo: true, minimum: 0, currency: "EUR" },
  conditions: ["An account with the card service it sends you to, and its identity check the first time."],
  // Each quote of 1 Oct 2026 began by signing in to an account with the card service it led to (the note above).
  asks: "an account with the card service it sends you to, and your ID the first time",
  source: "Swapper's own quotes",
  read: "1 Oct 2026",
  closedIn: SWAPPER_CLOSED_IN,
  // The Terms of Use its own site links in its footer (read in the site's script, 1 Oct 2026). That day the address
  // answered the site's home page and no document: the working address is to be asked of Swapper with the id.
  terms: "https://swapper.finance/pdfs/SWAPPER_TERMS_OF_USE.pdf",
  embedded: true,
};

/**
 * The countries Rampnow lists as fully supported (`https://docs.rampnow.io/quickstart/resources/supported-countries`,
 * read 1 Oct 2026): 103 of them. France, the United Kingdom and the United States are among them. Senegal and Ivory
 * Coast are not: with Canada, Morocco, Nigeria and some forty others they stand under "Restricted", "limited
 * availability" that "may require additional review and approval", and Rampnow is not offered there.
 */
export const RAMPNOW_OPEN_IN: readonly string[] = [
  "ad", "ae", "am", "ar", "at", "au", "aw", "az", "ba", "bb", "be", "bh", "bm", "bn", "br", "bs", "bt", "bz", "ch", "cl",
  "co", "cr", "cw", "cy", "cz", "de", "dk", "do", "ec", "ee", "es", "fi", "fj", "fm", "fo", "fr", "gb", "ge", "gg", "gi",
  "gl", "gr", "gy", "hk", "hr", "hu", "id", "ie", "il", "im", "in", "is", "it", "je", "jo", "jp", "ke", "kg", "kr", "kw",
  "kz", "li", "lk", "lt", "lu", "lv", "me", "mn", "mo", "mt", "mu", "mx", "my", "nl", "no", "nz", "om", "pa", "pe", "pg",
  "ph", "pl", "pt", "py", "qa", "ro", "rw", "sa", "se", "sg", "si", "sk", "sm", "sv", "th", "tr", "tw", "us", "uy", "uz",
  "vn", "za", "zm",
];

/**
 * Adding money by card through Rampnow's own public page (the founder, 1 Oct 2026), which arrives filled in and locked:
 * the amount, the euro, the card, USDC on Monad and the payer's own account (`wayInPage`). The person chooses nothing
 * and pastes nothing. What arrives is USDC, another dollar coin, which the screen that waits changes into what a gift
 * holds, with nothing to confirm.
 *
 * What was read on 1 Oct 2026, without paying, on `https://app.rampnow.io/order/quote` and the configuration its page
 * reads (`/api/ramp/v1/public/ramp_order/config`):
 *
 * - A card payment in euros keeps 7 % plus 0.40 EUR, and never less than 1.00 EUR: fourteen amounts from 5 to 500 EUR
 *   answered exactly that (20 EUR: 1.80; 30 EUR: 2.50; 100 EUR: 7.40), with 0.004 EUR for the network. 30 EUR bought
 *   31.13 USDC. Its rate was 1.1323 dollars a euro when the European Central Bank's was 1.1355, 0.3 % under.
 * - The smallest card payment is 5 EUR (`paymentModeConfigs.card.minAmount`).
 * - Its page takes an amount with cents (read 9 Oct 2026, without paying): the address this page is opened by, with
 *   `srcAmount=9.12` locked, shows "€9.12" and "9.06 USDC", and 9 EUR shows 8.93 USDC. Whether its payment step keeps
 *   the cents is known only once a real payment of such an amount has run.
 * - Its page locks five fields by its address (`lockFields`, read in its script): what is paid, how much, what is
 *   bought, how, and to whom. Its documentation names the others (`https://docs.rampnow.io/api-reference/widget-mode`).
 * - It has no AUSD on Monad, and no franc CFA.
 * - The founder's own try, to the last step before paying: signing in by e-mail and a code, then the recipient shown as
 *   his account, greyed like the amount and the coin; then a form of identity, a code by text, and an identity check.
 *
 * The step that changes USDC into what a gift holds is deployed since 3 Oct 2026 (the converter of docs/CONTRACTS.md),
 * and ran with real amounts that day: the USDC a card payment delivered became 7.914524 AUSD on one signature. The way
 * is offered where its two settings are set (`rampnowWayIn`), and nowhere else.
 */
export const WAY_IN_USDC: WayIn = {
  name: "Rampnow",
  page: "https://app.rampnow.io/order/quote",
  arrives: "usdc",
  delivers: { coin: "USDC", network: "Monad" },
  smallestEur: 5,
  cents: true,
  fee: { percent: 7, upTo: false, plus: 0.4, minimum: 1, currency: "EUR" },
  conditions: ["The first time: your details, a code by text, and your ID.", "A card in your name."],
  // Two readings. Its documentation, "Onramp Flow" (docs.rampnow.io, read 5 Oct 2026): the person enters an e-mail and
  // the code sent to it. The founder's own try of 1 Oct 2026, above: then a form of identity, a code by text and an
  // identity check, before a first payment of 5 EUR. Its documentation also publishes a level it calls unverified,
  // with orders up to 800 EUR (the table of "Payment Methods & Limits", read 5 Oct 2026): what was met is what is said.
  asks: "your e-mail, then the first time your details, a code by text and your ID",
  source: "Rampnow's own quotes",
  read: "1 Oct 2026",
  closedIn: [],
  openIn: RAMPNOW_OPEN_IN,
  // Its Terms and Conditions of Service, last updated 1 July 2026 (opened 1 Oct 2026).
  terms: "https://rampnow.io/terms-and-conditions",
};

/**
 * Both ways in, in the order the sheet tries them (D239): the one with nothing to swap first, the other only when the
 * first refuses. Typed as never empty, so the sheet always has a way to stand in front of its action.
 */
export const WAYS_IN: readonly [WayIn, ...WayIn[]] = [WAY_IN_GIFT_COIN, WAY_IN_CHAIN_COIN];

/**
 * Whether Rampnow is offered. It was written off (the founder, 1 Oct 2026: nothing is turned on before a real
 * payment has run), a rule he replaced on 3 Oct 2026: a way whose code is complete is open at its deployment. Two
 * settings, and both are needed: `NEXT_PUBLIC_RAMPNOW_WAY_IN` set to "on", and the address of the contract that changes
 * the USDC that arrives into what a gift holds (`NEXT_PUBLIC_USDC_ROUTER_ADDRESS`). Without that contract a new
 * account could do nothing with its USDC: it holds none of the chain's coin, and under ten of it an account can call no
 * contract at all (D53). So the way in cannot be offered before the step that finishes it exists.
 */
export function rampnowWayIn(): boolean {
  return process.env.NEXT_PUBLIC_RAMPNOW_WAY_IN?.trim() === "on" && /^0x[0-9a-fA-F]{40}$/.test(process.env.NEXT_PUBLIC_USDC_ROUTER_ADDRESS?.trim() ?? "");
}

/**
 * Swapper's integrator id: public by design, it goes in its widget's address. Asked of Swapper by a ticket; set on
 * Vercel as `NEXT_PUBLIC_SWAPPER_INTEGRATOR_ID` once given. Until then it is absent, and nothing of Swapper is offered.
 */
export const swapperIntegratorId = (): string | undefined => process.env.NEXT_PUBLIC_SWAPPER_INTEGRATOR_ID?.trim() || undefined;

/**
 * The ways in the sheet tries, in order (the founder, 1 Oct 2026): Rampnow first where it is turned on and serves the
 * payer, then Swapper with its id, then the two there were; with neither, those two alone, exactly as before.
 */
export function waysIn(on: Readonly<{ rampnow?: boolean; swapper?: string }> = { rampnow: rampnowWayIn(), swapper: swapperIntegratorId() }): readonly [WayIn, ...WayIn[]] {
  if (!on.rampnow && !on.swapper) return WAYS_IN;
  return [...(on.rampnow ? [WAY_IN_USDC] : []), ...(on.swapper ? [WAY_IN_EMBEDDED] : []), ...WAYS_IN] as unknown as readonly [WayIn, ...WayIn[]];
}

/**
 * "Ramp or Mercuryo", "Swapper, Ramp or Mercuryo": the card services of this deployment, by their own names, for the
 * legal notice and the privacy page (the audit of 1 Oct 2026, V-01: both named one service by hand, whichever services
 * were on).
 */
export function cardServices(names: readonly string[] = waysIn().map((way) => way.name)): string {
  const each = [...new Set(names)];
  return each.length <= 1 ? (each[0] ?? "") : `${each.slice(0, -1).join(", ")} or ${each[each.length - 1]}`;
}

/**
 * Ramp's partner key (D289): public by design, it goes in the page's own address, and Ramp names the partner with it.
 * Set on Vercel as `NEXT_PUBLIC_RAMP_HOST_API_KEY` once Ramp gives one; until then it is absent.
 */
export const rampHostApiKey = (): string | undefined => process.env.NEXT_PUBLIC_RAMP_HOST_API_KEY?.trim() || undefined;

/**
 * Ramp's page with nothing in its address: the one it opens without a partner key (read on 27 Sep 2026, D289).
 *
 * Ramp has no window inside Viky without that key (measured 3 Oct 2026, nothing paid): its own SDK
 * (`@ramp-network/ramp-instant-sdk` 6.2.0) opens `https://app.rampnetwork.com/`, which answers "Integration issue
 * detected" without `hostApiKey`, and its public site (`rampnetwork.com/buy-crypto`, `/sell-crypto`) is served with
 * `X-Frame-Options: SAMEORIGIN` and `frame-ancestors 'self'`. Its page beside is its way, in and out.
 */
export const RAMP_BARE_PAGE = "https://app.ramp.network/";

/**
 * The page a way in opens, filled in when it can be (D289, the founder's decision of 27 Sep 2026: the person types and
 * pastes nothing). Ramp with its partner key: the account the money lands in (`userAddress`), the sheet's amount in
 * euros (`fiatCurrency`, `fiatValue`) and what a gift holds (`swapAsset=MONAD_AUSD`), the names Ramp's configuration
 * page still describes (`https://docs.rampnetwork.com/configuration`, read 27 Sep 2026; its newer names are `inAsset`,
 * `outAsset` and `inAssetValue`). Without the key, Ramp answers any parameter with "Integration issue detected" (its
 * own widget reads the key from the address and fails without it, read in its script on 27 Sep 2026), so the page
 * opens bare, where it works. Mercuryo keeps its page: filling it in needs a partner `widget_id`.
 */
export function wayInPage(way: WayIn, fill: Readonly<{ account?: string; euros?: number; ask?: CardAsked }> = {}, key: string | undefined = rampHostApiKey()): string {
  if (way === WAY_IN_USDC) return rampnowPage(fill);
  if (way !== WAY_IN_GIFT_COIN) return way.page;
  if (!key) return RAMP_BARE_PAGE;
  const address = new URL(way.page);
  address.searchParams.set("hostApiKey", key);
  if (fill.account) address.searchParams.set("userAddress", fill.account);
  if (fill.euros && fill.euros > 0) {
    address.searchParams.set("fiatCurrency", "EUR");
    address.searchParams.set("fiatValue", String(Math.ceil(fill.euros)));
  }
  return address.toString();
}

/** What a card is asked for on a page that takes a currency: how much, and of what. */
export type CardAsked = Readonly<{ currency: string; amount: number }>;

/**
 * Rampnow's public page, filled in and locked (the founder, 1 Oct 2026): a card payment of this amount, for USDC on
 * Monad, to this account. `lockFields` names the five fields its page can lock, and `prefill` is the word its page
 * reads to take them from the address (both read in its script, 1 Oct 2026). No key of ours: its page adds its own.
 *
 * In euros unless a currency is asked (`ask`, 9 Oct 2026): the one its own quote was given in, or dollars. Its page
 * takes the currency from the address as it takes the euro: opened with `srcCurrency=USD&srcAmount=20` locked, it
 * showed "20 USD" and 18.15 USDC that day, and "20 GBP" for the pound, nothing paid.
 */
export function rampnowPage(fill: Readonly<{ account?: string; euros?: number; ask?: CardAsked }>): string {
  const address = new URL(WAY_IN_USDC.page);
  const set = (name: string, value: string) => address.searchParams.set(name, value);
  // To the cent, and never under what was worked out: its page takes cents (`WAY_IN_USDC.cents`). An amount asked in
  // another currency comes already written to that currency's own decimals.
  const paid: CardAsked | undefined = fill.ask && fill.ask.amount > 0 ? fill.ask : fill.euros && fill.euros > 0 ? { currency: "EUR", amount: upToTheCent(fill.euros) } : undefined;
  set("orderType", "buy");
  set("srcChain", "fiat");
  set("srcCurrency", paid?.currency ?? "EUR");
  if (paid) set("srcAmount", String(paid.amount));
  set("paymentMode", "card");
  set("dstCurrency", "USDC");
  set("dstChain", "monad");
  if (fill.account) set("walletAddress", fill.account);
  // Only what is filled in is locked: a field locked empty could not be filled by the person either.
  const locked = ["srcAsset", ...(paid ? ["srcAmount"] : []), "dstAsset", "paymentMode", ...(fill.account ? ["walletAddress"] : [])];
  // Written as its own page writes it, with bare commas: the form opened and read on 1 Oct 2026.
  return `${address.toString()}&lockFields=${locked.join(",")}&prefill=true`;
}

/**
 * Ramp's own page for selling, which opens with nothing in its address (`https://rampnetwork.com/sell`, opened 1 Oct
 * 2026: it lands on its "Sell crypto instantly" page, where searching "USDC monad" lists USDC marked Monad under
 * "Available in your location"). Not `RAMP_BARE_PAGE`: that one now lands on its home page, open on buying.
 */
export const RAMP_SELL_PAGE = "https://rampnetwork.com/sell";

/**
 * The page a way out opens (the audit of 1 Oct 2026), the mirror of `wayInPage`. The address the way out used to open,
 * Ramp's widget with `swapAsset` and `flow` and no partner key, answered "Integration issue detected" to somebody whose
 * money had just been changed for it. So without the key Ramp's own selling page opens, where the person chooses what
 * they sell; with it, the widget opens on selling, told which coin, how much of it and from which account, by the names
 * its configuration page documents (`hostApiKey`, `enabledFlows`, `defaultFlow`, `swapAsset`, `swapAmount` in the coin's
 * own units, `userAddress`, "for off-ramp ... a source address", read 1 Oct 2026). Mercuryo keeps its page: its address
 * takes no filling in without a partner `widget_id`, and it opens on buying, so the step says to press Sell there.
 */
export function wayOutPage(way: WayOut, fill: Readonly<{ account?: string; units?: bigint }> = {}, key: string | undefined = rampHostApiKey()): string {
  if (way !== WAY_OUT_EURO) return way.page;
  if (!key) return RAMP_SELL_PAGE;
  const address = new URL(way.page);
  address.search = "";
  address.searchParams.set("hostApiKey", key);
  address.searchParams.set("enabledFlows", "OFFRAMP");
  address.searchParams.set("defaultFlow", "OFFRAMP");
  address.searchParams.set("swapAsset", "MONAD_USDC");
  if (fill.units !== undefined && fill.units > 0n) address.searchParams.set("swapAmount", fill.units.toString());
  if (fill.account) address.searchParams.set("userAddress", fill.account);
  return address.toString();
}

/** Whether the page a way out opens is told what is sold and how much, so the person chooses nothing there. */
export const wayOutFillsIn = (way: WayOut, key: string | undefined = rampHostApiKey()): boolean => way === WAY_OUT_EURO && key !== undefined;

/** Whether the page a way in opens arrives filled in with the account and the amount. */
export const wayInFillsIn = (way: WayIn, key: string | undefined = rampHostApiKey()): boolean => way === WAY_IN_USDC || (way === WAY_IN_GIFT_COIN && key !== undefined);

/** Whether the person has nothing to set and no code to give on the page a way in opens: it is told all of it already. */
export const wayInAsksNothing = (way: WayIn): boolean => way.embedded === true || way === WAY_IN_USDC;

/** The rail money was added through before there were two, kept for what still reads a single one. */
export const WAY_IN: RailHandoff = {
  name: WAY_IN_CHAIN_COIN.name,
  page: WAY_IN_CHAIN_COIN.page,
  smallest: `${WAY_IN_CHAIN_COIN.smallestEur} EUR`,
  fee: "about 3.8%",
  conditions: WAY_IN_CHAIN_COIN.conditions,
  closedIn: [...RAIL_CLOSED_IN, "United Kingdom"],
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
  /** A fixed part taken on every payment beside the share, in `currency`, when they take one. */
  plus?: number;
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
  /**
   * What this service buys, and therefore the coin the router must hand back (D77), in the service's own two words.
   * Printed in one place only, the step that says what to pick on its page (`CASH_OUT.onTheirPage`, 1 Oct 2026).
   */
  sells: string;
  /** That coin on chain. Zero is the chain's own coin, which is how `ExitTerms.tokenOut` names it. */
  coin: Hex;
  /** Where it pays, in one sentence, in the words a person would use. */
  where: string;
  /**
   * How it arrives and how soon, in one line (out.html, 19 Sep 2026). No screen prints it today: the card of the way
   * out says the method and the money its service pays in the person's country. It names no country and no currency
   * since 9 Oct 2026: where a way does not pay, it is not shown.
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
/**
 * What a service keeps, in a few words, for a line of a fold whose label is the service's name (the founder, 4 Oct
 * 2026): "0.99 %, at least €1.99". The same published figures as the sentence below.
 */
export function feeUnderItsName(way: { fee: PublishedFee }): string {
  const euro = (amount: number) => moneyIn(amount, way.fee.currency);
  const share = `${way.fee.upTo ? "up to " : ""}${way.fee.percent} %${way.fee.plus ? ` + ${euro(way.fee.plus)}` : ""}`;
  return way.fee.minimum > 0 ? `${share}, at least ${euro(way.fee.minimum)}` : share;
}

export function feeSentence(way: { name: string; fee: PublishedFee; embedded?: true }): string {
  // A way in that publishes no fee of its own: what was measured through it, said as measured.
  if (way.embedded) return `Through ${way.name}, a card payment bought up to ${way.fee.percent} % less than the day's rate when it was read`;
  const share = `${way.fee.upTo ? "up to " : ""}${way.fee.percent} %${way.fee.plus ? ` plus ${way.fee.plus.toFixed(2)} ${way.fee.currency}` : ""}`;
  // A service that publishes no floor for its fee gets no sentence about one: "a minimum of 0.00" would be a figure
  // nobody read (the card rail in, whose published figure is a share alone).
  if (way.fee.minimum <= 0) return `${way.name} keeps ${share}`;
  return `${way.name} keeps ${share} with a minimum of ${way.fee.minimum.toFixed(2)} ${way.fee.currency}`;
}

/**
 * What a service keeps, in the sheet's one money format (the mockup of 3 Oct 2026): "Rampnow keeps 7 % plus €0.40, at
 * least €1.00". `feeSentence` keeps its own form for the screens that name the currency's code.
 */
export function feeInWords(way: { name: string; fee: PublishedFee }): string {
  const euro = (amount: number) => moneyIn(amount, way.fee.currency);
  const share = `${way.fee.upTo ? "up to " : ""}${way.fee.percent} %${way.fee.plus ? ` plus ${euro(way.fee.plus)}` : ""}`;
  return way.fee.minimum > 0 ? `${way.name} keeps ${share}, at least ${euro(way.fee.minimum)}` : `${way.name} keeps ${share}`;
}

/**
 * A service's fee in a few characters, for a line of a fold (the founder, 4 Oct 2026): "Rampnow, 7 % + €0.40". Where
 * the service's floor is what a payment of `euros` pays, the line says the floor, so it is true of that payment.
 */
export function feeInALine(way: { name: string; fee: PublishedFee }, euros?: number): string {
  const euro = (amount: number) => moneyIn(amount, way.fee.currency);
  const share = `${way.fee.upTo ? "up to " : ""}${way.fee.percent} %${way.fee.plus ? ` + ${euro(way.fee.plus)}` : ""}`;
  const atThisAmount = euros === undefined ? undefined : (euros * way.fee.percent) / 100 + (way.fee.plus ?? 0);
  return way.fee.minimum > 0 && atThisAmount !== undefined && atThisAmount < way.fee.minimum ? `${way.name}, ${euro(way.fee.minimum)}` : `${way.name}, ${share}`;
}

/** Where a service's figures were read, said of it: "Rampnow's own quotes" is "its own quotes" after its name. */
export function sourceOfIts(way: { name: string; source: string }): string {
  return way.source.startsWith(`${way.name}'s `) ? `its ${way.source.slice(way.name.length + 3)}` : way.source;
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
  // No currency here (the founder, 9 Oct 2026): the service pays in the money of the person's country, which the
  // card of the way out says from the service's own answer (`bankBy`, src/sentences.ts). The legal notice prints
  // this field, and "in euros" was false outside the euro area.
  where: "To your bank account.",
  // No country and no currency here either: a way that does not pay in the person's country is not shown
  // (`usesFor`, src/use-money.ts), and the screen names that country when nothing reaches it (`noWayOutThere`).
  line: "A transfer through Ramp, within 2 business days.",
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
  line: "Onto a Visa or Mastercard through Mercuryo.",
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
  /** The same source in the few words a line has room for. */
  short: "European Central Bank",
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
