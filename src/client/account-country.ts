import { useCallback, useEffect, useState } from "react";
import { getJson, putJson } from "./api";

/**
 * Where the person lives, a fact of the account (D274), and the countries it can be. Read from the account's
 * preferences, written back there; never taken from a phone number, which only ever proposes one.
 */
export type OutCountries = Readonly<{ countries: readonly string[]; prefixes: Readonly<Record<string, string>>; unread: readonly string[] }>;

let countriesAsked: Promise<OutCountries> | undefined;
export function loadOutCountries(): Promise<OutCountries> {
  countriesAsked ??= getJson<OutCountries>("/api/rails/countries").catch((error: unknown) => {
    countriesAsked = undefined;
    throw error;
  });
  return countriesAsked;
}

/** The number this device topped up last (D274), kept on the device only, for the next top-up and nothing else. */
export const LAST_NUMBER_KEY = "viky.phone.last-number";
export function lastNumber(): string | null {
  try {
    return window.localStorage.getItem(LAST_NUMBER_KEY);
  } catch {
    return null;
  }
}
export function rememberNumber(number: string): void {
  try {
    window.localStorage.setItem(LAST_NUMBER_KEY, number);
  } catch {
    // A device that keeps nothing asks for the number again next time, which is what it did before.
  }
}

/** The country a number belongs to, by the longest calling prefix that starts it: a proposal, never an answer. */
export function countryOfNumber(number: string | null, prefixes: Readonly<Record<string, string>>): string | null {
  const digits = (number ?? "").replace(/[^\d+]/g, "");
  if (!digits.startsWith("+")) return null;
  let best: { code: string; length: number } | null = null;
  for (const [code, prefix] of Object.entries(prefixes)) {
    if (digits.startsWith(`+${prefix}`) && (!best || prefix.length > best.length)) best = { code, length: prefix.length };
  }
  return best?.code ?? null;
}

/** The account's country: undefined while it is read, null when none was said, and the way to say one. */
export function useAccountCountry(address: string | undefined): { country: string | null | undefined; save: (country: string) => Promise<void> } {
  const [country, setCountry] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!address) return;
    let live = true;
    getJson<{ country?: string | null }>("/api/account/preferences").then(
      (answer) => {
        if (live) setCountry(answer.country ?? null);
      },
      () => {
        if (live) setCountry(null);
      },
    );
    return () => {
      live = false;
    };
  }, [address]);
  const save = useCallback(async (next: string) => {
    setCountry(next);
    await putJson("/api/account/preferences", { country: next });
  }, []);
  return { country, save };
}
