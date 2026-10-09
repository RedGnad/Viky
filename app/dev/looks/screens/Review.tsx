import Link from "next/link";
import { Shell } from "@/app/kit/Shell";
import { BODY, HELP, PRIMARY_BUTTON } from "@/app/components/ui";
import { DUOLINGO_DAILY } from "@/src/conditions";
import { FUND as W } from "@/src/sentences";
import { labHref, TO_NOE } from "../example";

/**
 * "Check this over" (flow F4, as app/components/FundGift.tsx lays it out): what the person is about to confirm, row by
 * row, and one button. A screen where a sum is confirmed stays bare: never a character here (brief, section 5).
 */
export function Review() {
  const link = DUOLINGO_DAILY.link;
  const rows: Array<{ label: string; value: string; change: boolean }> = [
    { label: W.check.rows.for, value: TO_NOE.recipient, change: true },
    { label: W.check.rows.from, value: TO_NOE.funder, change: true },
    { label: W.check.rows.what, value: DUOLINGO_DAILY.name, change: true },
    ...(link?.kind === "username" ? [{ label: link.row, value: TO_NOE.username, change: true }] : []),
    { label: W.check.rows.goes, value: TO_NOE.amount, change: true },
    { label: W.check.rows.dayEarned, value: W.check.dayEarned(TO_NOE.perDay, true, TO_NOE.days), change: true },
    ...(DUOLINGO_DAILY.target ? [{ label: W.check.rows.dayCounts, value: DUOLINGO_DAILY.target.inWords(TO_NOE.target), change: true }] : []),
    { label: W.check.rows.firstDay, value: W.check.firstDay(DUOLINGO_DAILY.source), change: false },
    { label: W.check.rows.ends, value: W.check.ends(TO_NOE.days), change: true },
  ];
  return (
    <Shell kind="task" back={labHref("amount")} caption={W.step(5, 5)} step={W.check.title}>
      <dl className="flex flex-col divide-y divide-[var(--divider)] border-y border-[var(--divider)]">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start justify-between gap-[var(--space-md)] py-[var(--space-md)]">
            <div className="flex min-w-0 flex-col gap-[var(--space-xs)]">
              <dt className={HELP}>{row.label}</dt>
              <dd className={`${BODY} break-words`}>{row.value}</dd>
            </div>
            {row.change ? (
              <button type="button" className="inline-flex min-h-[var(--tap-target)] shrink-0 items-center text-[length:var(--type-help)] text-[var(--accent-text)] underline">
                {W.change}
                <span className="sr-only"> {row.label.toLowerCase()}</span>
              </button>
            ) : null}
          </div>
        ))}
      </dl>
      <section className="flex flex-col gap-[var(--space-sm)]">
        <p className={BODY}>{W.check.missed(TO_NOE.settlingTime)}</p>
        <p className={BODY}>{W.check.namesSeen(TO_NOE.recipient, TO_NOE.funder)}</p>
        <p className="font-medium">{W.check.linkRisk(TO_NOE.recipient)}</p>
        <p className={BODY}>{W.check.fourteenDays}</p>
      </section>
      <p className={HELP}>{W.check.fromAccount(TO_NOE.held)}</p>
      <div className="flex flex-col gap-[var(--tap-gap)]">
        <Link href={labHref("gift")} className={PRIMARY_BUTTON}>
          {W.check.putIt(TO_NOE.amount, TO_NOE.recipient)}
        </Link>
        <Link href={labHref("home")} className={`${HELP} inline-flex min-h-[var(--tap-target)] items-center self-start underline`}>
          {W.notNow}
        </Link>
      </div>
    </Shell>
  );
}
