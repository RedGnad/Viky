import type { ReactNode } from "react";
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
