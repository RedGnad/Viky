import { countryInWords } from "./rail-country";

/**
 * "Which race?" as the founder asks it (27 Sep 2026): every coming race of the register, all countries, by date, under
 * one filter "Country · all"; choosing a country keeps its races only, taking it off gives everything back. The same
 * for the WCA competitions. Browser safe: what the list route answers, sorted and grouped here.
 */
export type ListedByCountry = Readonly<{ country: string; startsAt: string }>;

/** The races by their start, the earliest first; two on the same day keep the register's order. */
export function byDate<T extends ListedByCountry>(list: readonly T[]): readonly T[] {
  return [...list].sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());
}

/** The countries of the list, each once, by their name in words. */
export function countriesOf(list: readonly ListedByCountry[]): readonly { code: string; name: string }[] {
  const codes = [...new Set(list.map((one) => one.country))];
  return codes.map((code) => ({ code, name: countryInWords(code) ?? code })).sort((left, right) => left.name.localeCompare(right.name, "en"));
}

/** The list under the filter: everything when no country is chosen, the country's races otherwise. */
export function inCountryOrAll<T extends ListedByCountry>(list: readonly T[], country: string | null): readonly T[] {
  return country ? list.filter((one) => one.country === country) : list;
}
