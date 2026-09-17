import { Arrival, ArrivalAmount } from "@/app/kit/Motion";
import { Shell } from "@/app/kit/Shell";
import { BODY, HELP, PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/app/components/ui";
import { DUOLINGO_DAILY } from "@/src/conditions";
import { GIFT_PAGE as W } from "@/src/sentences";
import { FROM_MAMAN, labHref, LAST_VISIT, MAMAN_RANGE } from "../example";
import { ExampleGiftCard, LargeStrip } from "./parts";

/**
 * A gift's page, read by the person it is for (flows R1 to R12, as app/components/GiftPage.tsx lays them out today),
 * with the large strip of characters where the page has its row of days. The card at its head carries no strip here:
 * the large one says it, once. Arriving here plays the days that changed since the last visit, then what is yours counts.
 */
export function GiftScreen({ look }: Readonly<{ look: string }>) {
  const { gift } = FROM_MAMAN;
  const words = DUOLINGO_DAILY.recipient;
  return (
    <Arrival storageKey={`viky.lab.${look}.gift`} amount gifts={[{ id: gift.giftId, days: FROM_MAMAN.days, lastSeen: LAST_VISIT.settledDays }]}>
      <Shell kind="task" back={labHref(look, "home")} backLabel={W.backToGifts} step={W.titleYours(gift.funderName, gift.amountDisplay)}>
        <ExampleGiftCard gift={gift} days={FROM_MAMAN.days} strip={false} />
        <button type="button" className={PRIMARY_BUTTON}>
          {W.take(gift.earnedDisplay)}
        </button>
        <section className="flex flex-col gap-[var(--space-sm)]">
          <p className={BODY}>{W.becomesYours(gift.perDayDisplay, words?.eachDayYours ?? "", MAMAN_RANGE)}</p>
          <p className={HELP}>{W.goesBackToThem(gift.perDayDisplay, gift.funderName)}</p>
        </section>
        <section className="flex flex-col gap-[var(--space-md)]">
          <div className="flex flex-col gap-[var(--space-xs)]">
            <p className="font-medium">{W.dayOf(5, gift.durationDays, MAMAN_RANGE)}</p>
            <p className={HELP}>
              {W.nextReading("tomorrow at 07:00")} {words?.reads ?? ""}
            </p>
          </div>
          <LargeStrip gift={gift.giftId} days={FROM_MAMAN.days} dates={FROM_MAMAN.dates} />
          <dl className="flex flex-col divide-y divide-[var(--divider)] border-y border-[var(--divider)]">
            <div className="flex items-baseline justify-between gap-[var(--space-md)] py-[var(--space-sm)]">
              <dt className={HELP}>{W.yoursSoFar}</dt>
              <dd className={`${BODY} text-right tabular-nums`}>
                <ArrivalAmount from={LAST_VISIT.yoursDollars} to={LAST_VISIT.yoursNow} symbol="$" />, {gift.creditedDays} days
              </dd>
            </div>
            <Total label={W.alreadyTaken} value="$0.00" />
            <Total label={W.backToFunder(gift.funderName)} value={W.amountDays(gift.returnedDisplay, gift.missedDays)} />
          </dl>
          {words ? <p className="font-medium">{words.catchUpYours("today at 23:59")}</p> : null}
          <button type="button" className={SECONDARY_BUTTON}>
            {W.countNow}
          </button>
        </section>
      </Shell>
    </Arrival>
  );
}

function Total({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex items-baseline justify-between gap-[var(--space-md)] py-[var(--space-sm)]">
      <dt className={HELP}>{label}</dt>
      <dd className={`${BODY} text-right tabular-nums`}>{value}</dd>
    </div>
  );
}
