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
import { useReserves } from "@/src/client/reserves";
import { emptyReserveOf } from "@/src/reserves";
import { LIMIT, OFFER as W } from "@/src/sentences";
import { CARD, CARD_AMOUNT, CARD_LABEL, CARD_TITLE, CHIP, HELP, PRIMARY_BUTTON, ROW_BUTTON } from "../../components/ui";
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

export function OfferCard({
  holdings,
  paying,
  onPaying,
  onMaking,
}: Readonly<{
  holdings?: Holdings | null;
  /** Whether the pay sheet is open: Home's to keep, since Home draws this card anew when an account appears. */
  paying: boolean;
  onPaying: (open: boolean) => void;
  onMaking: (making: boolean) => void;
}>) {
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
  const setPaying = onPaying;
  /** The length, while somebody is typing one that is not on a chip. */

  const units = draftUnits(draft);
  const condition = conditionById(draft.conditionId);
  /**
   * A month's reserve used up (the founder, 3 Oct 2026): the condition on the card says so before the gift is paid
   * for, by its own source and with the day it starts again. The gift can still be made: it is read from that day.
   */
  const reserves = useReserves();
  const emptyReserve = emptyReserveOf(condition?.nature, reserves);
  const shape = shapeOf(draft.conditionId);
  const lengthFor = shape === "stamp" || shape === "climb" ? W.lengthFor[shape] : undefined;
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
  /**
   * The pay sheet changed the gift's amount (a judge's credit brings a gift above it down to it, D300): what was typed
   * in the card's field is no longer the amount, so the field reads the gift again. It kept "10" under a sheet that
   * said $3.00 (seen 9 Oct 2026).
   */
  const changeFromTheSheet = (next: typeof draft) => {
    if (next.dollars !== draft.dollars) setTypedAmount(null);
    change(next);
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
  /** Under a certificate's or a climb's one character: the register's own line on when all of it becomes theirs. */
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
            /* Centred in the card on a phone, at its own width; at the card's left on a large screen (the founder, 29 Sep 2026). */
            <span className="flex flex-wrap justify-center [@media(min-width:1024px)]:justify-start">
            <button
              type="button"
              /* One line. It opens the four families (D233, the founder: pressing it is to change what they will do),
                 except while the condition on the card is not answered yet: then it reopens that condition's own
                 questions, where the person left them (the founder, 28 Sep 2026: a sheet closed by a click beside it
                 sent them back to the four, to find their way to a half-filled face again). It says the label and the
                 condition's name and nothing else (D138). */
              onClick={() => setChoosing(condition && !filled.will ? "questions" : "list")}
              /* Eight pixels more than a caption gets under a title: this one is a control, and at four it sat on
                 the name's own box (the founder, 21 Sep 2026). */
              className={`${ROW_BUTTON} mt-[var(--space-sm)] justify-between text-left`}
            >
              <span className="flex min-w-0 flex-col">
                <span className={CARD_LABEL}>{W.invites.will}</span>
                <span className="break-words">{condition ? condition.name : W.invites.will}</span>
              </span>
              <svg aria-hidden focusable="false" width="20" height="20" viewBox="0 0 24 24" className="shrink-0 text-[var(--on-surface-muted)]">
                <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {/* Under what they will do, where it is chosen: quietly, the one sentence the gift's page will say too. */}
            {condition && emptyReserve && reserves ? (
              <span className="limit-said mt-[var(--space-sm)] block w-full" role="status" data-limit-said>
                {LIMIT.said(condition.source, emptyReserve, reserves.again)}
              </span>
            ) : null}
            </span>
          }
          /* The shape of the gift in the middle of the card (D226, the founder's direction A of 24 Sep 2026): the days,
             drawn by the product's own pieces, one mark a day at 72, the row scrolling, and under it what one mark is
             worth, in the title face; a certificate or a climb is one character at 96 and the register's own line on
             when all of it becomes theirs. Its own air above and below: the card's three groups, who and what, the
             days and the money, the action, are told apart by 24 pixels where 12 separate what is inside one. */
          shape={
            <div className="my-[var(--space-md)] flex flex-col items-center gap-[var(--space-sm)]">
              {shape === "climb" || shape === "stamp" ? (
                /* One character and nothing else (D132): the meter's bar belongs to a gift that has been read. It stands
                   in the middle of the card rather than at its left margin (the founder, 21 Sep 2026). */
                /* And no sentence under it (D258, the founder, 25 Sep 2026): the register's "when it becomes theirs" and
                   the coming-soon line said what the condition's own line already says, and a long one stretched the
                   card. What a mark is worth is said only under a row of days, where it is a figure nobody else gives. */
                <Character state="toCome" className="h-auto w-[96px]" standing={false} />
              ) : (
                <>
                  <DayStrip
                    id={GIFT_ID}
                    gift={{ startDay: 0, endDay: 0, durationDays: Number.isInteger(days) && days > 0 ? days : bounds.suggested, creditedDays: 0, missedDays: 0 }}
                    catchUpSeconds={0}
                    width={72}
                    /* Every day of the row asleep, the first too (the founder, 29 Sep 2026): it used to open its eyes
                       when the card was whole, and a row of one awake among the sleeping read as a mistake. */
                    /* And the days answer a new condition as they answer a new length: they arrive again, in turn (D230). */
                    changedOn={draft.conditionId}
                    /* What one mark is worth, small under each of them (D304): the figure follows the amount. */
                    each={units !== undefined && days > 0 ? inTheirCurrency(units / BigInt(days)) : undefined}
                  />
                  {/* The row is a picture, so a reader of the screen hears what a day is worth once, in words. */}
                  {units !== undefined && days > 0 ? <span className="sr-only">{`${inTheirCurrency(units / BigInt(days))} ${W.aDay}`}</span> : null}
                </>
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
              {/* The money on one line when it fits (D226): the amount, then the three lengths beside it, wrapping under it
                  on a phone. */}
              <span className={`flex flex-wrap ${lengthFor ? "items-end" : "items-center"} gap-x-[var(--space-md)] gap-y-[var(--space-md)]`}>
                {/* The key nests in the field at one inset on every side (D257): 48 inside, 54 for the field. */}
                <span
                  className={`${CARD_AMOUNT} on-paper-field inline-flex min-h-[var(--tap-target)] items-center has-[input:focus]:outline-2 has-[input:focus]:outline-offset-2 has-[input:focus]:outline-[var(--accent-text)]`}
                  style={{ paddingBlock: "var(--field-inset)", paddingLeft: "var(--field-inset)" }}
                >
                  {/* The key that says what this card is read in, and that there is a list behind it (D152): the
                      mark in the house's own line, an edge, a relief and a chevron, like everything else that is
                      pressed here. A visitor has no page to set a currency on, so the card carries it (D144). */}
                  <MoneyKey currency={money.currency} onOpen={() => setReading(true)} nested className="mr-[var(--space-xs)]" />
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
                {/* How long, on the card: the three lengths the register gives this condition, and no fourth (D130).
                    The chip that opened a field for any other number is gone: the founder asked for it on both sizes,
                    and a length outside the three is a length the register was never asked about. */}
                {/* Spread across the card on a phone, the first at its left edge and the last at its right, so the three are
                    centred in it (the founder, 29 Sep 2026); side by side on a large screen. */}
                {/* What the length sets, over it, where a number of days alone says nothing (the founder, 29 Sep 2026: "how
                    long" asked of an enrolment): the time given to show it, or to reach it. A row of days says it itself. */}
                <span role={lengthFor ? "group" : undefined} aria-label={lengthFor} className="flex w-full flex-col gap-[var(--space-xs)] [@media(min-width:1024px)]:w-auto">
                  {lengthFor ? (
                    <span aria-hidden className={CARD_LABEL}>
                      {lengthFor}
                    </span>
                  ) : null}
                  <span className="flex w-full flex-wrap items-center justify-between gap-[var(--tap-gap)] [@media(min-width:1024px)]:w-auto [@media(min-width:1024px)]:justify-start">
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
                </span>
              </span>
              {amountRefusal ? <span className={`block ${HELP} text-[var(--on-surface)]`}>{amountRefusal}</span> : null}

              {/* One action, in the sun, full width, saying what it will take from the first second; shut, it says what it
                  is waiting for rather than its price (ui review, 20 Sep 2026: a muted "Pay $30.00" with no reason).
                  Its own group, 24 pixels under the money (D226). */}
              {/* What it waits for inside the sheet, it opens the sheet on (the founder, 28 Sep 2026): "Finish what they
                  will do" is a way there, not a grey wall; the length and the amount are on the card itself. */}
              <button
                type="button"
                data-card-action
                className={`${PRIMARY_BUTTON} mt-[var(--space-xl)]`}
                disabled={filled.will && !ready}
                onClick={() => (filled.will ? setPaying(true) : setChoosing(condition ? "questions" : "list"))}
              >
                <span>{!filled.will ? W.finishWill : !filled.howLong ? W.chooseLength : units === undefined ? W.stillNeeded : W.pay(asked(units))}</span>
              </button>
              {/* The other half of the promise, under the action; what a day is worth is under the days now (D226). The
                  pilot's ceiling is not a standing notice any more (D138): it is what the amount says back to somebody
                  who types past it, under the amount itself, where a refusal belongs. */}
              {shape === "days" ? <span className={`block ${HELP} text-center`}>{W.missedBack}</span> : null}
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
      {/* The sheet says the gift as the card does: a figure the card started on, which nobody typed, is given to it
          as the figure typed, or a round 20,000 francs came back from its dollars as 19,997 (the founder, 4 Oct 2026). */}
      <PaySheet open={paying} draft={starting ? { ...draft, typedAmount: starting.typed, typedIn: money.currency } : draft} onChange={changeFromTheSheet} onClose={() => setPaying(false)} onMaking={onMaking} />
    </>
  );
}
