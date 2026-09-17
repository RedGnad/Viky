import Link from "next/link";
import { conditionOfGoal } from "@/src/conditions";
import type { GiftSummary } from "@/src/client/gift";
import { GIFT_CARD as W } from "@/src/sentences";
import { BODY, CARD, HELP } from "../components/ui";
import { DayStrip } from "./DayStrip";

/**
 * The one card for a gift, wherever it appears (structure of 17 Sep, section 12, item 9). The whole card opens the
 * gift (Material: "Cards can serve as entry points"), with a chevron as its sign, and no small link inside it. Its
 * title says for whom and for what; under it the image of the days, the state in words, and one line of amounts.
 * For what comes from the register and never from the card (item 10). A milestone's meter joins the strip with the
 * first milestone gift, on its own line (C2): no milestone gift reaches a card before then.
 */
export function GiftCard({ gift }: Readonly<{ gift: GiftSummary }>) {
  const condition = conditionOfGoal(gift.goalType);
  // A day has been counted once the gift is connected, and a finished gift has counted all of its days, whatever the
  // record says about the connection: its line is what became theirs and what came back.
  const started = gift.opened && (gift.counting || gift.finished || gift.creditedDays + gift.missedDays > 0);
  return (
    <Link
      href={`/g/${gift.giftId}`}
      className={`${CARD} block transition-[border-color] hover:border-[var(--control-border)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-text)]`}
    >
      <span className="flex items-start justify-between gap-[var(--space-md)]">
        <span className="flex min-w-0 flex-col">
          <span className="text-[length:var(--type-title)] leading-[var(--type-title-leading)] font-semibold break-words">{whoInWords(gift)}</span>
          <span className={BODY}>{condition?.name ?? ""}</span>
        </span>
        <svg aria-hidden focusable="false" width="24" height="24" viewBox="0 0 24 24" className="mt-[2px] shrink-0">
          <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <DayStrip gift={gift} catchUpSeconds={gift.catchUpSeconds} />
      <span className={`block ${BODY}`}>{stateInWords(gift, condition?.words.connect)}</span>
      <span className={`block ${HELP} tabular-nums`}>{amountsInWords(gift, started)}</span>
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
