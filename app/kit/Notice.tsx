import type { ReactNode } from "react";
import { BODY, CARD, HELP } from "../components/ui";

/** One sentence of state, on a surface: the session, a wait, being offline. A title is optional and in the text face. */
export function Notice({ title, children, role }: Readonly<{ title?: string; children: ReactNode; role?: "status" | "alert" }>) {
  return (
    <section className={CARD} role={role}>
      {title ? <p className="font-medium">{title}</p> : null}
      <div className={title ? HELP : BODY}>{children}</div>
    </section>
  );
}
