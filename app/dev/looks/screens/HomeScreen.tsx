import Link from "next/link";
import type { CSSProperties } from "react";
import { Arrival, ArrivalAmount, Reveal } from "@/app/kit/Motion";
import { Shell } from "@/app/kit/Shell";
import { AMOUNT_IN_TITLE, BODY, HELP, PRIMARY_BUTTON, SECONDARY_BUTTON, TITLE } from "@/app/components/ui";
import { HOME } from "@/src/sentences";
import { ACCOUNT, FROM_MAMAN, labHref, LAST_VISIT, TO_AMA } from "../example";
import { LAB } from "../words";
import { ExampleGiftCard } from "./parts";

/**
 * Home with two gifts (product structure, section 4): the money first and as the title, one primary action, the way
 * out, and what is moving. The amount is the symbol and the number on one line; "about", the rate's date and the
 * dollars are the caption under it (brief, section 8). Arriving here plays what changed since the last visit, the days on
 * the cards and then the amount (brief, section 6).
 */
export function HomeScreen({ look }: Readonly<{ look: string }>) {
  const shown = `${ACCOUNT.symbol}${ACCOUNT.euros.toFixed(2)}`;
  return (
    <Arrival
      storageKey={`viky.lab.${look}.home`}
      amount
      gifts={[
        { id: FROM_MAMAN.gift.giftId, days: FROM_MAMAN.days, lastSeen: LAST_VISIT.settledDays },
        { id: TO_AMA.gift.giftId, days: TO_AMA.days, lastSeen: LAST_VISIT.settledDays },
      ]}
    >
      <Shell kind="destination" active="home">
        <section className="lab-amount-box flex flex-col gap-[var(--space-xs)]">
          <h1 className={HELP}>{HOME.inAccount}</h1>
          <p data-amount className={`lab-amount ${AMOUNT_IN_TITLE} tracking-[-0.02em]`} style={{ "--amount-chars": shown.length } as CSSProperties}>
            <ArrivalAmount from={LAST_VISIT.homeEuros} to={ACCOUNT.euros} symbol={ACCOUNT.symbol} />
          </p>
          <p className={HELP}>{LAB.rateCaption(ACCOUNT.rateDate, ACCOUNT.dollars)}</p>
          <p className={HELP}>{HOME.keep}</p>
        </section>
        <Link href={labHref(look, "amount")} className={PRIMARY_BUTTON}>
          {HOME.offer}
        </Link>
        <Link href={labHref(look, "home")} className={SECONDARY_BUTTON}>
          {HOME.takeItOut}
        </Link>
        <section className="flex flex-col gap-[var(--space-md)]">
          <h2 className={TITLE}>{HOME.moving}</h2>
          <Reveal>
            <ExampleGiftCard gift={FROM_MAMAN.gift} days={FROM_MAMAN.days} href={labHref(look, "gift")} />
          </Reveal>
          <Reveal>
            <ExampleGiftCard gift={TO_AMA.gift} days={TO_AMA.days} href={labHref(look, "gift")} />
          </Reveal>
          <Link href={labHref(look, "home")} className={`${BODY} inline-flex min-h-[var(--tap-target)] items-center self-start text-[var(--accent-text)] underline`}>
            {HOME.seeAll}
          </Link>
        </section>
      </Shell>
    </Arrival>
  );
}
