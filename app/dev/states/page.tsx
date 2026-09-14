import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { operatorCanSeeDevPages } from "@/src/dev-access";
import { everyState, JOURNEYS } from "@/src/state-catalogue";
import { CARD } from "../../components/ui";

export const metadata: Metadata = {
  title: "Every state (dev)",
};

/**
 * Every state of both journeys on one page, for the design pass.
 *
 * It changes nothing about the product: it reads `src/state-catalogue.ts`, which quotes the screens word for
 * word and is held to that by a test. What it adds is the one thing no screen can show, which is all the
 * others at once, including the states where nothing has been written yet. Those are marked rather than
 * hidden, because they are what a design pass is for.
 *
 * Served only to the operator's signed-in browser (src/dev-access.ts), and labelled as example data.
 */
export default async function Page() {
  if (!(await operatorCanSeeDevPages())) notFound();

  const states = everyState();
  const written = states.filter((s) => s.state.says.length > 0).length;

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-8">
      <header className="space-y-2">
        <p className="inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900 dark:bg-amber-900 dark:text-amber-100">
          Example data. Nothing here is anybody&apos;s gift, and no amount here is real.
        </p>
        <h1 className="text-2xl font-semibold">Every state, both journeys</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {states.length} states in all. {written} have words today; {states.length - written} do not, and each of those
          says what is missing. Every sentence below is quoted from the screen that shows it, and a test fails if one
          of them stops being true.
        </p>
      </header>

      {JOURNEYS.map(({ who, screens }) => (
        <section key={who} className="space-y-5">
          <h2 className="border-b border-gray-200 pb-2 text-lg font-semibold dark:border-gray-800">{who}</h2>
          {screens.map((screen) => (
            <div key={`${who}-${screen.screen}`} className="space-y-3">
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">{screen.screen}</h3>
              {screen.states.map((state) => (
                <article key={`${screen.screen}-${state.name}`} className={CARD}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{state.name}</span>
                    {state.says.length === 0 ? (
                      <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs dark:bg-gray-800">no words yet</span>
                    ) : null}
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">When: {state.when}</p>
                  {state.says.length > 0 ? (
                    <ul className="space-y-1 border-l-2 border-gray-200 pl-3 dark:border-gray-800">
                      {state.says.map((sentence) => (
                        <li key={sentence} className="text-sm">
                          {sentence}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {state.gap ? <p className="text-sm text-amber-700 dark:text-amber-300">Gap: {state.gap}</p> : null}
                </article>
              ))}
            </div>
          ))}
        </section>
      ))}
    </main>
  );
}
