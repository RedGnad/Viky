import { typedFromUnits, unitsFromTyped } from "./amount-in-currency";
import { currencyOf, perDollar } from "./currencies";
import { formatAusd } from "./gift-reader";
import { MAX_GIFT_UNITS, MIN_GIFT_UNITS } from "./money";
import type { Rates } from "./rates";

/**
 * What the card starts on (D157). Thirty dollars was written on it for everybody, and a phone in Dakar read it as
 * 17,172 francs, a phone in Paris as 26.18 euros: a figure nobody would type. The founder's rule, which is only
 * comfort and is all the more binding for it: thirty dollars, thirty euros, fifteen thousand francs, a round figure
 * in whatever the reader reads in; and for somebody signed in with money in the account, the money in the account.
 *
 * "Round" is not a table of thirty-one figures. It is the ladder every price list climbs, 1, 1.5, 2, 3, 5 and the
 * next 1, in every decade, and the rung nearest to what thirty dollars is worth: 26.18 euros lands on 30, 17,172
 * francs on 15,000, 2,876 rupees on 3,000. A currency nobody had thought of gets a round figure too.
 */
const LADDER = [1, 1.5, 2, 3, 5, 10];

export const STARTING_DOLLARS = 30;

/** The rung of the ladder nearest to a value, in the value's own decade. */
export function roundFigure(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const decade = 10 ** Math.floor(Math.log10(value));
  let nearest = decade;
  for (const rung of LADDER) {
    const candidate = rung * decade;
    if (Math.abs(candidate - value) < Math.abs(nearest - value)) nearest = candidate;
  }
  return nearest;
}

export type StartingFigure = Readonly<{
  /** What the field shows, in the reader's currency, exactly as they would have typed it. */
  typed: string;
  /** What the draft carries: the dollars the chain will hold, as the card writes them. */
  dollars: string;
  /** Whether the figure is the account's own money rather than the round default. */
  fromTheAccount: boolean;
}>;

/**
 * The card's starting figure: the money in the account when there is any within the gift's bounds, else thirty
 * dollars said round in the reader's currency. Without a rate the reader's currency is the dollar, and thirty it is.
 */
export function startingFigure(currency: string, rates: Rates | undefined, held?: bigint): StartingFigure {
  if (held !== undefined && held >= MIN_GIFT_UNITS && held <= MAX_GIFT_UNITS) {
    return { typed: typedFromUnits(held, currency, rates), dollars: formatAusd(held).slice(1), fromTheAccount: true };
  }
  const rate = perDollar(currency, rates);
  if (currency === "USD" || !rates || rate === undefined) {
    return { typed: `${STARTING_DOLLARS}.00`, dollars: String(STARTING_DOLLARS), fromTheAccount: false };
  }
  const { decimals } = currencyOf(currency);
  const round = roundFigure(STARTING_DOLLARS * rate);
  const typed = decimals === 0 ? String(round) : round.toFixed(decimals);
  return { typed, dollars: formatAusd(unitsFromTyped(typed, currency, rates)).slice(1), fromTheAccount: false };
}
