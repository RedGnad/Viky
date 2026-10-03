"use client";
import Link from "next/link";
import type { RampnowPending } from "@/src/client/rampnow-pending";
import { rampnowFinishPage } from "@/src/rampnow-frame";
import { PAY as W } from "@/src/sentences";
import { BODY, HELP, PRIMARY_BUTTON, SECONDARY_BUTTON, SMALL_BUTTON } from "../../components/ui";
import { useMinute } from "../clock";

/**
 * A card payment that is at Rampnow, as every screen says it once the frame was left (one gift, one payment, the
 * founder, 3 Oct 2026): the wheel, where the payment is, since when; the main action, which leads back to that payment
 * and never to a new one; and a small one for somebody who has not paid, which is the only way a new payment starts.
 *
 * The same block on the screen that waits, on Home and on Gifts. The way back is the frame, where the person is still
 * signed in at Rampnow; for a payment started on Rampnow's page in a tab of its own, it is that page.
 */
export function RampnowWaiting({
  pending,
  says,
  onFinish,
  quiet = false,
  onNotPaid,
}: Readonly<{
  pending: RampnowPending;
  /** Where the payment is, in one sentence: "if you paid" when no message said a payment exists. */
  says: string;
  /** On the screen that waits: opens the frame on the payment. Without it, the action is a link to that screen. */
  onFinish?: () => void;
  /** On Home and on Gifts the way back takes the weight of the action it replaces, which is not the screen's main one. */
  quiet?: boolean;
  onNotPaid: () => void;
}>) {
  const minute = useMinute();
  const minutes = Math.max(0, Math.floor((minute - pending.sinceMs) / 60_000));
  const action = quiet ? `${SECONDARY_BUTTON} block text-center no-underline` : PRIMARY_BUTTON;
  return (
    <div className="flex flex-col gap-[var(--space-sm)]" data-rampnow-pending={pending.known ? "known" : "possible"}>
      <div className="flex items-center gap-[var(--space-md)]" role="status">
        <span className="working-ring shrink-0" aria-hidden="true" />
        <p className={BODY}>{says}</p>
      </div>
      <p className={HELP}>
        {W.rampnow.needsItsPage} <span data-rampnow-since="">{W.rampnow.since(minutes)}</span>
      </p>
      {pending.via === "tab" ? (
        <a href={rampnowFinishPage(pending.orderUid)} target="_blank" rel="noopener noreferrer" className={action}>
          {W.rampnow.finish}
        </a>
      ) : onFinish ? (
        <button type="button" className={action} onClick={onFinish}>
          {W.rampnow.finish}
        </button>
      ) : (
        <Link href="/fund?step=paying&finish=1" className={action}>
          {W.rampnow.finish}
        </Link>
      )}
      <button type="button" className={`${SMALL_BUTTON} self-start`} onClick={onNotPaid}>
        {W.rampnow.notPaid}
      </button>
    </div>
  );
}
