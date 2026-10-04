"use client";
import { useEffect } from "react";
import { noteInRampnowJournal } from "@/src/client/rampnow-journal";
import type { RampnowPending } from "@/src/client/rampnow-pending";
import { rampnowFinishPage } from "@/src/rampnow-frame";
import { PAY as W } from "@/src/sentences";
import { BODY, HELP, PRIMARY_BUTTON, SMALL_BUTTON } from "../../components/ui";
import { useMinute } from "../clock";

/**
 * A card payment started through Rampnow that has not arrived, on the screen that waits (one gift, one payment, the
 * founder, 3 and 4 Oct 2026). A button says what its press does and never declares a state.
 *
 * - A payment known, by a message of the frame: the wheel, where the payment is, since when, and one button, "Finish
 *   my payment". Nothing here pays again: the last way to a second payment would be here.
 * - Nothing known: only the person knows whether they paid, so the screen asks, "Did you pay by card?", and the two
 *   answers are actions. "Yes, finish my payment" leads back to it; "No, pay now" forgets it and opens a new payment.
 *
 * The way back is the frame, where the person is still signed in at Rampnow; for a payment started on Rampnow's page
 * in a tab of its own, it is that page.
 */
export function RampnowWaiting({
  pending,
  onFinish,
  onPayNow,
}: Readonly<{
  pending: RampnowPending;
  /** Opens the frame on the payment already started. */
  onFinish: () => void;
  /** The person answers that they did not pay: the payment is forgotten and a new one opens. */
  onPayNow: () => void;
}>) {
  const minute = useMinute();
  const minutes = Math.max(0, Math.floor((minute - pending.sinceMs) / 60_000));
  // Written down once per state: what the screen showed when the person came back to it.
  useEffect(() => {
    noteInRampnowJournal(`Viky: the wait shows a payment ${pending.known ? "known" : "not known"}, started in ${pending.via === "tab" ? "a tab" : "the frame"}`, { orderUid: pending.orderUid });
  }, [pending.known, pending.via, pending.orderUid]);
  const finish = (label: string) =>
    pending.via === "tab" ? (
      <a href={rampnowFinishPage(pending.orderUid)} target="_blank" rel="noopener noreferrer" className={PRIMARY_BUTTON}>
        {label}
      </a>
    ) : (
      <button type="button" className={PRIMARY_BUTTON} onClick={onFinish}>
        {label}
      </button>
    );
  if (pending.known) {
    return (
      <div className="flex flex-col gap-[var(--space-sm)]" data-rampnow-pending="known">
        <div className="flex items-center gap-[var(--space-md)]" role="status">
          <span className="working-ring shrink-0" aria-hidden="true" />
          <p className={BODY}>{W.rampnow.atRampnow}</p>
        </div>
        <p className={HELP}>
          {W.rampnow.needsItsPage} <span data-rampnow-since="">{W.rampnow.since(minutes)}</span>
        </p>
        {finish(W.rampnow.finish)}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-[var(--space-sm)]" data-rampnow-pending="asked">
      {/* No wheel beside a question: nothing is known to be under way. */}
      <p className={BODY}>{W.rampnow.didYouPay}</p>
      <p className={HELP} data-rampnow-since="">
        {W.rampnow.started(minutes)}
      </p>
      {finish(W.rampnow.yesFinish)}
      <button type="button" className={`${SMALL_BUTTON} self-start`} onClick={onPayNow}>
        {W.rampnow.noPayNow}
      </button>
    </div>
  );
}
