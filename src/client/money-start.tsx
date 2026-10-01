"use client";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import type { GiftDraft } from "../gift-draft";
import { CURRENCY_COOKIE, type DisplayCurrency } from "../display-currency";
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
  /** Whether the currency is a proposal the server made now, from the connection or the language: kept below. */
  proposed?: boolean;
  /** The rate the server had. `null` says the source has not answered, which is not the same as not asked yet. */
  rates: Rates | null;
  /** The card this device kept, as the cookie describes it: the figures, with the names left to the device. */
  card: GiftDraft | null;
}>;

const NOTHING: MoneyStart = { currency: "USD", decided: false, rates: null, card: null };

const StartContext = createContext<MoneyStart>(NOTHING);

/**
 * The first proposal, kept on this device (the founder, 1 Oct 2026): the currency proposed from where the connection
 * comes from is written down the first time, so the same person reads the same currency tomorrow from another
 * network, and the account they make here takes it (src/client/display-currency.ts). Never over what is already kept.
 */
function keepTheProposal(currency: DisplayCurrency): void {
  try {
    if (document.cookie.split("; ").some((one) => one.startsWith(`${CURRENCY_COOKIE}=`))) return;
    const secure = window.location.protocol === "https:" ? "; secure" : "";
    document.cookie = `${CURRENCY_COOKIE}=${currency}; path=/; max-age=${365 * 24 * 60 * 60}; samesite=lax${secure}`;
  } catch {
    // A browser that keeps nothing is proposed to again at its next visit, which is what it had.
  }
}

export function MoneyStartProvider({ start, children }: Readonly<{ start: MoneyStart; children: ReactNode }>) {
  const { proposed, currency } = start;
  useEffect(() => {
    if (proposed) keepTheProposal(currency);
  }, [proposed, currency]);
  return <StartContext.Provider value={start}>{children}</StartContext.Provider>;
}

/** What the server knew. Outside a provider it is the dollar and nothing kept, which is what a page for nobody is. */
export function useMoneyStart(): MoneyStart {
  return useContext(StartContext);
}
