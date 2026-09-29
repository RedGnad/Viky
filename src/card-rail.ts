import { countryCode } from "./rail-country";

/**
 * Who the card rail is offered to (the founder, 29 Sep 2026). Nobody is kept out of Viky: only paying by card follows
 * its providers' terms, and those serve nobody in a country under a comprehensive United States embargo. Such a payer
 * reads, in the card's place, that the card is not offered there, and every other way to pay stays. Browser safe.
 */

/** Cuba, Iran, North Korea and Syria, as the account and the platform write a country: two letters, lower case. */
export const CARD_CLOSED_BY_EMBARGO: readonly string[] = ["cu", "ir", "kp", "sy"];

/**
 * The country the payer is taken to be in: the one the account keeps (D274) when it has one, otherwise the one the
 * platform reads from the connection (`x-vercel-ip-country`), otherwise nothing.
 */
export function payerCountry(input: Readonly<{ account: string | null | undefined; connection: string | null | undefined }>): string | null {
  return countryCode(input.account) ?? countryCode(input.connection);
}

/** Whether paying by card is offered to a payer in this country; with no country known, it is. */
export function cardOffered(country: string | null): boolean {
  return country === null || !CARD_CLOSED_BY_EMBARGO.includes(country);
}
