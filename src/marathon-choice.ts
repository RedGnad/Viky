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

/**
 * The countries of the list, each once, by their name in words. `inWords` is how the list's own source names a place
 * that is no country: the WCA's competitions in several countries at once (src/wca.ts).
 */
export function countriesOf(list: readonly ListedByCountry[], inWords: (code: string) => string | null = countryInWords): readonly { code: string; name: string }[] {
  const codes = [...new Set(list.map((one) => one.country))];
  return codes.map((code) => ({ code, name: inWords(code) ?? code })).sort((left, right) => left.name.localeCompare(right.name, "en"));
}

/** The list under the filter: everything when no country is chosen, the country's races otherwise. */
export function inCountryOrAll<T extends ListedByCountry>(list: readonly T[], country: string | null): readonly T[] {
  return country ? list.filter((one) => one.country === country) : list;
}

/** A listed race, with the distances a gift can be made on. */
export type ListedWithDistances = ListedByCountry & Readonly<{ events: readonly { distance: string; label: string }[] }>;

/** The order distances are said in: the longest first. A distance this file does not know comes after them. */
const DISTANCE_ORDER: readonly string[] = ["marathon", "half", "10k"];
const rank = (distance: string) => (DISTANCE_ORDER.includes(distance) ? DISTANCE_ORDER.indexOf(distance) : DISTANCE_ORDER.length);

/** The distances of the list, each once, the longest first, with their words: the filter's chips. */
export function distancesOf(list: readonly ListedWithDistances[]): readonly { distance: string; label: string }[] {
  const found = new Map<string, string>();
  for (const race of list) for (const event of race.events) if (!found.has(event.distance)) found.set(event.distance, event.label);
  return [...found].map(([distance, label]) => ({ distance, label })).sort((left, right) => rank(left.distance) - rank(right.distance));
}

/** The list under the distance filter: everything when none is chosen, the races that run that distance otherwise. */
export function withDistanceOrAll<T extends ListedWithDistances>(list: readonly T[], distance: string | null): readonly T[] {
  return distance ? list.filter((race) => race.events.some((event) => event.distance === distance)) : list;
}

/** A race's distances in words, the longest first, for the start of its line: "Half marathon, 10 km". */
export function distancesInWords(race: ListedWithDistances): string {
  return [...race.events].sort((left, right) => rank(left.distance) - rank(right.distance)).map((event) => event.label).join(", ");
}
