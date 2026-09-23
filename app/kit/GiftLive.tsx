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
 * - the gift's own drawing, the row of days, the climb or the stamp;
 * - the state in one sentence, in the title face: the answer to this moment's question;
 * - the next moment, dated, under it;
 * - the money that counts now, large on the left, and what has gone back to the funder on the right, quieter;
 * - one action in the sun colour, or none;
 * - what was agreed and how it is checked, folded, each under its own name.
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
  action,
  agreed,
  checked,
  beside,
}: Readonly<{
  /** "A gift from Mum": the small line above the name, which names the other person of the two. */
  from: string;
  /** "For Noah", or "For you" for the person it is for: the card's own title. */
  who: string;
  /** What they do, from the register, never written by a screen. */
  what: string;
  /** The condition's nature, said under it in the meta voice (app/kit/Nature.tsx, D162), as the card on Home says it. */
  nature?: ReactNode;
  /** The gift's own drawing, alive: the row of days, the climb, or the stamp. */
  shape: ReactNode;
  live: Live;
  /** The figure as it arrives: counting from what this device last saw of it, or the value itself. */
  figureNode?: ReactNode;
  /** What the source itself did to the account, when it closed it: the state, said under the state. */
  closed?: string | null;
  /** The one action of this moment, or nothing. Never two of the same weight. */
  action?: ReactNode;
  /** What was agreed, folded under its name, and open at the one moment a person is discovering it. */
  agreed: Readonly<{ open: boolean; children: ReactNode }>;
  /** How this is checked: the source, who polices it, what the proof proves. */
  checked?: ReactNode;
  /** What stands outside the card, under it, in the ground's own voice: the proof a person may take away. */
  beside?: ReactNode;
}>) {
  return (
    <>
      {/* The card of Home, the same object and the same frame (V4): its edge, its width, its paper. */}
      <section className={`gift-card-width gift-card-placed ${CARD} flex flex-col gap-0 space-y-0`}>
        <p className={`${CARD_LABEL} gift-eyebrow`}>{from}</p>
        <h2 className={`${CARD_TITLE} gift-who`}>{who}</h2>
        <p className="gift-what">{what}</p>
        {nature}

        {shape ? <div className="gift-shape">{shape}</div> : null}

        <p className="gift-state">{live.headline}</p>
        {closed ? <p className="gift-state-closed">{closed}</p> : null}
        {live.next ? <p className="gift-next">{live.next}</p> : null}

        {live.figure ? (
          <div className="gift-figures">
            <div>
              <p className={CARD_AMOUNT}>{figureNode ?? live.figure.value}</p>
              <p className={`${CARD_LABEL} gift-meta`}>{live.figure.label}</p>
            </div>
            {live.back ? (
              <div className="text-right">
                <p className={`${CARD_LABEL} gift-meta`}>{live.back.label}</p>
                <p className="gift-back">{live.back.value}</p>
              </div>
            ) : null}
          </div>
        ) : null}

        {action ? <div className="gift-action">{action}</div> : null}

        <details className="gift-fold" open={agreed.open}>
          <summary className="gift-fold-name">
            {L.agreed}
            <Chevron />
          </summary>
          <div className="gift-fold-body">{agreed.children}</div>
        </details>

        {checked ? (
          <details className="gift-fold">
            <summary className="gift-fold-name">
              {L.checked}
              <Chevron />
            </summary>
            <div className="gift-fold-body">{checked}</div>
          </details>
        ) : null}
      </section>
      {beside ? <div className="gift-beside">{beside}</div> : null}
    </>
  );
}

/** The mark of a fold, on the right of its name, turned once it is open (the mockup's own chevron). */
function Chevron() {
  return (
    <svg aria-hidden focusable="false" width="14" height="14" viewBox="0 0 14 14" className="gift-chevron shrink-0">
      <path d="M3 5.5 L7 9.5 L11 5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
