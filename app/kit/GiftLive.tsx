import type { ReactNode } from "react";
import type { Live } from "@/src/gift-live";
import { GIFT_LIVE as L } from "@/src/sentences";
import { CARD, CARD_AMOUNT, CARD_LABEL, CARD_TITLE } from "../components/ui";

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
 * - what was agreed and how it is checked, folded, each under its own name.
 *
 * Nothing stands under the card but the round controls of the person it is for (app/kit/YouDecide.tsx, rule 6).
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
  action,
  agreed,
  checked,
}: Readonly<{
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
  /** The month's limit of readings is reached: the short sentence that says so, in the red (src/sentences.ts, LIMIT). */
  limit?: string | null;
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
      <section className={`gift-card-width gift-card-placed ${CARD} flex flex-col gap-0 space-y-0`}>
        <p className={`${CARD_LABEL} gift-eyebrow`}>{from}</p>
        <h2 className={`${CARD_TITLE} gift-who`}>{who}</h2>
        <p className="gift-what">{what}</p>
        {nature}

        {shape ? <div className="gift-shape">{shape}</div> : null}

        {live.when ? <p className={`${CARD_LABEL} gift-when`}>{live.when}</p> : null}
        <p className="gift-state">{live.headline}</p>
        {closed?.map((line) => (
          <p key={line} className="gift-state-closed">
            {line}
          </p>
        ))}
        {/* A monthly limit is reached: said here, where the next reading would have been announced. */}
        {limit ? (
          <p className="limit-said" role="status" data-reading-limit>
            {limit}
          </p>
        ) : null}
        {live.next ? <p className="gift-next">{live.next}</p> : null}

        {live.figure ? (
          <div className="gift-figures">
            <div>
              <p className={CARD_AMOUNT}>{figureNode ?? live.figure.value}</p>
              <p className={`${CARD_LABEL} gift-meta`}>{live.figure.label}</p>
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
