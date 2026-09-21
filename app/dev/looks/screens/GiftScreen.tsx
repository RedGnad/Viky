"use client";
import { useMinute } from "@/app/kit/clock";
import { DayRow } from "@/app/kit/DayRow";
import { charactersOf } from "@/app/kit/DayStrip";
import { GiftCard } from "@/app/kit/GiftCard";
import { Arrival, ArrivalAmount } from "@/app/kit/Motion";
import { HeadCharacter } from "@/app/kit/HeadCharacter";
import { Shell } from "@/app/kit/Shell";
import { BODY, HELP, PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/app/components/ui";
import { catchUpDay } from "@/src/catch-up";
import { DUOLINGO_DAILY } from "@/src/conditions";
import { contractRangeInWords, momentInWords, nextPassMs } from "@/src/moments";
import { COUNTING_PASS_UTC } from "@/src/pass-schedule";
import { GIFT_PAGE as W } from "@/src/sentences";
import { fromMaman, labHref, LAST_VISIT } from "../example";

/**
 * A gift's page, read by the person it is for (flows R1 to R12, as app/components/GiftPage.tsx lays them out), with the
 * product's own row of days. The card at its head stands still, so the row below says the days once. Arriving here
 * plays the days that changed since the last visit, then what is yours counts.
 */
export function GiftScreen() {
  const nowMs = useMinute();
  const gift = fromMaman(nowMs);
  const words = DUOLINGO_DAILY.recipient;
  // Zero is "no clock yet" (app/kit/clock.ts), and a date drawn from it would be a day in 1970: nothing dated is said.
  const range = nowMs === 0 ? null : contractRangeInWords(gift.startDay, gift.endDay);
  const dayOfGift = Math.floor(nowMs / 86_400_000) - gift.startDay + 1;
  const catchUp = nowMs === 0 ? undefined : catchUpDay(gift, gift.catchUpSeconds, nowMs);
  const days = charactersOf(gift, gift.catchUpSeconds, nowMs, gift.days);
  return (
    <Arrival storageKey="viky.lab.gift" amount gifts={[{ id: gift.giftId, days, lastSeen: LAST_VISIT.settledDays }]}>
      <Shell kind="task" back={labHref("home")} backLabel={W.backToGifts} step={W.titleYours(gift.funderName, gift.amountDisplay)} character={<HeadCharacter />}>
        <GiftCard gift={gift} still />
        <button type="button" className={PRIMARY_BUTTON}>
          {W.take(gift.earnedDisplay)}
        </button>
        <section className="flex flex-col gap-[var(--space-sm)]">
          {range === null ? null : <p className={BODY}>{W.becomesYours(gift.perDayDisplay, words?.eachDayYours ?? "", range)}</p>}
          <p className={HELP}>{W.goesBackToThem(gift.funderName)}</p>
        </section>
        <section className="flex flex-col gap-[var(--space-md)]">
          <div className="flex flex-col gap-[var(--space-xs)]">
            {range === null ? null : <p className="font-medium">{W.dayOf(dayOfGift, gift.durationDays, range)}</p>}
            {nowMs === 0 ? null : (
              <p className={HELP}>
                {W.nextReading(momentInWords(nextPassMs(COUNTING_PASS_UTC, nowMs), nowMs))} {words?.reads ?? ""}
              </p>
            )}
          </div>
          <DayRow id={gift.giftId} gift={gift} catchUpSeconds={gift.catchUpSeconds} records={gift.days} voice="recipient" />
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
          {words && catchUp ? <p className="font-medium">{words.catchUpYours(momentInWords(catchUp.deadlineMs, nowMs))}</p> : null}
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
