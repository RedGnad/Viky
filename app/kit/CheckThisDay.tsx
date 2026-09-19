"use client";
import { HELP } from "../components/ui";
import { dateOfDay } from "@/src/day-record";

/**
 * "Check this day yourself", for the two people a gift is between (U2).
 *
 * It hands over the proof of one credited day, which is the thing Viky never publishes: it carries the account's name,
 * its display name and its points. From it, one command re-verifies the day against Reclaim's attestor and against the
 * chain, with no key and no account. The sentence under it says what a pass proves and what it does not, because a
 * proof that is read as more than it is would be worse than none.
 */

export function CheckThisDay({ giftId, days }: Readonly<{ giftId: string; days: readonly { day: number; outcome: "earned" | "returned" }[] }>) {
  const earned = days.filter((day) => day.outcome === "earned");
  if (earned.length === 0) return null;
  return (
    <details>
      <summary className="cursor-pointer underline underline-offset-[3px]">Check this day yourself</summary>
      <p className={HELP}>
        Take the reading behind a day that counted, and check it yourself: that the source answered it, that nobody
        rewrote it, and that this gift was settled against that one answer, which can never be used twice.
      </p>
      <ul className={`${HELP} flex flex-wrap gap-[var(--space-md)]`}>
        {earned.map((day) => (
          <li key={day.day}>
            <a className="underline" href={`/api/gift/${giftId}/proof?day=${day.day}`} download={`viky-day-${day.day}.json`}>
              {dateOfDay(day.day)}
            </a>
          </li>
        ))}
      </ul>
      <p className={`${HELP} [overflow-wrap:anywhere]`}>
        Then, from a clone of Viky: pnpm verify:day --file viky-day-&lt;day&gt;.json --gift {giftId} --day &lt;day&gt;
      </p>
      <p className={HELP}>
        What it proves: the source itself answered that, and this gift counted that day against that one answer. What it
        does not prove: who was holding the phone. The account is tied to the person once, by the code placed in its
        name or by the person who offered the gift naming it.
      </p>
    </details>
  );
}
