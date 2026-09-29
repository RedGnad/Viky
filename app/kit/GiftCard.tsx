"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { useReaderZone } from "@/src/client/reader-zone";
import { Nature } from "./Nature";
import { conditionById, conditionOfGoal } from "@/src/conditions";
import type { GiftSummary } from "@/src/client/gift";
import type { MilestoneStatus } from "@/src/milestone-view";
import { dateInWords } from "@/src/moments";
import { GIFT_CARD as W, MILESTONE_PAGE as M } from "@/src/sentences";
import { BODY, CARD, CARD_LABEL, CARD_TITLE, HELP } from "../components/ui";
import { DayStrip } from "./DayStrip";
import { Climb } from "./Climb";

/**
 * The one card for a gift, wherever it appears: Home, Gifts, and the head of the gift's own page (structure of 17 Sep,
 * section 12, item 9). On Home and Gifts the whole card opens the gift (Material: "Cards can serve as entry points"),
 * with a chevron as its sign; at the head of the page it is the same card, standing still. Its title says for whom
 * and for what; under it the image of progress, the state in words, and one line of amounts. For what comes from the
 * register and never from the card (item 10). A daily gift draws its days, a milestone its meter.
 */
export function GiftCard({ gift, milestone: given, example = false }: Readonly<{ gift: GiftSummary; milestone?: MilestoneStatus; example?: boolean }>) {
  // On Home and Gifts a milestone gift arrives inside its summary (C2); at the head of its page, beside it.
  const milestone = given ?? gift.milestone;
  /** The clock this reader keeps, so a card drawn by the server says their day and not the server's (D160). */
  const zone = useReaderZone();
  const condition = milestone ? conditionById(milestone.conditionId) : conditionOfGoal(gift.goalType);
  const started = gift.opened && (gift.counting || gift.finished || gift.creditedDays + gift.missedDays > 0);
  const body = (
    <CardFace
      badge={
        /* The one example in the product, on the page without an account, and it says so (rule of integrity). */
        example ? (
          <span className="inline-flex self-start rounded-full border-[length:var(--card-border-width)] border-[var(--control-border)] px-[var(--space-sm)] text-[length:var(--type-help)] leading-[var(--type-help-leading)] font-medium">
            {W.example}
          </span>
        ) : null
      }
      label={W.fromFunderOrYours(gift.role === "funder" ? null : gift.funderName)}
      title={whoInWords(gift)}
      under={condition?.name ?? ""}
      nature={condition ? <Nature nature={condition.nature} /> : null}
      chevron={!example}
      /* A daily gift's card draws its days; a milestone has no days, so its character on its trail (D232: the same
         trail as the gift's own page, flat, where a bar had stayed on the card). On the gift's own page the card is
         `GiftLive`, alive, and draws the climb or the stamp (V4). */
      shape={
        milestone ? (
          <Climb giftId={gift.giftId} status={milestone} />
        ) : (
          <DayStrip id={gift.giftId} gift={gift} catchUpSeconds={gift.catchUpSeconds} records={gift.days} />
        )
      }
      bottom={
        <>
          <span className={`block ${BODY}`}>{milestone ? milestoneStateInWords(milestone) : stateInWords(gift, condition?.words.connect)}</span>
          <span className={`block ${HELP} tabular-nums`}>
            {milestone ? W.milestoneAmount(milestone.amountDisplay, milestoneBy(milestone, zone)) : amountsInWords(gift, started)}
          </span>
        </>
      }
    />
  );
  if (example) return <section className={`${CARD} flex flex-col`}>{body}</section>;
  return (
    <Link
      href={`/g/${gift.giftId}`}
      className={`${CARD} block transition-[border-color] hover:border-[var(--control-border)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-text)]`}
    >
      {body}
    </Link>
  );
}

/**
 * How a card is drawn, and there is only one of them (the drawn card of 19 Sep 2026, section 1): the title, the line
 * under it, the image of progress, and the bottom. A real gift fills it from its own figures; the card a gift is
 * filled in on fills it from the draft, empty first, so what a person builds is the object they will watch
 * afterwards rather than a form that resembles it.
 *
 * It draws no card of its own: whoever calls it puts it inside one, because a gift on Home is a link to its page and
 * the card being filled in is not.
 */
export function CardFace({
  label,
  badge,
  title,
  under,
  nature,
  detail,
  chevron = false,
  shape,
  bottom,
}: Readonly<{ label?: ReactNode; badge?: ReactNode; title: ReactNode; under: ReactNode; nature?: ReactNode; detail?: ReactNode; chevron?: boolean; shape: ReactNode; bottom: ReactNode }>) {
  return (
    <>
      {badge}
      {/* Whose gift it is, in the third voice, at the head of the card (the rendered mockups of 19 Sep 2026). */}
      {label ? <span className={`block ${CARD_LABEL}`}>{label}</span> : null}
      <span className="flex items-start justify-between gap-[var(--space-md)]">
        <span className="flex min-w-0 flex-1 flex-col gap-[var(--space-xs)]">
          <span className={`${CARD_TITLE} break-words`}>{title}</span>
          <span className={BODY}>{under}</span>
          {nature}
        </span>
        {chevron ? (
          <svg aria-hidden focusable="false" width="24" height="24" viewBox="0 0 24 24" className="mt-[2px] shrink-0">
            <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </span>
      {/* The line that opens the condition's own questions, when the register gives that condition a detail (D136). */}
      {detail}
      {shape}
      {bottom}
    </>
  );
}

/** For whom, on the funder's side; from whom, on the recipient's. The names given when it was offered come first. */
export function whoInWords(gift: Pick<GiftSummary, "role" | "recipientName" | "funderName" | "goalUsername">): string {
  if (gift.role === "reader") return W.fromFor(gift.funderName, gift.recipientName ?? gift.goalUsername);
  if (gift.role === "recipient") return gift.funderName ? W.fromName(gift.funderName) : W.forYou;
  if (gift.recipientName) return W.forName(gift.recipientName);
  return gift.goalUsername ? W.forName(gift.goalUsername) : W.forWhoever;
}

/** One line of amounts: the terms until a day is counted, then how much of the whole is theirs and how much came back. */
export function amountsInWords(gift: GiftSummary, started: boolean): string {
  if (!started || gift.cancelled) return W.amountDaily(gift.amountDisplay, gift.perDayDisplay, gift.durationDays);
  if (gift.role === "reader") return W.theirsGoneBack(gift.theirsDisplay, gift.amountDisplay, gift.returnedDisplay);
  return gift.role === "recipient"
    ? W.yoursOf(gift.theirsDisplay, gift.amountDisplay, gift.returnedDisplay)
    : W.theirsOf(gift.theirsDisplay, gift.amountDisplay, gift.returnedDisplay);
}

/** One sentence for the state of a gift, the same whichever side of it a person is on. */
export function stateInWords(gift: GiftSummary, connect: string | undefined): string {
  if (gift.cancelled) return W.takenBack;
  if (gift.finished) return W.finished(gift.creditedDays, gift.durationDays, gift.missedDays);
  if (!gift.opened) return W.notOpened;
  if (!gift.counting) return connect ?? "";
  return W.counting(gift.creditedDays, gift.durationDays, gift.missedDays);
}

/**
 * "by 17 Oct 2026" once the first reading has started the clock, "within 30 days of connecting" before it (D46).
 * The zone is the reader's, from the cookie their browser wrote (D160): a date has a different day on either side
 * of midnight somewhere, and a card the server drew must say the same day as the card the browser draws.
 */
export function milestoneBy(status: Pick<MilestoneStatus, "deadlineMs" | "durationDays">, zone: string): string {
  return status.deadlineMs === null ? M.withinDays(status.durationDays) : M.byDate(dateInWords(status.deadlineMs, zone));
}

function milestoneStateInWords(status: MilestoneStatus): string {
  if (status.cancelled) return W.takenBack;
  if (status.target === null) return status.finished ? W.milestoneEnded : status.opened ? W.milestoneUnderWay : W.notOpened;
  if (status.reached) return W.milestoneReached(status.target);
  if (status.finished) return W.milestoneMissed(status.target);
  if (!status.opened) return W.notOpened;
  if (status.phase === "startTooHigh" && status.startReading !== null) return W.milestoneStartTooHigh(status.startReading, status.target);
  return status.todayReading === null ? W.milestoneNotRead(status.target) : W.milestoneToday(status.todayReading, status.target);
}
