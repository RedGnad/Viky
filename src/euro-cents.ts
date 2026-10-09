/**
 * An amount in euros brought up to the cent: 9.1151 is 9.12, and 5.04 stays 5.04 whatever a division left behind it.
 * Up and never down, because it is what a card is asked for: a cent short is a gift that cannot be made.
 */
export function upToTheCent(euros: number): number {
  return Math.ceil(Math.round(euros * 1_000_000) / 10_000) / 100;
}
