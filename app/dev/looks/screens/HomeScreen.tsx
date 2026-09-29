"use client";
import Link from "next/link";
import type { CSSProperties } from "react";
import { useMinute } from "@/app/kit/clock";
import { charactersOf } from "@/app/kit/DayStrip";
import { GiftCard } from "@/app/kit/GiftCard";
import { Arrival, ArrivalAmount, Reveal, type ArrivalGift } from "@/app/kit/Motion";
import { Shell } from "@/app/kit/Shell";
import { AMOUNT_IN_TITLE, BODY, HELP, PRIMARY_BUTTON, SECONDARY_BUTTON, TITLE } from "@/app/components/ui";
import { HOME } from "@/src/sentences";
import { ACCOUNT, fromMaman, labHref, LAST_VISIT, rateDate, toAma } from "../example";
import { LAB } from "../words";

/**
 * Home with two gifts (product structure, section 4): the money first and as the title, one primary action, the way
 * out, and what is moving. The amount is the symbol and the number on one line; "about", the rate's date and the
 * dollars are the caption under it (brief, section 8). Arriving here plays what changed since the last visit, the days
 * on the cards and then the amount (brief, section 6).
 */
export function HomeScreen() {
  const nowMs = useMinute();
  const shown = `${ACCOUNT.symbol}${ACCOUNT.euros.toFixed(2)}`;
  const gifts = [fromMaman(nowMs), toAma(nowMs)];
  const arriving: ArrivalGift[] = gifts.map((gift) => ({
    id: gift.giftId,
    days: charactersOf(gift, gift.catchUpSeconds, nowMs, gift.days),
    lastSeen: LAST_VISIT.settledDays,
  }));
  return (
    <Arrival storageKey="viky.lab.home" amount gifts={arriving}>
      <Shell kind="destination" active="home">
        <section className="money-display-box flex flex-col gap-[var(--space-xs)]">
          <h1 className={HELP}>{HOME.inAccount}</h1>
          <p data-amount className={`money-display ${AMOUNT_IN_TITLE} tracking-[-0.02em]`} style={{ "--amount-chars": shown.length } as CSSProperties}>
            <ArrivalAmount from={LAST_VISIT.homeEuros} to={ACCOUNT.euros} symbol={ACCOUNT.symbol} />
          </p>
          {/* Zero is "no clock yet" (app/kit/clock.ts): a rate dated from it would name a day in 1970. */}
          {nowMs === 0 ? null : <p className={HELP}>{LAB.rateCaption(rateDate(nowMs), ACCOUNT.dollars)}</p>}
        </section>
        <Link href={labHref("amount")} className={PRIMARY_BUTTON}>
          {HOME.offer}
        </Link>
        <Link href={labHref("home")} className={SECONDARY_BUTTON}>
          {HOME.takeItOut}
        </Link>
        <section className="flex flex-col gap-[var(--space-md)]">
          <h2 className={TITLE}>{HOME.moving}</h2>
          {gifts.map((gift) => (
            <Reveal key={gift.giftId}>
              <GiftCard gift={gift} />
            </Reveal>
          ))}
          <Link href={labHref("home")} className={`${BODY} inline-flex min-h-[var(--tap-target)] items-center self-start text-[var(--accent-text)] underline`}>
            {HOME.seeAll}
          </Link>
        </section>
      </Shell>
    </Arrival>
  );
}
