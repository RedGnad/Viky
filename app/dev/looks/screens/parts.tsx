import Link from "next/link";
import { Character, type CharacterState } from "@/app/kit/Character";
import { amountsInWords, stateInWords, whoInWords } from "@/app/kit/GiftCard";
import { ArrivalDay, Gaze } from "@/app/kit/Motion";
import { BODY, CARD, HELP } from "@/app/components/ui";
import type { GiftSummary } from "@/src/client/gift";
import { conditionOfGoal } from "@/src/conditions";
import { GIFT_PAGE } from "@/src/sentences";
import { LAB } from "../words";

/**
 * The pieces the six screens share in the laboratory: the gift card with its strip of small characters, and the large
 * strip of a gift's page. They are the kit's card and the kit's words, with characters where the product has its strip
 * today (app/kit/DayStrip.tsx and app/kit/DayRow.tsx, which this laboratory leaves untouched). Every day sits inside
 * the screen's arrival, which plays it only if it changed since the last visit.
 */

/** The small strip on a card: shape and colour only, no face (brief, section 5). The card says the state in words. */
export function SmallStrip({ gift, days }: Readonly<{ gift: string; days: readonly CharacterState[] }>) {
  return (
    <span aria-hidden className="flex h-[24px] w-full items-end gap-[4px]">
      {days.map((state, index) => (
        <span key={index} className="flex h-full min-w-0 max-w-[24px] flex-1 items-end">
          <ArrivalDay gift={gift} index={index}>
            <Character state={state} size="small" className="h-auto w-full" />
          </ArrivalDay>
        </span>
      ))}
    </span>
  );
}

/** The gift card of the kit, with the small characters as its image of progress, opening the gift or standing still. */
export function ExampleGiftCard({
  gift,
  days,
  href,
  example = false,
  strip = true,
}: Readonly<{ gift: GiftSummary; days: readonly CharacterState[]; href?: string; example?: boolean; strip?: boolean }>) {
  const condition = conditionOfGoal(gift.goalType);
  const body = (
    <>
      {example ? (
        <span className="inline-flex self-start rounded-full border-[length:var(--card-border-width)] border-[var(--control-border)] px-[var(--space-sm)] text-[length:var(--type-help)] leading-[var(--type-help-leading)] font-medium">
          {LAB.example}
        </span>
      ) : null}
      <span className="flex items-start justify-between gap-[var(--space-md)]">
        <span className="flex min-w-0 flex-col">
          <span className="text-[length:var(--type-title)] leading-[var(--type-title-leading)] font-semibold break-words">{whoInWords(gift)}</span>
          <span className={BODY}>{condition?.name ?? ""}</span>
        </span>
        {href ? (
          <svg aria-hidden focusable="false" width="24" height="24" viewBox="0 0 24 24" className="mt-[2px] shrink-0">
            <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </span>
      {strip ? <SmallStrip gift={gift.giftId} days={days} /> : null}
      <span className={`block ${BODY}`}>{stateInWords(gift, condition?.words.connect)}</span>
      <span className={`block ${HELP} tabular-nums`}>{amountsInWords(gift, true)}</span>
    </>
  );
  if (!href) return <section className={`${CARD} flex flex-col`}>{body}</section>;
  return (
    <Link
      href={href}
      className={`${CARD} flex flex-col transition-[border-color] hover:border-[var(--control-border)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-text)]`}
    >
      {body}
    </Link>
  );
}

/**
 * The large strip of a gift's page: every day a character with its face, its date, and its state in words (rule D).
 * Four to a row on a phone, seven once the column has room for a week. A pointer hovering a character is looked at.
 */
export function LargeStrip({ gift, days, dates }: Readonly<{ gift: string; days: readonly CharacterState[]; dates: readonly string[] }>) {
  const words = (state: CharacterState) =>
    state === "returned" ? GIFT_PAGE.dayWords.returnedYours : state === "gift" ? "" : GIFT_PAGE.dayWords[state];
  return (
    <div className="@container">
      <ol aria-label={GIFT_PAGE.daysLabel} className="grid grid-cols-4 gap-x-[var(--space-sm)] gap-y-[var(--space-lg)] @[420px]:grid-cols-7">
        {days.map((state, index) => (
          <li key={index} aria-label={`${dates[index]} Sep, ${words(state)}`} className="flex min-w-0 flex-col items-center gap-[var(--space-xs)]">
            <span className="flex w-full justify-center pt-[var(--space-sm)]">
              <ArrivalDay gift={gift} index={index}>
                <Gaze>
                  <Character state={state} variant={index} className="h-auto w-full max-w-[72px]" />
                </Gaze>
              </ArrivalDay>
            </span>
            <span aria-hidden className="text-[length:var(--type-help)] leading-[var(--type-help-leading)] font-medium tabular-nums">
              {dates[index]}
            </span>
            <span aria-hidden className="text-center text-[length:var(--type-help)] leading-[var(--type-help-leading)] text-[var(--muted)]">
              {words(state)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
