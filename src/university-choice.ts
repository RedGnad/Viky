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
  /** Tested with a student: a provider of it pinned from a reviewed first proof. Only for grouping, never said on the line. */
  tested?: boolean;
}>;

/** A country of the list, and how many universities it holds. */
export type ListedCountry = Readonly<{ code: string; count: number }>;

/** The chosen university as the gift's sentence reads it: its name and its country. */
export function chosenUniversityTitle(one: ListedUniversity): string {
  return `${one.title}, ${one.issuer}`;
}

/** Folded for comparison: case and accents gone, so "universite" finds "Université". */
const folded = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/**
 * One country's universities as the chooser draws them (the founder, 29 Sep 2026): those tested with a student first,
 * then all the others, the search on both.
 */
export function inGroups(universities: readonly ListedUniversity[], words: string): Readonly<{ tested: readonly ListedUniversity[]; others: readonly ListedUniversity[] }> {
  const found = matching(universities, words);
  return { tested: found.filter((one) => one.tested === true), others: found.filter((one) => one.tested !== true) };
}

/**
 * What a university is sorted by (the founder, 29 Sep 2026): its own name, without the word every university's name
 * starts with, in any of the list's languages, and the "de", "of" after it. "Université de Toulouse" sorts as
 * "Toulouse", beside "Toulouse I Capitole University" and "University of Toulouse Jean Jaurès"; the line still reads
 * the whole name.
 */
const GENERIC_START =
  /^(?:the\s+)?(?:universit[eéaà]t?|university|universidad|universidade|universitat|universität|universiteit|universiti|universitas|college|école|ecole|institut|institute|instituto|istituto|school|hochschule)\s+(?:(?:of|de|du|des|d'|della|di|del|degli|der|für|van|la|le|les|the)\s+)*/i;

export function sortName(title: string): string {
  const own = title.trim().replace(GENERIC_START, "");
  return folded(own || title);
}

/** The universities whose name carries every word typed, by their own name; all of them when nothing is typed. */
export function matching(universities: readonly ListedUniversity[], words: string): readonly ListedUniversity[] {
  const wanted = folded(words).split(/\s+/).filter(Boolean);
  return universities
    .filter((one) => wanted.every((word) => folded(one.title).includes(word)))
    .sort((left, right) => sortName(left.title).localeCompare(sortName(right.title)) || left.title.localeCompare(right.title));
}
