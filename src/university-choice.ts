import { ACCOUNT_ONLY_MARK } from "./university-shown";
/**
 * How "Which university?" is asked (D247, the advisor's brief of 25 Sep 2026). Browser safe: the list is small and it
 * is Viky's own table, so it is read whole and ordered here.
 *
 * Up to five universities, a list of radios grouped by country and no search field: Material's own bound for radio
 * buttons ("five options or fewer", app/kit/ChoiceList.tsx), and a search box in front of three names is a question
 * nobody needs to ask. Beyond five, the country first, as buttons, then the search within that country.
 */
export const RADIOS_UP_TO = 5;

/**
 * The corridor's countries go first among the buttons: the pilot's cross-border gifts are aimed at Senegal and Ivory
 * Coast, and at France (src/rails.ts, the countries read for the way in). Every other country follows, by name.
 */
export const CORRIDOR_COUNTRIES: readonly string[] = ["sn", "ci", "fr"];

/** A university as the chooser lists it: the portal's id pressed, its name, its country in words and as a code. */
export type ListedUniversity = Readonly<{ pair: string; title: string; issuer: string; country: string; proves?: "enrolment" | "account" }>;

/**
 * The chosen university as the gift's sentence reads it (D267): its name and country, and, when its portal proves a
 * student account alone, the mark `universityNamed` turns into the sentence that says so. The list's line stays the
 * name alone (D264).
 */
export function chosenUniversityTitle(one: ListedUniversity): string {
  return `${one.title}, ${one.issuer}${one.proves === "account" ? ACCOUNT_ONLY_MARK : ""}`;
}

export type CountryGroup = Readonly<{ code: string; name: string; universities: readonly ListedUniversity[] }>;

export function choiceMode(count: number): "radios" | "country-first" {
  return count <= RADIOS_UP_TO ? "radios" : "country-first";
}

/** The universities by country, the corridor's first in its own order, then every other country by name. */
export function byCountry(universities: readonly ListedUniversity[]): readonly CountryGroup[] {
  const groups = new Map<string, { code: string; name: string; universities: ListedUniversity[] }>();
  for (const one of universities) {
    const group = groups.get(one.country) ?? { code: one.country, name: one.issuer, universities: [] };
    group.universities.push(one);
    groups.set(one.country, group);
  }
  const rank = (code: string) => {
    // The table writes a country's code in capitals ("SN"); the corridor is read in either case.
    const at = CORRIDOR_COUNTRIES.indexOf(code.toLowerCase());
    return at === -1 ? CORRIDOR_COUNTRIES.length : at;
  };
  return [...groups.values()]
    .map((group) => ({ ...group, universities: [...group.universities].sort((left, right) => left.title.localeCompare(right.title)) }))
    .sort((left, right) => rank(left.code) - rank(right.code) || left.name.localeCompare(right.name));
}

/** Folded for comparison: case and accents gone, so "universite" finds "Université". */
const folded = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** The universities of one country whose name carries every word typed; all of them when nothing is typed. */
export function inCountry(universities: readonly ListedUniversity[], country: string, words: string): readonly ListedUniversity[] {
  const wanted = folded(words).split(/\s+/).filter(Boolean);
  return universities.filter((one) => one.country === country && wanted.every((word) => folded(one.title).includes(word)));
}
