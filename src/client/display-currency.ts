"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { aboutInDisplayCurrency, proposedDisplayCurrency, SHOWN_IN_DOLLARS, type DisplayCurrency } from "../display-currency";
import { ratesUsable, type Rates } from "../rates";
import { getJson } from "./api";

/**
 * The display currency of the account on this device, and the one line every money screen needs from it.
 *
 * The device proposes from its language tag, never by a question. A choice the account made on the account
 * page wins over the proposal and is read from the server, so it follows the account across devices. The rate
 * comes from Viky's own route, which answers nothing when the source has not for three days: then `about`
 * returns nothing and `unavailable` carries the one line to print instead (decision 1, 17 Sep 2026).
 */

export type DisplayMoney = Readonly<{
  currency: DisplayCurrency;
  rates: Rates | undefined;
  /** "about 9.53 EUR (rate of 16 Sep)", or nothing when the dollar stands alone. */
  about: (units: bigint) => string | undefined;
  /** The line to print once on a screen that wanted to convert and could not. Empty when it could, or never wanted to. */
  unavailable: string | undefined;
}>;

type RatesAnswer = { rates: Rates | null };
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
  // The choice, and whose it is, so an account signing out never keeps another account's currency.
  const [chosenFor, setChosenFor] = useState<{ address: string; currency: DisplayCurrency | null } | undefined>(undefined);

  useEffect(() => {
    let live = true;
    getJson<RatesAnswer>("/api/rates")
      .then((answer) => {
        if (live) setRates(answer.rates && ratesUsable(answer.rates, Date.now()) ? answer.rates : undefined);
      })
      .catch(() => {
        if (live) setRates(undefined);
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
  const currency = chosen ?? proposedDisplayCurrency(language);
  return {
    currency,
    rates,
    about: (units) => aboutInDisplayCurrency(units, currency, rates),
    unavailable: currency !== "USD" && !rates ? SHOWN_IN_DOLLARS : undefined,
  };
}
