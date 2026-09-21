"use client";
import { useState, useSyncExternalStore } from "react";
import { useAccount } from "@/src/account/provider";
import { useDisplayCurrency } from "@/src/client/display-currency";
import { formatAusd } from "@/src/gift-reader";
import { draftUnits, durationBounds, filledCases, isComplete, shapeOf, type GiftDraft } from "@/src/gift-draft";
import { conditionById } from "@/src/conditions";
import { cardDraft, startingCardDraft, subscribeToCardDraft, writeCardDraft } from "@/src/card-draft";
import { AmountError, dollarsToUnits } from "@/src/money";
import { OFFER as W } from "@/src/sentences";
import { CARD, CARD_AMOUNT, CARD_LABEL, CARD_TITLE, CHIP, HELP, INLINE_BUTTON, PRIMARY_BUTTON } from "../../components/ui";
import { CardFace } from "../GiftCard";
import { Character } from "../Character";
import { DayStrip } from "../DayStrip";
import { PaySheet } from "./PaySheet";
import { WillSheet } from "./WillSheet";

/**
 * The card a gift is filled in on, at the top of Home (the product vision of 19 Sep 2026, and the rendered mockups,
 * which are the specification for this screen).
 *
 * Two things the founder settled on 20 Sep 2026, on desktop.html:
 *
 * 1. **A field is edited where it stands.** Opening a page to type a first name or an amount is not ergonomics, it
 *    is a journey wearing a card's clothes, and it is worse still on a keyboard. The name, the amount and the
 *    length are typed on the card, in their own places. What keeps a sheet is what is genuinely a choice: the
 *    condition, with its families and a sentence under each, and then that condition's own questions.
 * 2. **The card is never empty.** A visitor arrives on a plausible gift rather than on four holes: the daily
 *    condition the register starts on, thirty dollars, thirty days (`STARTING_DRAFT`, which is where the choice of
 *    source belongs and not here). The one empty field is the first name, because it is the one thing Viky cannot
 *    guess, and it is the field that carries the cursor. The action says what it will take from the first second,
 *    and the passkey is still the only door: nothing is taken without it.
 */
const GIFT_ID = "offer";

export function OfferCard() {
  const { address } = useAccount();
  /**
   * The card itself, read from the device rather than copied into this screen (src/card-draft.ts). The server draws
   * the starting card and the browser draws what was kept, and React is told how to go from one to the other.
   */
  const draft = useSyncExternalStore(subscribeToCardDraft, cardDraft, startingCardDraft);
  const change = (next: GiftDraft) => writeCardDraft(next, address);
  /** The one sheet left on this card, and its two faces: the catalogue, then the condition's own questions. */
  const [choosing, setChoosing] = useState(false);
  /** Which face the sheet opens on: the catalogue from the condition line, that condition's questions from the
      detail line under it (D136). */
  const [sheetAt, setSheetAt] = useState<"list" | "questions">("list");
  /** Paying is a sheet over the card, and the card stays behind it (D114, the mockup pay.html). */
  const [paying, setPaying] = useState(false);
  /** The length, while somebody is typing one that is not on a chip. */

  const units = draftUnits(draft);
  const condition = conditionById(draft.conditionId);
  const shape = shapeOf(draft.conditionId);
  const bounds = durationBounds(draft.conditionId);
  // What the figure is worth in the currency this account reads in (decision 1 of 17 Sep 2026). The gift itself is
  // signed in dollars, which is what the card takes; the conversion is said under it, with its rate's own day, and
  // nothing at all is said when the account reads in dollars or when no rate answered (D139).
  const money = useDisplayCurrency(address);
  const filled = filledCases(draft);
  const ready = isComplete(draft) && units !== undefined;
  const recipient = draft.recipientName.trim();
  const days = Number(draft.days);
  const quick = [bounds.min, bounds.suggested, bounds.max];

  /** What the amount says back when it cannot be read as money: the same rule the route refuses by. */
  let amountRefusal: string | undefined;
  if (draft.dollars.trim().length > 0) {
    try {
      dollarsToUnits(draft.dollars);
    } catch (error) {
      amountRefusal = error instanceof AmountError ? error.message : undefined;
    }
  }

  return (
    <>
      <section className={`gift-card-width gift-card-placed ${CARD} flex flex-col gap-0 space-y-0`} aria-labelledby="offer-card">
        <h2 id="offer-card" className="sr-only">
          {W.title}
        </h2>
        <CardFace
          /* No line saying whose gift it is (D138). On the card a funder is filling in, "A gift from you" tells them
             what they already know and what the page above says; the same line matters on a gift's own page, where
             the reader is somebody else, and it stays there. Material's card anatomy makes the overline optional,
             and NN/g's rule for a label is that it carries something the rest of the card does not. */
          /* The name, typed in the line that carries it. It is the only empty thing on the card, and it has the cursor. */
          title={
            <span className={CARD_TITLE}>
              {W.forNobody}{" "}
              <input
                value={draft.recipientName}
                onChange={(event) => change({ ...draft, recipientName: event.target.value })}
                aria-label={W.slots.for.label}
                placeholder={W.who}
                maxLength={40}
                size={Math.max(5, recipient.length + 1)}
                autoComplete="off"
                autoFocus={recipient.length === 0}
                className="on-paper-field min-h-[var(--tap-target)] min-w-[var(--tap-target)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-text)]"
              />
            </span>
          }
          /* A real choice, with families and a sentence under the one being considered: this one keeps its sheet. */
          under={
            <button
              type="button"
              /* One line, and it opens where the funder is: the catalogue while nothing is chosen, and from then on
                 that condition's own questions, whose first control is the way back to the catalogue (D137). It says
                 the label and the condition's name and nothing else (D138): what that condition has been told lives
                 in the step the line opens, which is where somebody goes to change it. */
              onClick={() => {
                setSheetAt(condition ? "questions" : "list");
                setChoosing(true);
              }}
              /* Eight pixels more than a caption gets under a title: this one is a control, and at four it sat on
                 the name's own box (the founder, 21 Sep 2026). */
              className={`${INLINE_BUTTON} mt-[var(--space-sm)] w-full justify-between text-left`}
            >
              <span className="flex min-w-0 flex-col">
                <span className={CARD_LABEL}>{W.invites.will}</span>
                <span className="break-words">{condition ? condition.name : W.invites.will}</span>
              </span>
              <svg aria-hidden focusable="false" width="20" height="20" viewBox="0 0 24 24" className="shrink-0 text-[var(--on-surface-muted)]">
                <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          }
          /* The shape of the gift, drawn by the product's own pieces: one mark a day, and the row scrolls. */
          shape={
            <div className="py-[var(--space-xs)]">
              {shape === "climb" || shape === "stamp" ? (
                /* One character and nothing else (D132). The meter's bar belongs to a gift that has been read: on a
                   card being filled in there is no reading, so the bar was always empty and said nothing at all,
                   which is what the founder saw as a strange horizontal line. */
                /* One character and no row: it stands in the middle of the card rather than at its left margin,
                   where a single shape read as a row that had lost the rest of itself (the founder, 21 Sep 2026). */
                <span className="flex justify-center">
                  <Character state="toCome" className="h-auto w-[60px]" standing={false} />
                </span>
              ) : (
                <div className="day-row-frame">
                  <DayStrip
                    id={GIFT_ID}
                    gift={{ startDay: 0, endDay: 0, durationDays: Number.isInteger(days) && days > 0 ? days : bounds.suggested, creditedDays: 0, missedDays: 0 }}
                    catchUpSeconds={0}
                  />
                  <span aria-hidden className="day-row-fade" />
                </div>
              )}
            </div>
          }
          bottom={
            <>
              {/* The one star of the screen, typed where it stands. */}
              <span className="block">
                {/* One box and one ring around the "$" and the figure together: the ring is the box's, drawn when the
                    figure inside has the focus, so the field never reads as a box inside a box (the founder,
                    20 Sep 2026, on the amount after the name was fixed). */}
                <span className={`${CARD_AMOUNT} on-paper-field inline-flex min-h-[var(--tap-target)] items-center focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--accent-text)]`}>
                  {W.dollar}
                  <input
                    value={draft.dollars}
                    onChange={(event) => change({ ...draft, dollars: event.target.value })}
                    aria-label={W.slots.amount.label}
                    inputMode="decimal"
                    maxLength={9}
                    size={Math.max(4, draft.dollars.length + 1)}
                    autoComplete="off"
                    className="min-h-[var(--tap-target)] min-w-[var(--tap-target)] bg-transparent tabular-nums outline-none"
                  />
                </span>
              </span>
              {amountRefusal ? <span className={`block ${HELP} text-[var(--on-surface)]`}>{amountRefusal}</span> : null}
              {!amountRefusal && units !== undefined && money.about(units) ? (
                <span className={`block ${HELP}`}>{`${money.about(units)![0].toUpperCase()}${money.about(units)!.slice(1)}.`}</span>
              ) : null}

              {/* How long, on the card: the three lengths the register gives this condition, and no fourth (D130).
                  The chip that opened a field for any other number is gone: the founder asked for it on both sizes,
                  and a length outside the three is a length the register was never asked about. */}
              <span className="mt-[var(--space-sm)] flex flex-wrap items-center gap-[var(--tap-gap)]">
                {quick.map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => change({ ...draft, days: String(count) })}
                    /* Pressed by its value alone, so what is kept from an older visit and the chip never disagree. */
                    aria-pressed={days === count}
                    className={`${CHIP} ${days === count ? "bg-[var(--chosen)] font-bold" : ""}`}
                  >
                    {W.someDays(count)}
                  </button>
                ))}
              </span>

              {/* One action, in the sun, full width, saying what it will take from the first second; shut, it says what it
                  is waiting for rather than its price (ui review, 20 Sep 2026: a muted "Pay $30.00" with no reason). */}
              <button type="button" className={`${PRIMARY_BUTTON} mt-[var(--space-lg)]`} disabled={!ready} onClick={() => setPaying(true)}>
                {!filled.will ? W.finishWill : !filled.howLong ? W.chooseLength : units === undefined ? W.stillNeeded : W.pay(formatAusd(units))}
              </button>
              {/* What one day of it is worth, and nothing when there is no such figure. The pilot's ceiling is not a
                  standing notice any more (D138): it is what the amount says back to somebody who types past it,
                  under the amount itself, where a refusal belongs. */}
              {shape === "days" && units !== undefined && days > 0 ? (
                <span className={`block ${HELP} text-center`}>{W.eachDay(formatAusd(units / BigInt(days)))}</span>
              ) : null}
            </>
          }
        />
      </section>

      {/* The one sheet the card opens, drawn once: a modal dialog is closed by the browser, which is what gives the
          page back, so taking an open one out of the page would leave its layer over everything. */}
      <WillSheet at={sheetAt} open={choosing} draft={draft} onChange={change} onClose={() => setChoosing(false)} />
      <PaySheet open={paying} draft={draft} onChange={change} onClose={() => setPaying(false)} />
    </>
  );
}
