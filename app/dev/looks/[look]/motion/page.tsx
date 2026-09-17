import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Character } from "@/app/kit/Character";
import { Arrival, ArrivalAmount, ArrivalDay, Gaze, Reveal } from "@/app/kit/Motion";
import { AMOUNT_IN_TITLE, CARD, HELP, SECONDARY_BUTTON, TITLE } from "@/app/components/ui";
import { FUND, HOME } from "@/src/sentences";
import { ACCOUNT, FROM_MAMAN, LAST_VISIT, TO_NOE } from "../../example";
import { forcedAppearance, requireLab } from "../../lab";
import { LAB_METADATA, LabFrame } from "../../LabFrame";
import { lookById } from "../../look-css";
import { ReplayArrival } from "../../ReplayArrival";
import { SuccessDemo } from "../../SuccessDemo";
import { LAB } from "../../words";

export const metadata: Metadata = { ...LAB_METADATA, title: "Looks laboratory, motion (dev)" };

type Props = Readonly<{ params: Promise<{ look: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }>;

/**
 * The motion of the brief (section 6) in one look, on one page, so it can be watched and recorded. Every movement here
 * answers a gesture, as in the product: arriving on the page plays what changed since the last visit, "Replay arrival"
 * plays it again, a press answers the press, the success of a press brings the gift, scrolling reveals what comes into
 * view once, and a pointer hovering a character or a button is answered. Under reduced motion none of it moves.
 */
export default async function Page({ params, searchParams }: Props) {
  await requireLab();
  const { look: lookId } = await params;
  const look = lookById(lookId);
  if (!look) notFound();
  const appearance = forcedAppearance((await searchParams).appearance);
  const shown = `${ACCOUNT.symbol}${ACCOUNT.euros.toFixed(2)}`;
  const gift = FROM_MAMAN.gift.giftId;
  return (
    <LabFrame look={look} appearance={appearance}>
      <Arrival storageKey={`viky.lab.${look.id}.motion`} amount gifts={[{ id: gift, days: FROM_MAMAN.days.slice(0, 5), lastSeen: LAST_VISIT.settledDays }]}>
        <main className="mx-auto flex w-full max-w-[var(--app-column-max)] flex-col gap-[var(--space-lg)] px-[var(--page-margin)] py-[var(--space-lg)]">
          <h1 className={`${TITLE} pr-[148px]`}>
            {LAB.motion}: {look.number}. {look.name}
          </h1>
          <section className={CARD}>
            <p className={HELP}>Arriving: the days that changed since the last visit, then the amount</p>
            <div className="grid grid-cols-5 gap-[var(--space-sm)]">
              {FROM_MAMAN.days.slice(0, 5).map((state, index) => (
                <ArrivalDay key={index} gift={gift} index={index}>
                  <Gaze>
                    <Character state={state} variant={index} className="h-auto w-full" />
                  </Gaze>
                </ArrivalDay>
              ))}
            </div>
            <div className="lab-amount-box">
              <p data-amount className={`lab-amount ${AMOUNT_IN_TITLE} tracking-[-0.02em]`} style={{ "--amount-chars": shown.length } as CSSProperties}>
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
              <Gaze>
                <Character state={state as "earned"} variant={index} className="h-auto w-[72px]" />
              </Gaze>
              <p className={HELP}>A pointer hovering this character is looked at. A finger is not: a phone has no hover.</p>
            </Reveal>
          ))}
        </main>
        <ReplayArrival />
      </Arrival>
    </LabFrame>
  );
}
