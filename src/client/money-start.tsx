"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { GiftDraft } from "../gift-draft";
import type { DisplayCurrency } from "../display-currency";
import type { Rates } from "../rates";

/**
 * What the server already knew about this reader's money when it drew the page (D160).
 *
 * Every money screen used to start from nothing: the dollar, no rate, the starting card, and then the browser
 * corrected all three a few hundred milliseconds later. That correction is what the founder was seeing as the page
 * loading twice, and hiding the figures while it happened only turned it into a card with a hole in it.
 *
 * The server reads the same three things from the request (the account's choice or the cookie this device wrote, the
 * rate it keeps for an hour, and the card's figures), and hands them down here. A screen renders them at once, and
 * the browser confirms rather than corrects.
 */

export type MoneyStart = Readonly<{
  currency: DisplayCurrency;
  /** Whether the server knew the currency or assumed the dollar. Assumed, the device's own language may know better. */
  decided: boolean;
  /** The rate the server had. `null` says the source has not answered, which is not the same as not asked yet. */
  rates: Rates | null;
  /** The card this device kept, as the cookie describes it: the figures, with the names left to the device. */
  card: GiftDraft | null;
}>;

const NOTHING: MoneyStart = { currency: "USD", decided: false, rates: null, card: null };

const StartContext = createContext<MoneyStart>(NOTHING);

export function MoneyStartProvider({ start, children }: Readonly<{ start: MoneyStart; children: ReactNode }>) {
  return <StartContext.Provider value={start}>{children}</StartContext.Provider>;
}

/** What the server knew. Outside a provider it is the dollar and nothing kept, which is what a page for nobody is. */
export function useMoneyStart(): MoneyStart {
  return useContext(StartContext);
}
