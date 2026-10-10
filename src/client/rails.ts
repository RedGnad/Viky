import type { RailReach } from "../rail-country";
import { getJson } from "./api";

/**
 * Where the rails serve, asked from the browser (R1). The server reads the country of the connection, which a page
 * cannot see; the page sends the device's own language, which the server cannot see. Neither is asked of the person,
 * and the answer only orders what is already on the screen.
 */

export type RailsWhere = Readonly<{
  country: string | null;
  ask: boolean;
  fromConnection: string | null;
  fromDevice: string | null;
  waysOut: Readonly<Record<string, RailReach>>;
  waysIn: Readonly<Record<string, RailReach>>;
  /** Whether adding money by card is offered to this payer, and the country that decided it (src/card-rail.ts). */
  card?: Readonly<{ offered: boolean; country: string | null }>;
  /**
   * What the two ways out publish for that country today: the method and the currency the bank service pays by, and
   * the card service's smallest sale. Each is absent when its service did not answer.
   */
  out?: Readonly<{ bank: Readonly<{ method: string; currency: string }> | null; cardSmallest: Readonly<{ amount: number; currency: string }> | null; bankSmallest?: Readonly<{ amount: number; currency: string }> | null }>;
}>;

export function whereTheRailsServe(answered?: string | null): Promise<RailsWhere> {
  const params = new URLSearchParams();
  const locale = typeof navigator === "undefined" ? "" : (navigator.language ?? "");
  if (locale) params.set("locale", locale);
  if (answered) params.set("answered", answered);
  const query = params.toString();
  return getJson(`/api/rails/where${query ? `?${query}` : ""}`);
}
