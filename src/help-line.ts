/**
 * One line of help under a field, 60 characters at most (the founder's rule 4 of 1 Oct 2026, kit-rules.html). The rest
 * is read in a fold or in the sheet, never deleted.
 *
 * A help written for a field is cut where its first sentence ends: that sentence stays under the field when it fits,
 * and everything after it goes down. A first sentence too long for the line goes down whole, so no sentence is ever
 * cut in two and none is reworded by a screen. Browser safe.
 */
export const HELP_LINE_MAX = 60;

export type HelpLine = Readonly<{ line: string | null; rest: string | null }>;

/** The longest sentence a screen leaves in the open where it is not under a field (the guard of test/screen-sentences.test.ts). */
export const OPEN_LINE_MAX = 90;

export function helpLine(help: string | null | undefined, max: number = HELP_LINE_MAX): HelpLine {
  const text = help?.trim() ?? "";
  if (text.length === 0) return { line: null, rest: null };
  const end = /[.?!](?=\s|$)/.exec(text);
  const first = end ? text.slice(0, end.index + 1) : text;
  if (first.length > max) return { line: null, rest: text };
  const rest = text.slice(first.length).trim();
  return { line: first, rest: rest.length > 0 ? rest : null };
}
