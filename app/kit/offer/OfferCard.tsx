"use client";
import { useCallback, useState, useSyncExternalStore } from "react";
import { useAccount } from "@/src/account/provider";
import { useMoneyStart } from "@/src/client/money-start";
import { useDisplayCurrency } from "@/src/client/display-currency";
import { formatAusd } from "@/src/gift-reader";
import { draftUnits, durationBounds, filledCases, isComplete, shapeOf, type GiftDraft } from "@/src/gift-draft";
import { conditionById } from "@/src/conditions";
import { cardDraft, startingCardDraft, subscribeToCardDraft, writeCardDraft } from "@/src/card-draft";
import { figureWithMark, typedFromUnits, unitsFromTyped } from "@/src/amount-in-currency";
import { figureIn } from "@/src/currencies";
import { startingFigure } from "@/src/starting-amount";
import { dollarsHeld, type Holdings } from "../money";
import { AmountError } from "@/src/money";
import { OFFER as W } from "@/src/sentences";
import { CARD, CARD_AMOUNT, CARD_LABEL, CARD_TITLE, CHIP, HELP, INLINE_BUTTON, PRIMARY_BUTTON } from "../../components/ui";
import { feel } from "../mood";
import { useHasPointer } from "../Motion";
import { CardFace } from "../GiftCard";
import { Character } from "../Character";
import { CurrencySheet } from "../CurrencySheet";
import { MoneyKey } from "../MoneyKey";
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

export function OfferCard({ holdings }: Readonly<{ holdings?: Holdings | null }> = {}) {
  const { address } = useAccount();
  /**
   * The card itself, read from the device rather than copied into this screen (src/card-draft.ts). The server draws
   * the card the cookie describes (D160) and this browser hydrates against that one, so a card kept from an earlier
   * visit is printed once rather than replacing a starting card a moment after the page appears.
   */
  const start = useMoneyStart();
  const asTheServerDrew = useCallback(() => start.card ?? startingCardDraft(), [start.card]);
  const kept = useSyncExternalStore(subscribeToCardDraft, cardDraft, asTheServerDrew);
  const money = useDisplayCurrency(address);
  /**
   * What the card starts on when nothing was kept on this device (D157): the account's own money when it holds any,
   * else thirty dollars said round in the reader's currency. It is written into the draft the card works from, so
   * what is shown is what is sent, and it reaches the device the first time anything on the card is changed.
   */
  const untouched = kept.typedAmount === undefined;
  const starting = untouched ? startingFigure(money.currency, money.rates, holdings ? dollarsHeld(holdings) : undefined) : undefined;
  const draft = starting ? { ...kept, dollars: starting.dollars } : kept;
  const change = (next: GiftDraft) => writeCardDraft(next, address);
  /**
   * The one sheet left on this card: shut, or open on one of its two faces, the catalogue or the chosen condition's
   * own questions (D136). One value and not two (D150): whether it is open and which face it opens on have to reach
   * the sheet in the same render, and as two states they did not always.
   */
  const [choosing, setChoosing] = useState<"list" | "questions" | null>(null);
  /** Paying is a sheet over the card, and the card stays behind it (D114, the mockup pay.html). */
  const [paying, setPaying] = useState(false);
  /** The length, while somebody is typing one that is not on a chip. */

  const units = draftUnits(draft);
  const condition = conditionById(draft.conditionId);
  const shape = shapeOf(draft.conditionId);
  const bounds = durationBounds(draft.conditionId);
  const filled = filledCases(draft);
  const ready = isComplete(draft) && units !== undefined;
  const recipient = draft.recipientName.trim();
  const days = Number(draft.days);
  /**
   * What the person typed, in their own currency, and the dollars it makes, which is what the draft carries and what
   * is signed (D143). The typed text is held here rather than derived on every render: turning euros into dollars and
   * back would rewrite "30" as "29.99" under the cursor.
   */
  const [typedAmount, setTypedAmount] = useState<string | null>(null);
  /** What was typed here, or on an earlier visit in the same currency, or the figure the dollars make (D158). */
  const keptTyped = kept.typedIn === money.currency ? kept.typedAmount : undefined;
  const typed = typedAmount ?? starting?.typed ?? keptTyped ?? typedFromUnits(draftUnits(draft) ?? 0n, money.currency, money.rates);
  /**
   * A figure the person reads, in their own currency, with its mark and its own grouping: what the action says and
   * what a day of the gift is worth. The field beside it keeps what was typed instead, exactly as it was typed, so
   * nothing moves under the cursor.
   */
  const inTheirCurrency = (amount: bigint) => figureWithMark(figureIn(Number(typedFromUnits(amount, money.currency, money.rates)), money.currency), money.currency);
  /**
   * What the action says: the figure as it was typed, whenever the dollars are exactly the dollars that figure makes.
   * A whole currency does not sit on the cent, so 15,000 francs are held as $26.17, which are 14,995 francs: what
   * the person asked for is what the action repeats, and the sheet that pays says the dollars themselves.
   */
  const asked = (amount: bigint) => {
    try {
      if (unitsFromTyped(typed, money.currency, money.rates) === amount) return figureWithMark(figureIn(Number(typed.replace(",", ".")), money.currency), money.currency);
    } catch {
      // What cannot be read as money is not the amount, and the conversion below says what is.
    }
    return inTheirCurrency(amount);
  };
  /**
   * Which currency the card is read in. The key opens the list and changes nothing by itself (D152): with thirty-one
   * currencies offered, a press that moved to the next one would be a press nobody could aim.
   */
  const [reading, setReading] = useState(false);
  const readIn = (next: string) => {
    setTypedAmount(null);
    money.readIn(next);
    setReading(false);
  };
  const typeAmount = (value: string) => {
    setTypedAmount(value);
    // Typed, so it is this person's amount from now on and no longer the one the card came with (D158).
    try {
      change({ ...draft, dollars: formatAusd(unitsFromTyped(value, money.currency, money.rates)).slice(1), typedAmount: value, typedIn: money.currency });
    } catch {
      // What cannot be read yet is kept as typed and said back under the field by the refusal below.
      change({ ...draft, dollars: value, typedAmount: value, typedIn: money.currency });
    }
  };
  const quick = [bounds.min, bounds.suggested, bounds.max];
  /**
   * What the character at the head of the page is told (D148, the motion roadmap's step 2). With a pointer it is the
   * hover, and the face comes back when the pointer leaves. A finger has no hover, so the expression plays once when
   * the choice is made and comes back by itself: what the person is doing is never carried by it, only answered.
   */
  const hasPointer = useHasPointer();
  const asksAbout = (feeling: "curious" | "happy") => ({
    onPointerEnter: hasPointer ? (event: { currentTarget: Element }) => feel(feeling, event.currentTarget) : undefined,
    onPointerLeave: hasPointer ? () => feel("rest") : undefined,
  });
  const chosen = (feeling: "curious" | "happy", element: Element) => {
    if (!hasPointer) feel(feeling, element, true);
  };

  /** What the amount says back when it cannot be read as money: the same rule the route refuses by. */
  let amountRefusal: string | undefined;
  if (typed.trim().length > 0) {
    try {
      unitsFromTyped(typed, money.currency, money.rates);
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
          /* The name, typed in the line that carries it: the only empty thing on the card. It does not take the cursor
             by itself (D140), because on a phone that raises the keyboard the moment the page opens and hides half
             of what the person came to read. */
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
              {...asksAbout("curious")}
              onClick={(event) => {
                chosen("curious", event.currentTarget);
                setChoosing(condition ? "questions" : "list");
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
                <DayStrip
                  id={GIFT_ID}
                  gift={{ startDay: 0, endDay: 0, durationDays: Number.isInteger(days) && days > 0 ? days : bounds.suggested, creditedDays: 0, missedDays: 0 }}
                  catchUpSeconds={0}
                />
              )}
            </div>
          }
          bottom={
            <>
              {/* The one star of the screen, typed where it stands. */}
              {/* One box and one ring around the "$" and the figure together: the ring is the box's, drawn when the
                  figure inside has the focus, so the field never reads as a box inside a box (the founder, 20 Sep
                  2026, on the amount after the name was fixed). Beside it, what the figure is worth in the currency
                  this account reads in (D140, D141): one row that never wraps, and nothing at all below 480, where
                  a sentence carrying its rate's own day cannot fit beside a 39 pixel figure. */}
              <span className="flex items-baseline gap-x-[var(--space-sm)]">
                <span className={`${CARD_AMOUNT} on-paper-field inline-flex min-h-[var(--tap-target)] items-center focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--accent-text)]`}>
                  {/* The key that says what this card is read in, and that there is a list behind it (D152): the
                      mark in the house's own line, an edge, a relief and a chevron, like everything else that is
                      pressed here. A visitor has no page to set a currency on, so the card carries it (D144). */}
                  <MoneyKey currency={money.currency} onOpen={() => setReading(true)} className="-ml-[var(--space-xs)] mr-[var(--space-xs)]" />
                  <input
                    value={typed}
                    onChange={(event) => typeAmount(event.target.value)}
                    aria-label={W.slots.amount.label}
                    inputMode="decimal"
                    maxLength={9}
                    size={Math.max(4, typed.length + 1)}
                    autoComplete="off"
                    /* A step of air after the mark, so three letters never run into the figure they stand beside. */
                    className="min-h-[var(--tap-target)] min-w-[var(--tap-target)] bg-transparent pl-[var(--space-xs)] tabular-nums outline-none"
                  />
                </span>

              </span>
              {amountRefusal ? <span className={`block ${HELP} text-[var(--on-surface)]`}>{amountRefusal}</span> : null}


              {/* How long, on the card: the three lengths the register gives this condition, and no fourth (D130).
                  The chip that opened a field for any other number is gone: the founder asked for it on both sizes,
                  and a length outside the three is a length the register was never asked about. */}
              <span className="mt-[var(--space-sm)] flex flex-wrap items-center gap-[var(--tap-gap)]">
                {quick.map((count) => (
                  <button
                    key={count}
                    type="button"
                    {...asksAbout("happy")}
                    onClick={(event) => {
                      chosen("happy", event.currentTarget);
                      change({ ...draft, days: String(count) });
                    }}
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
                <span>{!filled.will ? W.finishWill : !filled.howLong ? W.chooseLength : units === undefined ? W.stillNeeded : W.pay(asked(units))}</span>
              </button>
              {/* What one day of it is worth, and nothing when there is no such figure. The pilot's ceiling is not a
                  standing notice any more (D138): it is what the amount says back to somebody who types past it,
                  under the amount itself, where a refusal belongs. */}
              {shape === "days" && units !== undefined && days > 0 ? (
                <span className={`block ${HELP} text-center`}>{W.eachDay(inTheirCurrency(units / BigInt(days)))}</span>
              ) : null}
            </>
          }
        />
      </section>

      {/* The one sheet the card opens, drawn once: a modal dialog is closed by the browser, which is what gives the
          page back, so taking an open one out of the page would leave its layer over everything. */}
      <WillSheet openAt={choosing} draft={draft} onChange={change} onClose={() => setChoosing(null)} />
      {/* The list of currencies, drawn once like the card's other sheets, and opened by the key above. */}
      <CurrencySheet
        open={reading}
        currency={money.currency}
        offered={money.offered}
        units={units ?? 0n}
        rates={money.rates}
        ratesAsked={money.ratesAsked}
        language={money.language}
        onChoose={readIn}
        onClose={() => setReading(false)}
      />
      <PaySheet open={paying} draft={draft} onChange={change} onClose={() => setPaying(false)} />
    </>
  );
}
