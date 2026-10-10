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
  /**
   * The senses a student of it can show a proof of today (src/university-ready.ts): its provider of that sense is in
   * place, with the rule its proofs are checked against. Only for grouping, never said on the line.
   */
  ready?: readonly UniversitySense[];
}>;

/** What a university gift asks its student to show: that they are enrolled, or a page of results (D313). */
export type UniversitySense = "enrolment" | "results";

/** The sense a gift's condition reads: enrolment for "enrolled", the results page for a year passed and for a grade. */
export function senseOfCondition(conditionId: string): UniversitySense {
  return conditionId === "university-enrollment-shown" ? "enrolment" : "results";
}

/**
 * How many universities a group holds, as its heading says it: by the thousand once there are thousands, since the
 * list grows by the day and a heading is not a count to check, and the number itself under that.
 */
export function countInWords(count: number): string {
  return (count >= 1_000 ? Math.floor(count / 1_000) * 1_000 : count).toLocaleString("en-US");
}

/** The chosen university as the gift's sentence reads it: its name and its country. */
export function chosenUniversityTitle(one: ListedUniversity): string {
  return `${one.title}, ${one.issuer}`;
}

/** Folded for comparison: case and accents gone, so "universite" finds "Université". */
const folded = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/**
 * One country's universities as the chooser draws them (the founder, 29 Sep 2026, and the UI pass of 8 Oct 2026): those
 * a student can show from today first, for what the gift asks, then all the others, the search on both.
 */
export function inGroups(universities: readonly ListedUniversity[], words: string, sense: UniversitySense): Readonly<{ ready: readonly ListedUniversity[]; others: readonly ListedUniversity[] }> {
  const found = matching(universities, words);
  return { ready: found.filter((one) => readyOn(one, sense)), others: found.filter((one) => !readyOn(one, sense)) };
}

const readyOn = (one: ListedUniversity, sense: UniversitySense) => one.ready?.includes(sense) === true;

/** Whether a student of this university can show their page today, for what the gift asks: its mark, and its line once chosen. */
export function readyFor(one: ListedUniversity, sense: UniversitySense): boolean {
  return readyOn(one, sense);
}

/** How many universities the field searches: every one of the list, or the chosen country's. */
export function searchedCount(index: readonly IndexedUniversity[], country: string | null): number {
  return country ? index.filter((entry) => entry.one.country === country).length : index.length;
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
 * whose name carries every word typed, the ones ready today for what the gift asks first and then all the others, each
 * group by own name.
 */
export function shownUniversities(index: readonly IndexedUniversity[], words: string, country: string | null, sense: UniversitySense): Readonly<{ ready: readonly ListedUniversity[]; others: readonly ListedUniversity[] }> {
  const wanted = folded(words).split(/\s+/).filter(Boolean);
  const ready: ListedUniversity[] = [];
  const others: ListedUniversity[] = [];
  for (const entry of index) {
    if (country && entry.one.country !== country) continue;
    if (!wanted.every((word) => entry.name.includes(word))) continue;
    (readyOn(entry.one, sense) ? ready : others).push(entry.one);
  }
  return { ready, others };
}
