import type { ReactNode } from "react";
import { BODY, CARD } from "../components/ui";

/** A sentence where a list would be, and the action that fills it when there is one. */
export function EmptyState({ children, action }: Readonly<{ children: ReactNode; action?: ReactNode }>) {
  return (
    <section className={CARD}>
      <p className={BODY}>{children}</p>
      {action}
    </section>
  );
}
