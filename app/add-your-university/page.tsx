import type { Metadata } from "next";
import { ADD_UNIVERSITY as W } from "@/src/sentences";
import { BODY, DISPLAY, HELP, TITLE } from "../components/ui";
import { Shell } from "../kit/Shell";

export const metadata: Metadata = { title: W.title };

/**
 * How a student adds their university from home (D246): five steps on the Reclaim account kept for students, the
 * three things they send at the end, and what Viky never receives. Public, and it asks for nothing: the student sends
 * the three things to whoever sent them here. The shape is the help page's.
 */
export default function Page() {
  return (
    <Shell kind="document" back="/">
      <header className="space-y-[var(--space-lg)]">
        <h1 className={DISPLAY}>{W.title}</h1>
        <p className={HELP}>{W.intro}</p>
      </header>
      <ol className="space-y-[var(--space-lg)]">
        {W.steps.map((step, index) => (
          <li key={step.title} className="space-y-[var(--space-sm)]">
            <h2 className={TITLE}>
              {index + 1}. {step.title}
            </h2>
            <p className={BODY}>{step.body}</p>
          </li>
        ))}
      </ol>
      <section className="space-y-[var(--space-sm)]">
        <h2 className={TITLE}>{W.neverTitle}</h2>
        <p className={BODY}>{W.never}</p>
      </section>
      <section className="space-y-[var(--space-sm)]">
        <h2 className={TITLE}>{W.nextTitle}</h2>
        <p className={BODY}>{W.next}</p>
      </section>
    </Shell>
  );
}
