import type { Metadata } from "next";
import { HELP as W } from "@/src/sentences";
import { BODY, DISPLAY, HELP, TITLE } from "../components/ui";
import { Shell } from "../kit/Shell";

export const metadata: Metadata = { title: W.title };

/**
 * Help exists, or the word disappears (design pass, screen 3.10): five questions, each answered with a sentence
 * the product already keeps true elsewhere. Written on 17 Sep 2026; nobody outside the team has been stuck on
 * anything yet, so these are the five questions the screens themselves raise.
 */
export default function Page() {
  return (
    <Shell kind="document" back="/me">
      <header className="space-y-[var(--space-lg)]">
        <h1 className={DISPLAY}>{W.title}</h1>
        <p className={HELP}>{W.intro}</p>
      </header>
      {W.questions.map((item) => (
        <section key={item.q} className="space-y-[var(--space-sm)]">
          <h2 className={TITLE}>{item.q}</h2>
          <p className={BODY}>{item.a}</p>
        </section>
      ))}
    </Shell>
  );
}
