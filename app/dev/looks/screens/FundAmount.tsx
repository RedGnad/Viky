import Link from "next/link";
import { Shell } from "@/app/kit/Shell";
import { CARD, FIELD, HELP, MONEY, PRIMARY_BUTTON } from "@/app/components/ui";
import { DUOLINGO_DAILY } from "@/src/conditions";
import { FUND } from "@/src/sentences";
import { labHref, TO_NOE } from "../example";

/**
 * One step of offering a gift, "How much, and for how long?" (flow F3, as app/components/FundGift.tsx lays it out):
 * two fields, what one day is worth, and Continue. A step where money is chosen: no character.
 */
export function FundAmount() {
  return (
    <Shell kind="task" back={labHref("home")} caption={FUND.step(4, 5)} step={FUND.amount.title}>
      <div className="flex flex-col gap-[var(--space-xl)]">
        <Field id="lab-dollars" label={FUND.amount.dollarsLabel} help={FUND.amount.dollarsHelp(undefined)} value={TO_NOE.amount.slice(1)} inputMode="decimal" />
        <Field id="lab-days" label={FUND.amount.daysLabel} help={FUND.amount.daysHelp} value={String(TO_NOE.days)} inputMode="numeric" />
        <section className={CARD}>
          <p className={HELP}>{DUOLINGO_DAILY.words.earnedDay}</p>
          <p className={MONEY}>{TO_NOE.perDay}</p>
          <p className={HELP}>{FUND.amount.missed}</p>
        </section>
        <Link href={labHref("review")} className={PRIMARY_BUTTON}>
          {FUND.continue}
        </Link>
      </div>
    </Shell>
  );
}

function Field({ id, label, help, value, inputMode }: Readonly<{ id: string; label: string; help: string; value: string; inputMode: "decimal" | "numeric" }>) {
  return (
    <div className="flex flex-col gap-[var(--space-xs)]">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      <p id={`${id}-help`} className={HELP}>
        {help}
      </p>
      <input id={id} defaultValue={value} inputMode={inputMode} aria-describedby={`${id}-help`} className={FIELD} />
    </div>
  );
}
