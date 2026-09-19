"use client";
import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "@/src/account/provider";
import { formatAusd } from "@/src/gift-reader";
import { draftUnits, durationBounds, filledCases, isComplete, shapeOf, type CardCase, type GiftDraft } from "@/src/gift-draft";
import { conditionById } from "@/src/conditions";
import { cardDraft, emptyCardDraft, subscribeToCardDraft, writeCardDraft } from "@/src/card-draft";
import { GIFT_CARD, OFFER as W } from "@/src/sentences";
import { BODY, CARD, HELP, META, PRIMARY_BUTTON } from "../../components/ui";
import { Character } from "../Character";
import { CardFace } from "../GiftCard";
import { DayStrip } from "../DayStrip";
import { Gaze } from "../Motion";
import { MilestoneMeter } from "../MilestoneMeter";
import { AmountSheet } from "./AmountSheet";
import { HowLongSheet } from "./HowLongSheet";
import { WhoSheet } from "./WhoSheet";
import { WillSheet } from "./WillSheet";

/**
 * The card a gift is filled in on, at the top of Home (the product vision of 19 Sep 2026, and the drawn card of the
 * same day, sections 1 and 2).
 *
 * There is one card in this product. This is the gift's own card, empty: the same face, the same title, the same row
 * of day characters or the same climbing meter, drawn by `CardFace` in app/kit/GiftCard.tsx. It is not a form that
 * resembles a gift, which is what the first version was and what a settings screen looks like.
 *
 * It fills in place. A case nobody has answered says the word that is missing where that word will be, in the quiet
 * voice, and the whole line opens its sheet: "For" followed by nothing means nothing, "Who is it for?" means
 * something. Nothing is asked of a visitor until Pay, which is the one thing on this screen wearing the accent.
 */
const GIFT_ID = "offer";

export function OfferCard() {
  const { address } = useAccount();
  const router = useRouter();
  /**
   * The card itself, read from the device rather than copied into this screen (src/card-draft.ts). The server draws
   * an empty card and the browser draws what was kept, and React is told how to go from one to the other.
   */
  const draft = useSyncExternalStore(subscribeToCardDraft, cardDraft, emptyCardDraft);
  const change = (next: GiftDraft) => writeCardDraft(next, address);
  const [open, setOpen] = useState<CardCase | null>(null);

  const filled = filledCases(draft);
  const units = draftUnits(draft);
  const condition = conditionById(draft.conditionId);
  const shape = shapeOf(draft.conditionId);
  const ready = isComplete(draft);
  const recipient = draft.recipientName.trim();
  const days = Number(draft.days);

  /** A line of the card: what is there, or the word that is missing in its place, and it opens its sheet either way. */
  const line = (slot: CardCase, said: string | null, voice: string) => (
    <button
      type="button"
      onClick={() => setOpen(slot)}
      aria-label={said === null ? W.invites[slot] : `${said}. ${W.change(W.slots[slot].label)}`}
      className={`${voice} ${said === null ? "text-[var(--muted)]" : ""} inline-flex min-h-[var(--tap-target)] max-w-full items-center break-words text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-text)]`}
    >
      {said ?? W.invites[slot]}
    </button>
  );

  return (
    <>
      <section className={`${CARD} flex flex-col`} aria-labelledby="offer-card">
        <h2 id="offer-card" className="sr-only">
          {W.title}
        </h2>
        <CardFace
          /*
           * The title is the gift's own, "For Léa", and "A gift" while nobody is named: the quiet voice, because a
           * gift for nobody is not a claim. The line under it is whatever is missing next, in its own words, and it
           * opens the case it names (the drawn card, section 2).
           */
          title={
            filled.for ? (
              line("for", GIFT_CARD.forName(recipient), "")
            ) : (
              <span className="text-[var(--muted)]">{W.emptyTitle}</span>
            )
          }
          under={filled.for ? line("will", condition ? condition.name : null, BODY) : line("for", null, BODY)}
          shape={
            /*
             * The shape, drawn by the product's own pieces. The gift character while there is nothing to draw yet,
             * then the row of days or the climbing meter, empty. Before a length is chosen the row is drawn at the
             * length this condition suggests: it is a picture, hidden from a reader, and the card says in words,
             * right under it, that nobody has chosen one yet.
             */
            shape === undefined ? (
              <Gaze>
                <Character state="gift" className="h-auto w-[88px] self-start" />
              </Gaze>
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
            )
          }
          bottom={
            <>
              <span className="money-display-box block">
                {line("amount", units === undefined ? null : formatAusd(units), units === undefined ? BODY : "money-display font-semibold tabular-nums")}
              </span>
              {line("howLong", filled.howLong ? W.forHowLong(days) : null, META)}
              {ready && units !== undefined ? (
                <button type="button" className={PRIMARY_BUTTON} onClick={() => router.push("/fund")}>
                  {W.pay(formatAusd(units))}
                </button>
              ) : (
                <p className={HELP}>{W.stillNeeded}</p>
              )}
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
    </>
  );
}
