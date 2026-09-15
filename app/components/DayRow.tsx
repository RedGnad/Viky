"use client";
import { DAY_MARK, dayInWords, giftDays, type Day } from "@/src/day-states";
import { deadlineInWords } from "@/src/catch-up";
import { HELP, MONEY } from "./ui";

/**
 * Every day of the gift at a glance, which is what a person opens Viky to see.
 *
 * Read from stickK's coloured calendar and Greenlight's paid, pending, to-do bar, both of which put a whole
 * commitment in one row. Two rules from the research shape how it is drawn: colour is never the only carrier,
 * so each state has a mark of its own and a name a screen reader reads, and today is marked, because a person
 * on day three reading "1 of 7 done, 0 missed" concluded the product was broken (D50).
 *
 * What it does not do is say which settled day was earned and which came back. The contract publishes those
 * as totals and settles days in order, so the counts do not determine the sequence (src/day-states.ts). The
 * totals are printed beside the row instead, and the split waits for the event index.
 */
export function DayRow({
  gift,
  catchUpSeconds,
  nowMs,
  readerIsRecipient,
  earnedDisplay,
  returnedDisplay,
}: Readonly<{
  gift: { startDay: number; endDay: number; durationDays: number; creditedDays: number; missedDays: number };
  catchUpSeconds: number;
  /** Zero until the browser has a clock, so the server and the first paint agree. */
  nowMs: number;
  /**
   * Whether the person reading is the one the gift is for. Named in full rather than as `theirs`, which in
   * the page around this means the opposite: there, the gift is theirs and the reader is the funder. Two
   * screens have already shown the wrong side of a gift to the wrong person (D39), and a boolean whose name
   * can be read either way is how that happens.
   */
  readerIsRecipient: boolean;
  earnedDisplay: string;
  returnedDisplay: string;
}>) {
  if (nowMs === 0) return null;
  const { days, earned, returned } = giftDays(gift, catchUpSeconds, nowMs);
  if (days.length === 0) return null;

  // No first name is collected anywhere, from either side, so the funder cannot be named yet. "Returned to
  // Ama" is what D58 asks for and this is as close as the data allows; naming them needs a name.
  const funder = readerIsRecipient ? "the person who sent it" : "you";

  return (
    <section className="flex flex-col gap-[var(--space-md)]">
      <ol className="flex flex-wrap gap-[var(--space-sm)]" aria-label="Every day of this gift">
        {days.map((day) => (
          <li
            key={day.dayNumber}
            aria-label={label(day, funder, nowMs)}
            title={label(day, funder, nowMs)}
            className={`flex min-h-[var(--tap-target)] min-w-[var(--tap-target)] flex-col items-center justify-center rounded-[var(--radius-control)] border ${outline(day)}`}
          >
            <span aria-hidden className="text-[length:var(--type-body)] leading-none">
              {DAY_MARK[day.state]}
            </span>
            <span aria-hidden className={HELP}>
              {day.number}
            </span>
          </li>
        ))}
      </ol>

      <dl className="flex flex-wrap gap-x-[var(--space-xl)] gap-y-[var(--space-sm)]">
        <div>
          <dt className={HELP}>{readerIsRecipient ? "Yours so far" : "Theirs so far"}</dt>
          <dd className={MONEY}>{earnedDisplay}</dd>
          <dd className={HELP}>
            {earned} {earned === 1 ? "day" : "days"} earned
          </dd>
        </div>
        <div>
          <dt className={HELP}>{readerIsRecipient ? "Gone back" : "Came back to you"}</dt>
          <dd className={MONEY}>{returnedDisplay}</dd>
          <dd className={HELP}>
            {returned} {returned === 1 ? "day" : "days"} missed
          </dd>
        </div>
      </dl>
    </section>
  );
}

function label(day: Day, funder: string, nowMs: number): string {
  const words = dayInWords(day, funder);
  return day.deadlineMs ? `${words}, until ${deadlineInWords(day.deadlineMs, nowMs)}` : words;
}

/** The outline carries the state as well as the mark, and never the colour on its own. */
function outline(day: Day): string {
  switch (day.state) {
    case "settled":
      return "border-[var(--control-border)]";
    case "catchable":
      return "border-2 border-[var(--accent)]";
    case "aboutToReturn":
      return "border-dashed border-[var(--control-border)]";
    case "today":
      return "border-2 border-[var(--text)]";
    case "toCome":
      return "border-[var(--divider)]";
  }
}
