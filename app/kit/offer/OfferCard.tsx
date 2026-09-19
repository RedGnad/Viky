"use client";
import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "@/src/account/provider";
import { formatAusd } from "@/src/gift-reader";
import { CARD_CASES, draftUnits, filledCases, isComplete, shapeOf, type CardCase, type GiftDraft } from "@/src/gift-draft";
import { conditionById } from "@/src/conditions";
import { cardDraft, emptyCardDraft, subscribeToCardDraft, writeCardDraft } from "@/src/card-draft";
import { OFFER as W } from "@/src/sentences";
import { CARD, HELP, PRIMARY_BUTTON } from "../../components/ui";
import { AmountSheet } from "./AmountSheet";
import { HowLongSheet } from "./HowLongSheet";
import { ShapePreview } from "./ShapePreview";
import { WhoSheet } from "./WhoSheet";
import { WillSheet } from "./WillSheet";

/**
 * The card a gift is filled in on, at the top of Home (the product vision of 19 Sep 2026, sections 1, 4 and 6).
 *
 * It is the product itself rather than a way into it: four cases, For, will, worth and for how long, each opening in
 * a sheet, each changing the card under the eyes of whoever is filling it. Nothing is asked of a visitor until they
 * press Pay: the account and the money arrive there and not before (Apple's own onboarding guidance, and App Store
 * rule 5.1.1 (v)), and what is written here is kept on the device meanwhile, which is D74's draft doing the work it
 * was already doing for a card payment.
 *
 * What it replaced: the eight step assistant of `/fund`, five of whose screens came before the gift existed at all.
 */
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

  const value: Readonly<Record<CardCase, string | undefined>> = {
    for: filled.for ? W.forNames(draft.recipientName.trim(), draft.funderName.trim()) : undefined,
    will: condition ? condition.name : undefined,
    amount: units !== undefined ? formatAusd(units) : undefined,
    howLong: filled.howLong ? W.days(Number(draft.days)) : undefined,
  };

  return (
    <>
      <section className={CARD} aria-labelledby="offer-card">
        <h2 id="offer-card" className="sr-only">
          {W.title}
        </h2>
        <p className={HELP}>{W.invitation}</p>
        <dl className="flex flex-col">
          {CARD_CASES.map((slot) => (
            <div key={slot} className="border-b border-[var(--divider)] last:border-b-0">
              <button
                type="button"
                onClick={() => setOpen(slot)}
                className="flex min-h-[var(--tap-target)] w-full items-baseline justify-between gap-[var(--space-md)] py-[var(--space-sm)] text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-text)]"
              >
                <dt className={`${HELP} flex-none`}>{W.slots[slot].label}</dt>
                <dd className={value[slot] ? "text-right font-medium" : `${HELP} text-right underline underline-offset-[3px]`}>
                  {value[slot] ?? W.slots[slot].empty}
                </dd>
              </button>
            </div>
          ))}
        </dl>
        {/* The shape appears the moment the condition is chosen, empty: it is what the gift's own page will fill. */}
        {shape ? <ShapePreview shape={shape} days={Number(draft.days) || undefined} /> : null}
        {ready && units !== undefined ? (
          <button type="button" className={PRIMARY_BUTTON} onClick={() => router.push("/fund")}>
            {W.pay(formatAusd(units))}
          </button>
        ) : (
          <p className={HELP}>{W.stillNeeded}</p>
        )}
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
