/**
 * The rails that turn euros into what a gift holds, and back. The journey never mentions one: a person
 * adds money, and later takes it out. Which company stands behind that is one object, so replacing it is
 * replacing this object and nothing else, with no change to any step the person takes (D42).
 *
 * Today both ways run on Mercuryo's consumer page, which takes no parameters from us, so the person does
 * the last stretch with their own hands. A partner rail would keep the same shape and only drop the
 * handing over: the amount and the destination would already be filled in.
 */

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
  /** True while the person has to carry something across by hand. A partner rail sets this to false. */
  byHand: true;
}>;

/** Adding money (D20, D32). */
export const WAY_IN: RailHandoff = {
  name: "Mercuryo",
  page: "https://exchange.mercuryo.io",
  smallest: "25 EUR",
  fee: "about 3.8%",
  byHand: true,
};

/** Taking it out (D20, D41). */
export const WAY_OUT: RailHandoff = {
  name: "Mercuryo",
  page: "https://exchange.mercuryo.io/?type=sell&currency=MON&network=MONAD",
  smallest: "about $5.00",
  fee: "a flat 3 EUR whatever the amount",
  byHand: true,
};
