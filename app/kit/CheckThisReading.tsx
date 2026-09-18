"use client";
import { useEffect, useState } from "react";
import { CARD, HELP } from "../components/ui";

/**
 * "Check this reading yourself", the milestone half of what a gift's page offers its two people (U2).
 *
 * A milestone gift settles on readings rather than on days, so the thing to hand over is a reading: the one that
 * recorded the start, and the one that reached the target and moved the money. The list comes from the public journal
 * (`/api/gift/<id>/journal`), which says which readings still have a proof kept; the proof itself is downloaded from
 * the route that answers only the funder and the recipient.
 */

type JournalReading = Readonly<{ id: number; purpose: string; outcome: string; attested: boolean; proofKept: boolean }>;

const WHAT_FOR: Record<string, string> = {
  start: "the reading that recorded the start",
  reach: "the reading sent to the contract",
  look: "a reading that only looked",
};

export function CheckThisReading({ giftId }: Readonly<{ giftId: string }>) {
  const [readings, setReadings] = useState<readonly JournalReading[]>([]);
  useEffect(() => {
    let wanted = true;
    // A reading is added when one is taken, so this is read once on arrival rather than watched: the page is
    // reloaded after a reading anyway, and a proof that is not there yet is simply not offered.
    fetch(`/api/gift/${giftId}/journal`, { headers: { accept: "application/json" } })
      .then((answer) => (answer.ok ? (answer.json() as Promise<{ readings?: JournalReading[] }>) : { readings: [] }))
      .then((body) => {
        if (wanted) setReadings(body.readings ?? []);
      })
      .catch(() => {});
    return () => {
      wanted = false;
    };
  }, [giftId]);
  const kept = readings.filter((reading) => reading.proofKept);
  if (kept.length === 0) return null;
  return (
    <details className={CARD}>
      <summary className="cursor-pointer font-medium">Check this reading yourself</summary>
      <p className={HELP}>
        Take a reading this gift rests on, and check it yourself: that the source itself answered it, that nobody
        rewrote it, and that the contract accepted that one answer, which can never be used twice.
      </p>
      <ul className={`${HELP} flex flex-wrap gap-[var(--space-md)]`}>
        {kept.map((reading) => (
          <li key={reading.id}>
            <a className="underline" href={`/api/gift/${giftId}/proof?reading=${reading.id}`} download={`viky-reading-${reading.id}.json`}>
              Reading {reading.id}, {WHAT_FOR[reading.purpose] ?? reading.purpose}
            </a>
          </li>
        ))}
      </ul>
      <p className={`${HELP} [overflow-wrap:anywhere]`}>
        Then, from a clone of Viky: pnpm verify:day --file viky-reading-&lt;number&gt;.json --gift {giftId} --reading
        &lt;number&gt;
      </p>
      <p className={HELP}>
        What it proves: the source itself answered that, and this gift was settled against that one answer. What it
        does not prove: who was at the keyboard. The account is tied to the person once, by the code placed in its
        name.
      </p>
    </details>
  );
}
