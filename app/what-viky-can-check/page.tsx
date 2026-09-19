import type { Metadata } from "next";
import Link from "next/link";
import { catalogueSections, FRONTIERS, STATES, stateWords } from "@/src/conditions";
import { CATALOGUE as W, ME } from "@/src/sentences";
import { HELP, DISPLAY, TITLE } from "../components/ui";
import { Shell } from "../kit/Shell";

export const metadata: Metadata = { title: W.title };

/**
 * The public catalogue (design audit of 16 Sep 2026, section 5): every family, every condition, and its state in
 * words. Reachable from Home and from the judges page.
 *
 * It exists because the rule that the chooser offers only what is proved is right and says nothing about the rest. A
 * reader who wants to know what Viky is working on has nowhere to look, and a page that answered with a badge would
 * be inventing a scale. So a state is a sentence here, one of four, read from the register: a condition is Open on
 * this page exactly when the chooser offers it, and a line nobody has built says so in its own words.
 */
export default function Page() {
  return (
    <Shell kind="document" back="/">
      <header className="space-y-[var(--space-lg)]">
        <h1 className={DISPLAY}>{W.title}</h1>
        <p className={HELP}>{W.intro}</p>
      </header>

      {catalogueSections().map((section) => (
        <section key={section.family} className="space-y-[var(--space-md)]">
          <h2 className={TITLE}>{section.title}</h2>
          {section.conditions.map((condition) => {
            const state = stateWords(condition.state);
            return (
              <div key={condition.id} className="space-y-[var(--space-xs)] border-t border-[var(--divider)] pt-[var(--space-md)]">
                <h3 className="font-medium">{condition.name}</h3>
                <p className={HELP}>{condition.help}</p>
                {/* The state is a sentence, never a badge: a coloured pill would rank these four, and they are not a scale. */}
                <p className={HELP}>
                  <span className="font-medium text-[var(--text)]">{state.title}.</span> {condition.beforeItOpens ?? state.meaning}
                </p>
              </div>
            );
          })}
        </section>
      ))}

      <section className="space-y-[var(--space-md)]">
        <h2 className={TITLE}>{W.frontier}</h2>
        <p className={HELP}>{W.frontierIntro}</p>
        {FRONTIERS.map((frontier) => (
          <div key={frontier.id} className="space-y-[var(--space-xs)] border-t border-[var(--divider)] pt-[var(--space-md)]">
            <h3 className="font-medium">{frontier.name}</h3>
            <p className={HELP}>
              <span className="font-medium text-[var(--text)]">{stateWords(frontier.state).title}.</span> {frontier.why}
            </p>
          </div>
        ))}
      </section>

      {/* The four states, last: every line above already says its own state in full, so this is where a reader checks
          a word, not where they have to learn a vocabulary before reading anything. On a phone it also keeps the
          first condition on the first screen, which four definitions had pushed off it. */}
      <section className="space-y-[var(--space-sm)]">
        <h2 className={TITLE}>{W.states}</h2>
        <dl className="grid grid-cols-1 gap-x-[var(--space-md)] gap-y-[var(--space-xs)] text-[length:var(--type-help)] [@media(min-width:600px)]:grid-cols-[14rem_1fr]">
          {STATES.map((state) => (
            <div key={state.id} className="contents">
              <dt className="font-medium">{state.title}</dt>
              <dd className="text-[var(--muted)]">{state.meaning}</dd>
            </div>
          ))}
        </dl>
      </section>

      <p className={HELP}>
        {W.limits}{" "}
        <Link href="/judges" className="underline">
          {ME.judges}
        </Link>
        .
      </p>
    </Shell>
  );
}
