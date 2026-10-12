import { Children, type ReactNode } from "react";
import { FoldChevron } from "../kit/GiftLive";
import { TITLE } from "../components/ui";

/**
 * One section of the judges page, folded under its title (the audit of 1 Oct 2026, D-11: 13,000 words and no way
 * through them on a phone). Nothing is removed: a section is its title until it is pressed, and then it is exactly what
 * it was. The fold is the product's own, the one a gift's page uses (`gift-fold-name`, its chevron), and it is a plain
 * `details`, so it opens without a script and a browser's own search finds what it holds.
 *
 * The `section` stays the block the page is made of, with the id the contents list points at: the title is still the
 * section's heading, and a test that looks for a section by its heading still finds it.
 */
export function Fold({ id, title, open = false, space = "sm", children }: Readonly<{ id: string; title: string; open?: boolean; space?: "sm" | "md"; children: ReactNode }>) {
  return (
    <section id={id} className="judges-section">
      <details open={open}>
        <summary className="gift-fold-name">
          <h2 className={TITLE}>{title}</h2>
          <FoldChevron />
        </summary>
        <div className={space === "md" ? "space-y-[var(--space-md)] pt-[var(--space-sm)]" : "space-y-[var(--space-sm)] pt-[var(--space-sm)]"}>{children}</div>
      </details>
    </section>
  );
}

/**
 * A row (the founder's preview of 12 Oct 2026): one line that carries a title, and under it the whole of a long text.
 * A fold opens on a few lines or a table and on rows like this one, never on the text itself: nothing is removed, each
 * text sits one level down, under the line that names it. `meta` is what the line says of itself at its right, a state
 * or a count. A plain `details`, as the fold is: it opens without a script, and a browser's search finds what it holds.
 */
export function Row({ title, meta, children }: Readonly<{ title: ReactNode; meta?: ReactNode; children: ReactNode }>) {
  return (
    <details className="judges-row">
      <summary>
        <span>{title}</span>
        <span className="judges-row-meta">
          {meta}
          <FoldChevron />
        </span>
      </summary>
      <div className="judges-row-body">{children}</div>
    </details>
  );
}

/** The rows of a fold or of a group, between the page's own lines. */
export function Rows({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="judges-rows">{children}</div>;
}

/** A group of rows under its own name: how many it holds, and one line that says what they are about. */
export function RowGroup({ title, about, children }: Readonly<{ title: string; about?: string; children: ReactNode }>) {
  return (
    <div className="judges-group space-y-[var(--space-xs)]">
      <h3 className="font-semibold">
        {title}
        {/* How many rows it holds, counted from the rows themselves. */}
        <span> {Children.count(children)}</span>
      </h3>
      {about ? <p className="text-[length:var(--type-help)] text-[var(--muted)]">{about}</p> : null}
      <Rows>{children}</Rows>
    </div>
  );
}

/** A long passage inside a section, folded under one line that says what it holds. */
export function SubFold({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <details className="judges-subfold">
      <summary className="gift-fold-name">
        <h3 className="font-medium">{title}</h3>
        <FoldChevron />
      </summary>
      <div className="space-y-[var(--space-sm)] pt-[var(--space-xs)]">{children}</div>
    </details>
  );
}
