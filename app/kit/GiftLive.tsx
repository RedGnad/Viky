import type { ReactNode, Ref } from "react";
import type { Live } from "@/src/gift-live";
import { GIFT_LIVE as L, LIMIT } from "@/src/sentences";
import { CARD, CARD_AMOUNT, CARD_LABEL, CARD_TITLE } from "../components/ui";
import { Lines } from "./Lines";

/**
 * A gift's page, drawn from the founder's mockup of 19 Sep 2026 (`gift.html`): the card of cream paper on the ink
 * ground, with its shadow, and inside it, in this order and no other.
 *
 * - who it came from, small and spaced, in capitals;
 * - who it is for, large, in the title face;
 * - what they do, from the register;
 * - the gift's own drawing, the row of days, the climb or the character alone;
 * - the state in one sentence, in the title face: the answer to this moment's question;
 * - the next moment, dated, under it;
 * - the money that counts now, large on the left, and on the right, quieter, what has gone back to the funder, or
 *   the hour of the next reading while nothing has (the mockup you-decide.html of 1 Oct 2026): each a figure over
 *   its label, and never a sentence in small capitals (rule 5);
 * - one action in the sun colour, or none;
 * - what was agreed and how it is checked, folded, each under its own name; and before them, while a month's reserve
 *   is used up, what the person can do.
 *
 * Nothing stands under the card but the round controls of the person it is for (app/kit/YouDecide.tsx, rule 6).
 *
 * The state, the line under it and the label of the money are named `data-turns="words"`, and the money itself
 * `data-turns="amount"`: when the gift's character lands on a gift just reached, those words change where they stand
 * and the amount swells once (app/kit/Motion.tsx, `Lands`; the founder's mockup of 10 Oct 2026).
 *
 * The values are the mockup's own, taken from its `shared.css` rather than read off the picture: the sizes, the
 * spacing, the radius and the shadow are all tokens now, and `test/design-tokens.test.ts` holds them equal to it.
 *
 * What this component does not decide: which moment the gift is in (`src/gift-moment.ts`), what the sentences are
 * (`src/gift-live.ts`), and what an action does (the page).
 */
export function GiftLive({
  from,
  who,
  what,
  nature,
  shape,
  live,
  figureNode,
  closed,
  reading,
  limit = null,
  waiting = null,
  looking = false,
  action,
  agreed,
  checked,
  card,
}: Readonly<{
  /** The card itself, for the page that plays a landing on its lines (app/kit/Motion.tsx, `useLanding`). */
  card?: Ref<HTMLElement>;
  /** "A gift from Mum": the small line above the name, which names the other person of the two. */
  from: string;
  /** "For Noah", or "For you" for the person it is for: the card's own title. */
  who: string;
  /** What they do, from the register, never written by a screen. */
  what: string;
  /** The condition's nature, said under it in the meta voice (app/kit/Nature.tsx, D162), as the card on Home says it. */
  nature?: ReactNode;
  /** The gift's own drawing, alive: the row of days, the climb, or the character alone. */
  shape: ReactNode;
  live: Live;
  /** The figure as it arrives: counting from what this device last saw of it, or the value itself. */
  figureNode?: ReactNode;
  /** What the source itself did to the account, or why a first reading started nothing: the state, said under the state, a line each. */
  closed?: readonly string[] | null;
  /** When the source last updated what was read as the page opened, quietly under the figure, or nothing. */
  reading?: ReactNode;
  /**
   * A month's reserve is used up (src/sentences.ts, LIMIT): the one sentence said in the open, in the quiet colour of the labels, and what
   * the person can do, a line each, folded under its own name with the card's other folds.
   */
  limit?: Readonly<{ said: string; can: ReadonlyArray<readonly [label: string, value: string]> }> | null;
  /**
   * A reading that started by itself is under way (a gift read as its page opens): the wheel and the step, under the
   * state, where the next moment would have been said. Nothing was pressed, so no button carries it.
   */
  waiting?: string | null;
  /**
   * The look taken as the page came to the front is still under way after a second: the wheel beside the state, and
   * no word. Its place after the state's last word has no width, so it can take no room on the line: nothing on the
   * card moves when it comes or goes, however full that line is.
   */
  looking?: boolean;
  /** The one action of this moment, or nothing. Never two of the same weight. */
  action?: ReactNode;
  /** What was agreed, folded under its name, and open at the one moment a person is discovering it. */
  agreed: Readonly<{ open: boolean; children: ReactNode }>;
  /** How this is checked: the source, who polices it, what the proof proves and the proof a person may take away. */
  checked?: ReactNode;
}>) {
  /** The right column: what has gone back, or the hour of the next reading while nothing has. */
  const second = live.back ?? live.nextAt ?? null;
  return (
    <>
      {/* The card of Home, the same object and the same frame (V4): its edge, its width, its paper. */}
      <section ref={card} className={`gift-card-width gift-card-placed ${CARD} flex flex-col gap-0 space-y-0`}>
        <p className={`${CARD_LABEL} gift-eyebrow`}>{from}</p>
        <h2 className={`${CARD_TITLE} gift-who`}>{who}</h2>
        <p className="gift-what">{what}</p>
        {nature}

        {shape ? <div className="gift-shape">{shape}</div> : null}

        {live.when ? <p className={`${CARD_LABEL} gift-when`}>{live.when}</p> : null}
        <p className="gift-state" data-turns="words">
          {live.headline}
          {looking && !waiting ? (
            <span className="gift-state-wheel-place">
              <span className="working-ring working-ring-inline gift-state-wheel" role="status" aria-label={L.asItGoes.looking} data-looking="" />
            </span>
          ) : null}
        </p>
        {closed?.map((line) => (
          <p key={line} className="gift-state-closed">
            {line}
          </p>
        ))}
        {/* A month's reserve is used up: said here, where the next reading would have been announced. */}
        {limit ? (
          <p className="limit-said" role="status" data-limit-said>
            {limit.said}
          </p>
        ) : null}
        {waiting ? (
          <p className="gift-next inline-flex items-center gap-[var(--space-sm)]" role="status" data-waiting="" data-turns="words">
            <span className="working-ring working-ring-inline" aria-hidden="true" />
            <span>{waiting}</span>
          </p>
        ) : live.next ? (
          <p className="gift-next" data-turns="words">{live.next}</p>
        ) : null}

        {live.figure ? (
          <div className="gift-figures">
            <div>
              <p className={CARD_AMOUNT} data-turns="amount">{figureNode ?? live.figure.value}</p>
              <p className={`${CARD_LABEL} gift-meta`} data-turns="words">{live.figure.label}</p>
              {reading ? <p className="gift-updated">{reading}</p> : null}
            </div>
            {second ? (
              <div className="text-right">
                <p className="gift-back">{second.value}</p>
                <p className={`${CARD_LABEL} gift-meta`}>{second.label}</p>
              </div>
            ) : null}
          </div>
        ) : null}

        {action ? <div className="gift-action">{action}</div> : null}

        {/* What the person can do while the reserve is empty: the first fold, since it is what they came to ask. */}
        {limit && limit.can.length > 0 ? (
          <details className="gift-fold" data-limit-can>
            <summary className="gift-fold-name">
              {LIMIT.can}
              <FoldChevron />
            </summary>
            <div className="gift-fold-body">
              <Lines quiet rows={limit.can} />
            </div>
          </details>
        ) : null}

        <details className="gift-fold" open={agreed.open}>
          <summary className="gift-fold-name">
            {L.agreed}
            <FoldChevron />
          </summary>
          <div className="gift-fold-body">{agreed.children}</div>
        </details>

        {checked ? (
          <details className="gift-fold">
            <summary className="gift-fold-name">
              {L.checked}
              <FoldChevron />
            </summary>
            <div className="gift-fold-body">{checked}</div>
          </details>
        ) : null}
      </section>
    </>
  );
}

/** The mark of a fold, on the right of its name, turned once it is open (the mockup's own chevron). */
export function FoldChevron() {
  return (
    <svg aria-hidden focusable="false" width="14" height="14" viewBox="0 0 14 14" className="gift-chevron shrink-0">
      <path d="M3 5.5 L7 9.5 L11 5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
