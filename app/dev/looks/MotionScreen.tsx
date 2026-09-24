"use client";
import type { CSSProperties } from "react";
import { Character } from "@/app/kit/Character";
import { useMinute } from "@/app/kit/clock";
import { charactersOf } from "@/app/kit/DayStrip";
import { Arrival, ArrivalAmount, ArrivalDay, Reveal } from "@/app/kit/Motion";
import { AMOUNT_IN_TITLE, CARD, HELP, SECONDARY_BUTTON, TITLE } from "@/app/components/ui";
import { FUND, HOME } from "@/src/sentences";
import { ACCOUNT, fromMaman, LAST_VISIT, TO_NOE } from "./example";
import { ReplayArrival } from "./ReplayArrival";
import { SuccessDemo } from "./SuccessDemo";
import { LAB } from "./words";

/**
 * The motion of the brief (section 6), on one page, so it can be watched and recorded. Every movement here answers a
 * gesture, as in the product: arriving on the page plays what changed since the last visit, "Replay arrival" plays it
 * again, a press answers the press, the success of a press brings the gift, scrolling reveals what comes into view
 * once, and a pointer hovering a character or a button is answered. Under reduced motion none of it moves.
 */
export function MotionScreen() {
  const nowMs = useMinute();
  const gift = fromMaman(nowMs);
  const days = charactersOf(gift, gift.catchUpSeconds, nowMs, gift.days).slice(0, 5);
  const shown = `${ACCOUNT.symbol}${ACCOUNT.euros.toFixed(2)}`;
  return (
    <Arrival storageKey="viky.lab.motion" amount gifts={[{ id: gift.giftId, days, lastSeen: LAST_VISIT.settledDays }]}>
      <main className="mx-auto flex w-full max-w-[var(--app-column-max)] flex-col gap-[var(--space-lg)] px-[var(--page-margin)] py-[var(--space-lg)]">
        <h1 className={`${TITLE} pr-[148px]`}>{LAB.motion}</h1>
        <section className={CARD}>
          <p className={HELP}>Arriving: the days that changed since the last visit, then the amount</p>
          <div className="grid grid-cols-5 gap-[var(--space-sm)]">
            {days.map((state, index) => (
              <ArrivalDay key={index} gift={gift.giftId} index={index}>
                                  <Character state={state} variant={index} className="h-auto w-full" />
                              </ArrivalDay>
            ))}
          </div>
          <div className="money-display-box">
            <p data-amount className={`money-display ${AMOUNT_IN_TITLE} tracking-[-0.02em]`} style={{ "--amount-chars": shown.length } as CSSProperties}>
              <ArrivalAmount from={LAST_VISIT.homeEuros} to={ACCOUNT.euros} symbol={ACCOUNT.symbol} />
            </p>
          </div>
        </section>
        <section className={CARD}>
          <p className={HELP}>A press, and the success of a press</p>
          <SuccessDemo label={FUND.check.putIt(TO_NOE.amount, TO_NOE.recipient)} />
          <button type="button" data-press-demo className={SECONDARY_BUTTON}>
            {HOME.takeItOut}
          </button>
        </section>
        <p className={HELP}>Scrolling: each card appears once as it comes into view</p>
        {["earned", "today", "toCome", "catchable"].map((state, index) => (
          <Reveal key={state} className={`${CARD} flex items-center gap-[var(--space-lg)]`}>
                          <Character state={state as "earned"} variant={index} className="h-auto w-[72px]" />
                        <p className={HELP}>A pointer hovering this character is looked at. A finger is not: a phone has no hover.</p>
          </Reveal>
        ))}
      </main>
      <ReplayArrival />
    </Arrival>
  );
}
