import Link from "next/link";
import { conditionById, conditionOfGoal } from "@/src/conditions";
import type { GiftSummary } from "@/src/client/gift";
import type { MilestoneStatus } from "@/src/milestone-view";
import { dateInWords } from "@/src/moments";
import { GIFT_CARD as W, MILESTONE_PAGE as M } from "@/src/sentences";
import { BODY, CARD, HELP } from "../components/ui";
import { DayStrip } from "./DayStrip";
import { MilestoneMeter } from "./MilestoneMeter";

/**
 * The one card for a gift, wherever it appears: Home, Gifts, and the head of the gift's own page (structure of 17 Sep,
 * section 12, item 9). On Home and Gifts the whole card opens the gift (Material: "Cards can serve as entry points"),
 * with a chevron as its sign; at the head of the page it is the same card, standing still. Its title says for whom
 * and for what; under it the image of progress, the state in words, and one line of amounts. For what comes from the
 * register and never from the card (item 10). A daily gift draws its days, a milestone its meter.
 */
export function GiftCard({ gift, milestone: given, still = false, example = false }: Readonly<{ gift: GiftSummary; milestone?: MilestoneStatus; still?: boolean; example?: boolean }>) {
  // On Home and Gifts a milestone gift arrives inside its summary (C2); at the head of its page, beside it.
  const milestone = given ?? gift.milestone;
  const condition = milestone ? conditionById(milestone.conditionId) : conditionOfGoal(gift.goalType);
  const started = gift.opened && (gift.counting || gift.finished || gift.creditedDays + gift.missedDays > 0);
  const body = (
    <>
      {/* The one example in the product, on the page without an account, and it says so (rule of integrity). */}
      {example ? (
        <span className="inline-flex self-start rounded-full border-[length:var(--card-border-width)] border-[var(--control-border)] px-[var(--space-sm)] text-[length:var(--type-help)] leading-[var(--type-help-leading)] font-medium">
          {W.example}
        </span>
      ) : null}
      <span className="flex items-start justify-between gap-[var(--space-md)]">
        <span className="flex min-w-0 flex-col">
          <span className="text-[length:var(--type-title)] leading-[var(--type-title-leading)] font-semibold break-words">{whoInWords(gift)}</span>
          <span className={BODY}>{condition?.name ?? ""}</span>
        </span>
        {still || example ? null : (
          <svg aria-hidden focusable="false" width="24" height="24" viewBox="0 0 24 24" className="mt-[2px] shrink-0">
            <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      {/*
        A daily gift's card draws its days, except at the head of its own page, where the row of days below says it once.
        A milestone has no days, so its character and its meter stay, and grow to the large size on its own page.
      */}
      {milestone ? (
        <MilestoneMeter status={milestone} size={still ? "large" : "small"} />
      ) : still ? null : (
        <DayStrip id={gift.giftId} gift={gift} catchUpSeconds={gift.catchUpSeconds} records={gift.days} />
      )}
      <span className={`block ${BODY}`}>{milestone ? milestoneStateInWords(milestone) : stateInWords(gift, condition?.words.connect)}</span>
      <span className={`block ${HELP} tabular-nums`}>
        {milestone ? W.milestoneAmount(milestone.amountDisplay, milestoneBy(milestone)) : amountsInWords(gift, started)}
      </span>
    </>
  );
  if (still || example) return <section className={`${CARD} flex flex-col`}>{body}</section>;
  return (
    <Link
      href={`/g/${gift.giftId}`}
      className={`${CARD} block transition-[border-color] hover:border-[var(--control-border)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-text)]`}
    >
      {body}
    </Link>
  );
}

/** For whom, on the funder's side; from whom, on the recipient's. The names given when it was offered come first. */
export function whoInWords(gift: Pick<GiftSummary, "role" | "recipientName" | "funderName" | "goalUsername">): string {
  if (gift.role === "recipient") return gift.funderName ? W.fromName(gift.funderName) : W.forYou;
  if (gift.recipientName) return W.forName(gift.recipientName);
  return gift.goalUsername ? W.forName(gift.goalUsername) : W.forWhoever;
}

/** One line of amounts: the terms until a day is counted, then how much of the whole is theirs and how much came back. */
export function amountsInWords(gift: GiftSummary, started: boolean): string {
  if (!started || gift.cancelled) return W.amountDaily(gift.amountDisplay, gift.perDayDisplay, gift.durationDays);
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

/** "by 17 Oct 2026" once the first reading has started the clock, "within 30 days of connecting" before it (D46). */
export function milestoneBy(status: Pick<MilestoneStatus, "deadlineMs" | "durationDays">): string {
  return status.deadlineMs === null ? M.withinDays(status.durationDays) : M.byDate(dateInWords(status.deadlineMs));
}

function milestoneStateInWords(status: MilestoneStatus): string {
  if (status.cancelled) return W.takenBack;
  if (status.reached) return W.milestoneReached(status.target);
  if (status.finished) return W.milestoneMissed(status.target);
  if (!status.opened) return W.notOpened;
  if (status.phase === "startTooHigh" && status.startReading !== null) return W.milestoneStartTooHigh(status.startReading, status.maximumStart);
  return status.todayReading === null ? W.milestoneNotRead(status.target) : W.milestoneToday(status.todayReading, status.target);
}
