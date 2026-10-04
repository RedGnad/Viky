import { BODY, HELP } from "../components/ui";

/**
 * Short lines, a label and its value (the founder, 4 Oct 2026): "A missed day : back to you". What a fold holds, and
 * what a screen says of a gift or an account in place of sentences. His rule: no block of text in an app, show rather
 * than explain, and what will not be read is not shown. So a fold holds lines and never paragraphs, four at most.
 *
 * One text role for the level it stands on: the body's in the open, the help's inside a fold (`quiet`). The label is
 * the muted ink and the value the page's own, so the pair reads as one line without a weight of its own.
 */
export const MOST_LINES_IN_A_FOLD = 4;

export function Lines({ rows, quiet = false }: Readonly<{ rows: ReadonlyArray<readonly [label: string, value: string]>; quiet?: boolean }>) {
  const shown = rows.filter(([label, value]) => label && value);
  if (shown.length === 0) return null;
  const role = quiet ? HELP : BODY;
  return (
    <dl className="said-lines" data-lines={shown.length}>
      {shown.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-[var(--space-md)] py-[var(--space-xs)]">
          <dt className={`${role} text-[var(--muted)]`}>{label}</dt>
          {/* A value is read whole: the label wraps, never the value. */}
          <dd className={`${role} text-right text-[var(--text)]`}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
