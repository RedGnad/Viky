import Link from "next/link";
import { conditionOfGoal } from "@/src/conditions";
import type { GiftSummary } from "@/src/client/gift";
import { GIFT_CARD as W } from "@/src/sentences";
import { BODY, CARD, HELP } from "../components/ui";

/**
 * The one card for a gift, wherever it appears: for whom, for what, how much, its state, and it opens (structure
 * of 17 Sep, section 12, item 9). For what comes from the register and never from the card (item 10).
 */
export function GiftCard({ gift }: Readonly<{ gift: GiftSummary }>) {
  const condition = conditionOfGoal(gift.goalType);
  const forWhom = gift.role === "recipient" ? W.forYou : gift.goalUsername ? W.forName(gift.goalUsername) : W.forWhoever;
  return (
    <Link href={`/g/${gift.giftId}`} className={`${CARD} block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-text)]`}>
      <span className="flex items-baseline justify-between gap-[var(--space-md)]">
        <span className="font-medium">{forWhom}</span>
        <span className="text-[length:var(--type-help)] text-[var(--accent-text)] underline">{W.open}</span>
      </span>
      <span className={`block ${BODY}`}>{condition?.name ?? ""}</span>
      <span className={`block ${HELP}`}>{W.amountDaily(gift.amountDisplay, gift.perDayDisplay, gift.durationDays)}</span>
      <span className={`block ${BODY}`}>{stateInWords(gift, condition?.words.connect)}</span>
      {gift.opened && gift.counting ? (
        <span className={`block ${HELP}`}>
          {gift.role === "recipient" ? W.yours(gift.earnedDisplay) : W.theirs(gift.theirsDisplay, gift.returnedDisplay)}
        </span>
      ) : null}
    </Link>
  );
}

/** One sentence for the state of a gift, the same whichever side of it a person is on. */
export function stateInWords(gift: GiftSummary, connect: string | undefined): string {
  if (gift.cancelled) return W.takenBack;
  if (gift.finished) return W.finished(gift.creditedDays, gift.durationDays, gift.missedDays);
  if (!gift.opened) return W.notOpened;
  if (!gift.counting) return connect ?? "";
  return W.counting(gift.creditedDays, gift.durationDays, gift.missedDays);
}
