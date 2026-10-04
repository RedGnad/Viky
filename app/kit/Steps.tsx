import type { ReactNode } from "react";
import { BODY } from "../components/ui";

/**
 * Numbered steps, short (the founder, 4 Oct 2026): what to do, in order, a few words each, in place of a paragraph
 * that says the same thing in one breath. Each step may carry the thing it is about under its words: the code and its
 * copy, the button to press.
 */
export function Steps({ children }: Readonly<{ children: ReactNode }>) {
  return <ol className="said-steps flex flex-col gap-[var(--space-md)]">{children}</ol>;
}

export function Step({ says, children }: Readonly<{ says: string; children?: ReactNode }>) {
  return (
    <li className="said-step flex flex-col gap-[var(--space-sm)]">
      <p className={BODY}>{says}</p>
      {children}
    </li>
  );
}
