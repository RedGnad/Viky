"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { aboutInDisplayCurrency, figureInDisplayCurrency, isDisplayCurrency, proposedDisplayCurrency, SHOWN_IN_DOLLARS, type DisplayCurrency, type DisplayFigure } from "../display-currency";
import { CURRENCIES_WHEN_SILENT } from "../currencies";
import { ratesUsable, type Rates } from "../rates";
import { getJson, putJson } from "./api";

/**
 * The display currency of the account on this device, and the one line every money screen needs from it.
 *
 * The device proposes from its language tag, never by a question. A choice the account made on the account
 * page wins over the proposal and is read from the server, so it follows the account across devices. The rate
 * comes from Viky's own route, which answers nothing when the source has not for three days: then `about`
 * returns nothing and `unavailable` carries the one line to print instead (decision 1, 17 Sep 2026).
 */

/** What a screen may do with the currency, and where the choice is kept (D144). */
const KEPT = "viky.displayCurrency";

/**
 * What this tab was last asked to read in. It is a store outside React, read the way React asks a browser value to
 * be read: the server knows nothing of it, so the server's answer is nothing and the first paint matches the HTML,
 * and every money screen open at once follows a press on any one of them.
 */
const listeners = new Set<() => void>();
function watchTheTab(changed: () => void): () => void {
  listeners.add(changed);
  return () => listeners.delete(changed);
}
function inTheTab(): DisplayCurrency | null {
  try {
    const kept = window.sessionStorage.getItem(KEPT);
    return isDisplayCurrency(kept) ? kept : null;
  } catch {
    // A browser that refuses its own storage reads in what the device proposes, which is the honest default.
    return null;
  }
}
const noneOnTheServer = () => null;
function keepInTheTab(currency: DisplayCurrency): void {
  try {
    window.sessionStorage.setItem(KEPT, currency);
  } catch {
    // Nothing kept, and nothing lost: what is read now is what the screens will use until the tab is closed.
  }
  for (const changed of [...listeners]) changed();
}

export type DisplayMoney = Readonly<{
  currency: DisplayCurrency;
  /** Every currency a person may read in today, asked of the rails and the rate file (D152), never written down. */
  offered: readonly string[];
  /** Whether the rate source has answered yet: a screen says "could not be read" only once it has. */
  ratesAsked: boolean;
  /** The device's own language tag, which is what proposes a currency and orders the list. */
  language: string | undefined;
  /** Read it in another currency. Kept for the tab, and written to the account when there is one signed in. */
  readIn: (currency: DisplayCurrency) => void;
  rates: Rates | undefined;
  /** "about 9.53 EUR (rate of 16 Sep)", or nothing when the dollar stands alone. */
  about: (units: bigint) => string | undefined;
  /** The amount as the display size shows it: the symbol and the number, and the rate's day for the caption. */
  figure: (units: bigint) => DisplayFigure;
  /** The line to print once on a screen that wanted to convert and could not. Empty when it could, or never wanted to. */
  unavailable: string | undefined;
}>;

type RatesAnswer = { rates: Rates | null; currencies?: readonly string[] };
type PreferencesAnswer = { displayCurrency: DisplayCurrency | null };

/**
 * The device's language tag, read the way React asks for a value the server does not have: the server snapshot
 * is nothing, so the first paint proposes dollars everywhere and the browser corrects it without a mismatch.
 */
const never = () => () => {};
const deviceLanguage = () => navigator.language;
const noLanguage = () => undefined;

export function useDisplayCurrency(address: string | undefined): DisplayMoney {
  const language = useSyncExternalStore(never, deviceLanguage, noLanguage);
  const [rates, setRates] = useState<Rates | undefined>(undefined);
  const [offered, setOffered] = useState<readonly string[]>(CURRENCIES_WHEN_SILENT);
  /** Whether the source has answered at all. Not yet is not the same thing as no, and no screen may say it is. */
  const [ratesAsked, setRatesAsked] = useState(false);
  // The choice, and whose it is, so an account signing out never keeps another account's currency.
  const [chosenFor, setChosenFor] = useState<{ address: string; currency: DisplayCurrency | null } | undefined>(undefined);
  /**
   * What this tab was asked to read in (D144). The card carries the choice now, because somebody without an account
   * has no page to set it on and a dollar sign on the first screen is what makes a funder in the euro area close
   * the tab. An account still keeps its own, which is what follows a person from one device to the next.
   */
  const forTheTab = useSyncExternalStore(watchTheTab, inTheTab, noneOnTheServer);

  useEffect(() => {
    let live = true;
    getJson<RatesAnswer>("/api/rates")
      .then((answer) => {
        if (!live) return;
        setRates(answer.rates && ratesUsable(answer.rates, Date.now()) ? answer.rates : undefined);
        if (answer.currencies && answer.currencies.length > 0) setOffered(answer.currencies);
        setRatesAsked(true);
      })
      .catch(() => {
        if (!live) return;
        setRates(undefined);
        setRatesAsked(true);
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!address) return;
    let live = true;
    getJson<PreferencesAnswer>("/api/account/preferences")
      .then((answer) => {
        if (live) setChosenFor({ address, currency: answer.displayCurrency });
      })
      .catch(() => {
        if (live) setChosenFor({ address, currency: null });
      });
    return () => {
      live = false;
    };
  }, [address]);

  const chosen = address && chosenFor?.address === address ? chosenFor.currency : null;
  const asked = forTheTab ?? chosen ?? proposedDisplayCurrency(language);
  /**
   * What the screens read in, and it is the dollar until a rate makes another currency true (D151).
   *
   * The rate is asked for over the network and arrives a moment after the currency is known, and in that moment a
   * card printed the franc's mark in front of a dollar figure: "CFA 51.56" for a gift of 29,512 francs. Every
   * figure falls back to the dollar when there is no rate, so the mark has to fall back with them. One answer, and
   * the mark and the figures change together when it lands.
   */
  const currency = asked === "USD" || rates ? asked : "USD";
  return {
    currency,
    offered,
    ratesAsked,
    language,
    rates,
    readIn: (next) => {
      keepInTheTab(next);
      if (address) {
        setChosenFor({ address, currency: next });
        void putJson<{ displayCurrency: DisplayCurrency }>("/api/account/preferences", { displayCurrency: next }).catch(() => undefined);
      }
    },
    about: (units) => aboutInDisplayCurrency(units, currency, rates),
    figure: (units) => figureInDisplayCurrency(units, currency, rates),
    unavailable: asked !== "USD" && !rates ? SHOWN_IN_DOLLARS : undefined,
  };
}
