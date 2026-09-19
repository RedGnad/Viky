"use client";
import { useState, useSyncExternalStore } from "react";
import { useAccount } from "@/src/account/provider";
import { formatAusd } from "@/src/gift-reader";
import { draftUnits, durationBounds, filledCases, isComplete, shapeOf, type CardCase, type GiftDraft } from "@/src/gift-draft";
import { conditionById } from "@/src/conditions";
import { cardDraft, emptyCardDraft, subscribeToCardDraft, writeCardDraft } from "@/src/card-draft";
import { OFFER as W } from "@/src/sentences";
import { CARD, CARD_AMOUNT, CARD_LABEL, CARD_TITLE, PRIMARY_BUTTON } from "../../components/ui";
import { CardFace } from "../GiftCard";
import { DayStrip } from "../DayStrip";
import { MilestoneMeter } from "../MilestoneMeter";
import { AmountSheet } from "./AmountSheet";
import { HowLongSheet } from "./HowLongSheet";
import { PaySheet } from "./PaySheet";
import { WhoSheet } from "./WhoSheet";
import { WillSheet } from "./WillSheet";

/**
 * The card a gift is filled in on, at the top of Home (the product vision of 19 Sep 2026, and the rendered mockups
 * of the same day, which are the specification for this screen).
 *
 * It is the gift's own card, empty: the paper, the label, the name, what they will do, the row of days, the amount
 * that is the one star of the screen, and one action in the sun. A case nobody has answered says the word that is
 * missing in its own place, in the faint ink of the paper, and pressing that line opens its sheet: "For  who?",
 * "what they will do", "$0.00", "for how long". Nothing is asked of a visitor until Pay.
 */
const GIFT_ID = "offer";

export function OfferCard() {
  const { address } = useAccount();
  /**
   * The card itself, read from the device rather than copied into this screen (src/card-draft.ts). The server draws
   * an empty card and the browser draws what was kept, and React is told how to go from one to the other.
   */
  const draft = useSyncExternalStore(subscribeToCardDraft, cardDraft, emptyCardDraft);
  const change = (next: GiftDraft) => writeCardDraft(next, address);
  const [open, setOpen] = useState<CardCase | null>(null);
  /** Paying is the fifth sheet: it opens over the card, and the card stays behind it (the mockup pay.html). */
  const [paying, setPaying] = useState(false);

  const filled = filledCases(draft);
  const units = draftUnits(draft);
  const condition = conditionById(draft.conditionId);
  const shape = shapeOf(draft.conditionId);
  const ready = isComplete(draft);
  const recipient = draft.recipientName.trim();
  const funder = draft.funderName.trim();
  const days = Number(draft.days);

  const faintLarge = "text-[var(--on-surface-faint)]";
  const faintSmall = "text-[var(--muted)]";

  /**
   * The amount, which is the one star of the screen. Nobody has given one: it is $0.00 in the faint ink, the way the
   * mockups draw it, and what it opens is said to whoever is read to rather than written on the card.
   */
  const amountLine = (
    <button
      type="button"
      onClick={() => setOpen("amount")}
      aria-label={`${units === undefined ? W.invites.amount : formatAusd(units)}. ${W.change(W.slots.amount.label)}`}
      className={`${CARD_AMOUNT} ${units === undefined ? "text-[var(--on-surface-faint)]" : ""} inline-flex min-h-[var(--tap-target)] max-w-full items-center text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-text)]`}
    >
      {formatAusd(units ?? 0n)}
    </button>
  );

  /** A line of the card, and the whole line opens its case. Empty, it is the word that is missing, in the faint ink. */
  const line = (slot: CardCase, said: string | null, voice: string, faint: string) => (
    <button
      type="button"
      onClick={() => setOpen(slot)}
      aria-label={`${said ?? W.invites[slot]}. ${W.change(W.slots[slot].label)}`}
      className={`${voice} ${said === null ? faint : ""} inline-flex min-h-[var(--tap-target)] max-w-full items-center break-words text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-text)]`}
    >
      {said ?? W.invites[slot]}
    </button>
  );

  return (
    <>
      <section className={`${CARD} flex flex-col gap-0 space-y-0`} aria-labelledby="offer-card">
        <h2 id="offer-card" className="sr-only">
          {W.title}
        </h2>
        <CardFace
          label={funder ? W.fromFunder(funder) : W.yourGift}
          /* The name. Empty, it is "For  who?", and the question is in the place the name will take. */
          title={
            filled.for ? (
              line("for", W.forName(recipient), CARD_TITLE, faintLarge)
            ) : (
              <button
                type="button"
                onClick={() => setOpen("for")}
                aria-label={`${W.invites.for} ${W.change(W.slots.for.label)}`}
                className={`${CARD_TITLE} ${faintLarge} inline-flex min-h-[var(--tap-target)] items-center gap-[var(--space-sm)] text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-text)]`}
              >
                {W.forNobody}
                <span className="underline decoration-dotted underline-offset-[6px]">{W.who}</span>
              </button>
            )
          }
          under={line("will", condition ? condition.name : null, "text-[length:var(--type-body)]", faintSmall)}
          /* The shape of the gift, drawn by the product's own pieces, and said in words while there is none. */
          shape={
            <div className="py-[var(--space-sm)]">
              {shape === undefined ? (
                <p className={`text-[length:var(--type-help)] ${faintSmall}`}>{W.daysAppear}</p>
              ) : shape === "days" ? (
                <DayStrip
                  id={GIFT_ID}
                  gift={{
                    startDay: 0,
                    endDay: 0,
                    durationDays: filled.howLong ? days : durationBounds(draft.conditionId).suggested,
                    creditedDays: 0,
                    missedDays: 0,
                  }}
                  catchUpSeconds={0}
                />
              ) : (
                <MilestoneMeter
                  status={{
                    startReading: null,
                    target: Number(draft.target) || 0,
                    todayReading: null,
                    reached: false,
                    cancelled: false,
                    finished: false,
                    opened: false,
                  }}
                />
              )}
            </div>
          }
          bottom={
            <>
              {/* The one star of the screen, and under it how long it runs. */}
              <span className="money-display-box block">{amountLine}</span>
              <span className="block">{line("howLong", filled.howLong ? W.forHowLong(days) : null, CARD_LABEL, faintSmall)}</span>
              {/* One action, in the sun, full width. Until the four are filled it is the same button, shut. */}
              <button
                type="button"
                className={`${PRIMARY_BUTTON} mt-[var(--space-md)]`}
                disabled={!ready || units === undefined}
                onClick={() => setPaying(true)}
              >
                {ready && units !== undefined ? W.pay(formatAusd(units)) : W.stillNeeded}
              </button>
            </>
          }
        />
      </section>

      {/* The four sheets are drawn once and opened by name. A modal dialog is closed by the browser, which is what
          gives the page back: taking an open one out of the page would leave its layer over everything. */}
      <WhoSheet open={open === "for"} draft={draft} onChange={change} onClose={() => setOpen(null)} />
      <WillSheet open={open === "will"} draft={draft} onChange={change} onClose={() => setOpen(null)} />
      <AmountSheet open={open === "amount"} draft={draft} onChange={change} onClose={() => setOpen(null)} />
      <HowLongSheet open={open === "howLong"} draft={draft} onChange={change} onClose={() => setOpen(null)} />
      <PaySheet open={paying} draft={draft} onClose={() => setPaying(false)} />
    </>
  );
}
