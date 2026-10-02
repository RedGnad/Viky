import { BODY, HELP, SAY } from "../components/ui";

/**
 * Something is happening and it takes a few seconds: the only loop in the product (the founder's instruction of
 * 19 Sep 2026).
 *
 * The art direction says nothing loops, because every movement answers a gesture. Making a gift breaks that rule by
 * itself: the route waits for the chain to settle, up to thirty seconds, and for all that time the screen carried one
 * still sentence. Nielsen 1993 sets ten seconds as the limit of attention, and NN/g 2014 is blunt about what a still
 * screen means to somebody: "Without any visual change from the system, most users will assume the action was not
 * registered." So this loops, from the first second, and nothing else does.
 *
 * It says the same thing three ways: the ring turns, the sentence says what is being done, and the line under it says
 * how long and what happens if the page goes. A device asking for reduced motion keeps the two sentences and stops the
 * ring, which is what that setting asks for.
 */
export function Working({ says, and, then, large = false }: Readonly<{ says: string; and?: string; /** A second line under the first: what happens if the page goes. */ then?: string; large?: boolean }>) {
  // While a gift is being made the whole screen is this (the mockup paying.html): the ring above, what is being
  // done in the title face under it, and how long it takes under that. Everywhere else it is a line.
  if (large) {
    return (
      <div className="flex flex-col items-center gap-[var(--space-lg)] py-[var(--space-xxl)] text-center" role="status" aria-live="polite">
        <span className="working-ring working-ring-large" aria-hidden="true" />
        <p className={`${SAY} max-w-[280px]`}>{says}</p>
        {and ? <p className={`${HELP} max-w-[300px]`}>{and}</p> : null}
        {then ? <p className={`${HELP} max-w-[300px]`}>{then}</p> : null}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-[var(--space-sm)]" role="status" aria-live="polite">
      <div className="flex items-center gap-[var(--space-md)]">
        <span className="working-ring" aria-hidden="true" />
        <p className={BODY}>{says}</p>
      </div>
      {and ? <p className={HELP}>{and}</p> : null}
      {then ? <p className={HELP}>{then}</p> : null}
    </div>
  );
}
