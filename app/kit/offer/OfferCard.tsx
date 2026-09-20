"use client";
import { useState, useSyncExternalStore } from "react";
import { useAccount } from "@/src/account/provider";
import { formatAusd } from "@/src/gift-reader";
import { draftUnits, durationBounds, isComplete, shapeOf, type GiftDraft } from "@/src/gift-draft";
import { conditionById } from "@/src/conditions";
import { cardDraft, startingCardDraft, subscribeToCardDraft, writeCardDraft } from "@/src/card-draft";
import { AmountError, dollarsToUnits, PILOT_CAP_SENTENCE } from "@/src/money";
import { OFFER as W } from "@/src/sentences";
import { CARD, CARD_AMOUNT, CARD_LABEL, CARD_TITLE, HELP, PRIMARY_BUTTON } from "../../components/ui";
import { CardFace } from "../GiftCard";
import { DayStrip } from "../DayStrip";
import { MilestoneMeter } from "../MilestoneMeter";
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
  /** Paying is a sheet over the card, and the card stays behind it (D114, the mockup pay.html). */
  const [paying, setPaying] = useState(false);
  /** The length, while somebody is typing one that is not on a chip. */
  const [typingDays, setTypingDays] = useState(false);

  const units = draftUnits(draft);
  const condition = conditionById(draft.conditionId);
  const shape = shapeOf(draft.conditionId);
  const bounds = durationBounds(draft.conditionId);
  const ready = isComplete(draft) && units !== undefined;
  const recipient = draft.recipientName.trim();
  const funder = draft.funderName.trim();
  const days = Number(draft.days);
  const quick = [bounds.min, bounds.suggested, bounds.max];
  const onAChip = quick.includes(days);

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
      <section className={`gift-card-width ${CARD} flex flex-col gap-0 space-y-0`} aria-labelledby="offer-card">
        <h2 id="offer-card" className="sr-only">
          {W.title}
        </h2>
        <CardFace
          /* Whose gift it is, as the image writes it. The funder's own name is asked for where they pay, because a
             field at the eyebrow's size is under the 16 pixels a phone zooms in on and under any thumb's target. */
          label={funder ? W.fromFunder(funder) : W.fromYou}
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
                className="on-paper-field on-paper-field-hugging min-h-[var(--tap-target)] min-w-[var(--tap-target)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-text)]"
              />
            </span>
          }
          /* A real choice, with families and a sentence under the one being considered: this one keeps its sheet. */
          under={
            <button
              type="button"
              onClick={() => setChoosing(true)}
              className="flex w-full items-center justify-between gap-[var(--space-md)] rounded-[var(--radius-control)] border-[length:var(--card-border-width)] border-[var(--surface-rule)] bg-[var(--paper-raised)] px-[var(--space-md)] py-[var(--space-sm)] text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-text)]"
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
            <div className="py-[var(--space-sm)]">
              {shape === "climb" || shape === "stamp" ? (
                <MilestoneMeter
                  status={{ startReading: null, target: Number(draft.target) || 0, todayReading: null, reached: false, cancelled: false, finished: false, opened: false }}
                />
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
                <span className={`${CARD_AMOUNT} on-paper-field on-paper-field-hugging inline-flex min-h-[var(--tap-target)] items-center`}>
                  {W.dollar}
                  <input
                    value={draft.dollars}
                    onChange={(event) => change({ ...draft, dollars: event.target.value })}
                    aria-label={W.slots.amount.label}
                    inputMode="decimal"
                    maxLength={9}
                    size={Math.max(4, draft.dollars.length + 1)}
                    autoComplete="off"
                    className="min-h-[var(--tap-target)] min-w-[var(--tap-target)] bg-transparent tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-text)]"
                  />
                </span>
              </span>
              {amountRefusal ? <span className={`block ${HELP} text-[var(--on-surface)]`}>{amountRefusal}</span> : null}

              {/* How long, on the card: the three the register offers, and one more that opens a field in its place.
                  The three stay where they are while the field is open, so a person can always come back to one. */}
              <span className="mt-[var(--space-sm)] flex flex-wrap items-center gap-[var(--tap-gap)]">
                {quick.map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => {
                      setTypingDays(false);
                      change({ ...draft, days: String(count) });
                    }}
                    aria-pressed={!typingDays && days === count}
                    className={`inline-flex min-h-[var(--tap-target)] items-center rounded-full border-[length:var(--control-border-width)] px-[var(--space-md)] text-[length:var(--type-help)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-text)] ${
                      !typingDays && days === count ? "border-[var(--control-border)] bg-[var(--chosen)] font-bold" : "border-[var(--surface-rule)] bg-[var(--paper-raised)]"
                    }`}
                  >
                    {W.someDays(count)}
                  </button>
                ))}
                {typingDays || !onAChip ? (
                  <label className={`${HELP} flex items-center gap-[var(--space-sm)]`}>
                    <input
                      value={draft.days}
                      onChange={(event) => change({ ...draft, days: event.target.value.replace(/[^0-9]/g, "") })}
                      aria-label={W.daysLabel}
                      inputMode="numeric"
                      maxLength={3}
                      size={4}
                      autoFocus={typingDays}
                      autoComplete="off"
                      className="on-paper-field min-h-[var(--tap-target)] min-w-[var(--tap-target)] text-[length:var(--type-body)] tabular-nums text-[var(--on-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-text)]"
                    />
                    <span>{W.daysUnit(bounds.min, bounds.max)}</span>
                  </label>
                ) : (
                  <button
                    type="button"
                    onClick={() => setTypingDays(true)}
                    className="inline-flex min-h-[var(--tap-target)] items-center rounded-full border-[length:var(--control-border-width)] border-[var(--surface-rule)] bg-[var(--paper-raised)] px-[var(--space-md)] text-[length:var(--type-help)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-text)]"
                  >
                    {W.otherLength}
                  </button>
                )}
              </span>

              {/* One action, in the sun, full width, saying what it will take from the first second. */}
              <button type="button" className={`${PRIMARY_BUTTON} mt-[var(--space-lg)]`} disabled={!ready} onClick={() => setPaying(true)}>
                {units !== undefined ? W.pay(formatAusd(units)) : W.stillNeeded}
              </button>
              <span className={`block ${HELP} text-center`}>{shape === "days" && units !== undefined && days > 0 ? W.eachDay(formatAusd(units / BigInt(days))) : PILOT_CAP_SENTENCE}</span>
            </>
          }
        />
      </section>

      {/* The one sheet the card opens, drawn once: a modal dialog is closed by the browser, which is what gives the
          page back, so taking an open one out of the page would leave its layer over everything. */}
      <WillSheet open={choosing} draft={draft} onChange={change} onClose={() => setChoosing(false)} />
      <PaySheet open={paying} draft={draft} onChange={change} onClose={() => setPaying(false)} />
    </>
  );
}
