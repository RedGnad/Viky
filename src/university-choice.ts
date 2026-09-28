/**
 * How "Which university?" is asked (D247, D313). Browser safe.
 *
 * Since D313 the list is the world's, thousands of universities, so it is never read whole: the country first, in the
 * same sheet with a search as "Where you live" (app/kit/CountryPicker.tsx), then that country's universities, read on
 * their own and searched within. The names alone on every line (D264).
 */

/** A university as the chooser lists it: the portal's id pressed, its name, its country in words and as a code. */
export type ListedUniversity = Readonly<{
  pair: string;
  title: string;
  issuer: string;
  country: string;
  /** The grading scale its results provider pins ("20", "letters"), or nothing while none is pinned. */
  scale?: string | null;
}>;

/** A country of the list, and how many universities it holds. */
export type ListedCountry = Readonly<{ code: string; count: number }>;

/** The chosen university as the gift's sentence reads it: its name and its country. */
export function chosenUniversityTitle(one: ListedUniversity): string {
  return `${one.title}, ${one.issuer}`;
}

/** Folded for comparison: case and accents gone, so "universite" finds "Université". */
const folded = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** The universities whose name carries every word typed, by name; all of them when nothing is typed. */
export function matching(universities: readonly ListedUniversity[], words: string): readonly ListedUniversity[] {
  const wanted = folded(words).split(/\s+/).filter(Boolean);
  return universities.filter((one) => wanted.every((word) => folded(one.title).includes(word))).sort((left, right) => left.title.localeCompare(right.title));
}
