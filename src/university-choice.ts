/**
 * How "Which university?" is asked (D247, D313). Browser safe.
 *
 * Since D313 the list is the world's, eleven thousand universities. Since the founder's choice of 30 Sep 2026 it is
 * read whole, once, and opens on every country: one field searches it at once, and a country chip narrows it
 * (app/kit/CountryPicker.tsx). The names alone on every line (D264), with the country beside them when several are shown.
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
  // And without the quotes or marks a name can open on, which put "'Konrad Wolf'" and "\"Petre Andrei\"" at the top of
  // the whole list (30 Sep 2026).
  const own = title.trim().replace(GENERIC_START, "").replace(/^[^\p{L}\p{N}]+/u, "");
  return folded(own || title);
}

/** The universities whose name carries every word typed, by their own name; all of them when nothing is typed. */
export function matching(universities: readonly ListedUniversity[], words: string): readonly ListedUniversity[] {
  const wanted = folded(words).split(/\s+/).filter(Boolean);
  return universities
    .filter((one) => wanted.every((word) => folded(one.title).includes(word)))
    .sort((left, right) => sortName(left.title).localeCompare(sortName(right.title)) || left.title.localeCompare(right.title));
}

/** A university ready to be searched: its own sort key and its folded name, worked out once and not on each keystroke. */
export type IndexedUniversity = Readonly<{ one: ListedUniversity; name: string }>;

/** The whole list sorted by each university's own name, once, with its name folded for the search. */
export function indexUniversities(universities: readonly ListedUniversity[]): readonly IndexedUniversity[] {
  return universities
    .map((one) => ({ one, name: folded(one.title), key: sortName(one.title) }))
    .sort((left, right) => left.key.localeCompare(right.key) || left.one.title.localeCompare(right.one.title))
    .map(({ one, name }) => ({ one, name }));
}

/**
 * What the chooser shows (the founder, 30 Sep 2026): every university, or one country's when a country is chosen, those
 * whose name carries every word typed, the tested first and then all the others, each group by own name.
 */
export function shownUniversities(index: readonly IndexedUniversity[], words: string, country: string | null): Readonly<{ tested: readonly ListedUniversity[]; others: readonly ListedUniversity[] }> {
  const wanted = folded(words).split(/\s+/).filter(Boolean);
  const tested: ListedUniversity[] = [];
  const others: ListedUniversity[] = [];
  for (const entry of index) {
    if (country && entry.one.country !== country) continue;
    if (!wanted.every((word) => entry.name.includes(word))) continue;
    (entry.one.tested === true ? tested : others).push(entry.one);
  }
  return { tested, others };
}
