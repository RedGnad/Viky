import type { WayOut } from "./rails";

/**
 * Where a person's bank or card is, as far as a screen may guess, and what that guess is allowed to do (R1).
 *
 * It is allowed to **order** the ways out and to preselect one. It is never allowed to hide one: a guess about
 * somebody's country is wrong often enough (a trip, a shared connection, a private network, a device bought abroad)
 * that hiding on it would take money out of reach with no way back. The rail itself stays the judge, through its own
 * identity check, and both cards stay on the screen whatever this says.
 *
 * Two signals, and neither is asked of the person: the country the platform reads from the connection, and the region
 * of the device's own language. When they agree, nothing is asked. When they differ, one question is, and the answer
 * wins over both. Browser safe: no fetch, no key, no list of countries written here.
 */

/** A two letter country code, lower case, or nothing when the value is not one. */
export function countryCode(value: string | null | undefined): string | null {
  const code = (value ?? "").trim().toLowerCase();
  return /^[a-z]{2}$/.test(code) ? code : null;
}

/**
 * The region of a device's language, when it carries one: "fr-SN" is somebody in Senegal reading French, "fr" alone
 * says nothing about a country and answers nothing. `Intl` knows the shapes, so no list is kept here.
 */
export function regionOfLocale(locale: string | null | undefined): string | null {
  const tag = (locale ?? "").trim();
  if (tag === "") return null;
  try {
    return countryCode(new Intl.Locale(tag).region ?? null);
  } catch {
    return null;
  }
}

/** The country in the words a person uses, from `Intl`, or the code itself when the runtime has no name for it. */
export function countryInWords(code: string | null, language = "en"): string | null {
  const country = countryCode(code);
  if (!country) return null;
  try {
    return new Intl.DisplayNames([language], { type: "region" }).of(country.toUpperCase()) ?? country.toUpperCase();
  } catch {
    return country.toUpperCase();
  }
}

export type CountryGuess = Readonly<{
  /** The country the screen works from, or nothing when there is no usable signal at all. */
  country: string | null;
  /** True when the two signals disagree and nobody has answered yet: the screen asks once, and orders nothing until then. */
  ask: boolean;
  /** What the two signals said, for the one question's two answers. */
  fromConnection: string | null;
  fromDevice: string | null;
}>;

/**
 * What the screen works from. An answer from the person wins over everything; two signals that agree need no question;
 * one signal alone is taken as it is; two that differ ask, and order nothing meanwhile.
 */
export function guessCountry(input: { fromConnection?: string | null; fromDevice?: string | null; answered?: string | null }): CountryGuess {
  const fromConnection = countryCode(input.fromConnection);
  const fromDevice = countryCode(input.fromDevice);
  const answered = countryCode(input.answered);
  if (answered) return { country: answered, ask: false, fromConnection, fromDevice };
  if (fromConnection && fromDevice && fromConnection !== fromDevice) return { country: null, ask: true, fromConnection, fromDevice };
  return { country: fromConnection ?? fromDevice, ask: false, fromConnection, fromDevice };
}

/** What a rail answered about one country: it serves it, it does not, or nothing could be read just now. */
export type RailReach = "serves" | "does-not" | "unknown";

/**
 * Rails in the order to show them, in or out. One rule, and only one: a rail whose own service says it does not serve
 * this country goes last. Everything else keeps the order the register gives it, which is the order somebody chose on
 * purpose, and nothing is ever removed.
 *
 * Why "serves" does not jump the queue: one of the two ways in publishes no per-country answer at all (D101), so
 * ranking an answer above a silence would push it behind for ever, everywhere, on a difference that says nothing
 * about the person. A silence is not a refusal.
 */
export function orderRails<T extends { name: string }>(rails: readonly T[], reach: Readonly<Record<string, RailReach>>): readonly T[] {
  const rank = (rail: T) => (reach[rail.name] === "does-not" ? 1 : 0);
  return [...rails].sort((left, right) => rank(left) - rank(right));
}

/** The same rule, named for the way out, which is where it started (R1). */
export function orderWaysOut(ways: readonly WayOut[], reach: Readonly<Record<string, RailReach>>): readonly WayOut[] {
  return orderRails(ways, reach);
}
