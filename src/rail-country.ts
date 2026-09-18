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
 * The ways out in the order to show them: the ones their own service says it serves, then the rest, each group in the
 * order the register lists them. Nothing is removed, and a rail that could not be read keeps its place.
 */
export function orderWaysOut(ways: readonly WayOut[], reach: Readonly<Record<string, RailReach>>): readonly WayOut[] {
  const rank = (way: WayOut) => (reach[way.name] === "serves" ? 0 : reach[way.name] === "unknown" ? 1 : 2);
  return [...ways].sort((left, right) => rank(left) - rank(right));
}
