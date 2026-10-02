import Link from "next/link";
import { Character } from "@/app/kit/Character";
import { Reveal, Success } from "@/app/kit/Motion";
import { Shell } from "@/app/kit/Shell";
import { BODY, CARD, HELP, PRIMARY_BUTTON, SECONDARY_BUTTON, TITLE } from "@/app/components/ui";
import { DUOLINGO_DAILY } from "@/src/conditions";
import { FUND as W } from "@/src/sentences";
import { labHref, TO_NOE } from "../example";

/**
 * The gift is made (flow F10, as app/components/FundGift.tsx lays it out). The press on "Put it in their name" brought
 * the person here, and the gift character answers that gesture once (brief, section 6); then the terms, the link to
 * send and what happens next.
 */
export function Made() {
  const condition = DUOLINGO_DAILY;
  return (
    <Shell kind="task" back={labHref("home")} backLabel={W.backToGifts} backFollows step={W.made.title(TO_NOE.amount, TO_NOE.recipient)}>
      <Success>
                  <Character drawn="inline" state="gift" className="h-auto w-[120px] self-center" />
              </Success>
      <section className="flex flex-col gap-[var(--space-sm)]">
        <p className={BODY}>{W.made.firstDay(condition.source)}</p>
        <p className={HELP}>{W.made.reference(TO_NOE.made, TO_NOE.giftId)}</p>
      </section>
      <section className={CARD}>
        <h2 className={TITLE}>{W.made.linkTitle}</h2>
        <p className="select-all break-all rounded-[var(--radius-control)] border-[length:var(--card-border-width)] border-[var(--card-border)] bg-[var(--background)] p-[var(--space-md)] text-[length:var(--type-help)]">
          {TO_NOE.link}
        </p>
        <button type="button" className={PRIMARY_BUTTON}>
          {W.made.copy}
        </button>
        <p className={HELP}>{W.made.onlyThem(TO_NOE.recipient)}</p>
      </section>
      <Reveal className="flex flex-col gap-[var(--space-md)]">
        <h2 className={TITLE}>{W.made.nextTitle}</h2>
        <ol className={`flex list-decimal flex-col gap-[var(--space-sm)] pl-[var(--space-lg)] ${BODY}`}>
          {W.made.next(TO_NOE.recipient, condition.words.theyConnect ?? W.made.theyConnectAny, condition.words.eachDay ?? "", TO_NOE.perDay, TO_NOE.settlingTime).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
      </Reveal>
      <Link href={labHref("gift")} className={SECONDARY_BUTTON}>
        {W.made.seeIt}
      </Link>
    </Shell>
  );
}
