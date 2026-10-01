import { countryCode, type RailReach } from "./rail-country";
import { waysIn, type WayIn } from "./rails";

/**
 * Who paying by card is offered to (the founder, 29 Sep 2026). Each card partner follows its own published list of the
 * countries it serves nobody in (`WayIn.closedIn`), for the payer's country: the account's when it has one, otherwise
 * the connection's. The sheet offers the first partner that serves it; when none does, the card is not offered, one
 * sentence says so, and every other way to pay stays. Nobody is kept out of Viky: only the card follows its partners.
 * Browser safe.
 */

/**
 * The country the payer is taken to be in: the one the account keeps (D274) when it has one, otherwise the one the
 * platform reads from the connection (`x-vercel-ip-country`), otherwise nothing.
 */
export function payerCountry(input: Readonly<{ account: string | null | undefined; connection: string | null | undefined }>): string | null {
  return countryCode(input.account) ?? countryCode(input.connection);
}

/**
 * What each card partner says of the payer's country: its own list first, so a partner that names the country serves
 * nobody there whatever else is read; otherwise what was read of it live (a pause, its own country answer), or nothing.
 */
export function cardReach(country: string | null, live: Readonly<Record<string, RailReach>> = {}, ways: readonly WayIn[] = waysIn()): Record<string, RailReach> {
  return Object.fromEntries(ways.map((way) => [way.name, country && way.closedIn.includes(country) ? "does-not" : (live[way.name] ?? "unknown")]));
}

/** Whether any card partner serves this country; with no country known, the card is offered and the partner checks. */
export function cardOffered(reach: Readonly<Record<string, RailReach>>, ways: readonly WayIn[] = waysIn()): boolean {
  return ways.some((way) => reach[way.name] !== "does-not");
}
