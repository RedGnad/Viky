"use client";
import { DAY_MARK, dayInWords, giftDays, type Day, type DayMark } from "@/src/day-states";
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
      {/* Seven to a row, sized so a whole week fits across the narrowest phone. These are not tap targets: a
          person reads them and cannot press them, so the 48 pixel floor does not apply and forcing it would
          push a week onto two lines for nothing. */}
      <ol className="grid grid-cols-7 gap-[var(--space-sm)]" aria-label="Every day of this gift">
        {days.map((day) => (
          <li
            key={day.dayNumber}
            aria-label={label(day, funder, nowMs)}
            title={label(day, funder, nowMs)}
            className={`flex aspect-square flex-col items-center justify-center rounded-[var(--radius-control)] border ${skin(day)}`}
          >
            <Mark shape={DAY_MARK[day.state]} />
            {/* In the text colour rather than the muted one, which falls below 4.5:1 on the brightest cells. */}
            <span aria-hidden className="text-[length:var(--type-help)] leading-[var(--type-help-leading)]">
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

/**
 * A state's mark, drawn in the cell's own text colour. It was a character until 15 Sep, and neither face the product
 * loads has those characters, so the phone's fonts drew them: three different ones on one row of seven days.
 */
function Mark({ shape }: Readonly<{ shape: DayMark }>) {
  return (
    <svg aria-hidden focusable="false" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      {shape === "full" ? <circle cx="8" cy="8" r="5" /> : null}
      {shape === "half" ? (
        <>
          <circle cx="8" cy="8" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 3.5a4.5 4.5 0 0 1 0 9Z" />
        </>
      ) : null}
      {shape === "ring" ? <circle cx="8" cy="8" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" /> : null}
      {shape === "diamond" ? <path d="M8 2.5 13.5 8 8 13.5 2.5 8Z" /> : null}
      {shape === "dot" ? <circle cx="8" cy="8" r="2" /> : null}
    </svg>
  );
}

function label(day: Day, funder: string, nowMs: number): string {
  const words = dayInWords(day, funder);
  return day.deadlineMs ? `${words}, until ${deadlineInWords(day.deadlineMs, nowMs)}` : words;
}

/**
 * A surface and an outline per state. The colour is the quick read and the mark beside it is the real one:
 * every published guideline says never to rely on hue alone, and every one of these surfaces carries the
 * appearance's own text at 4.5:1 or better, measured in test/design-tokens.test.ts.
 */
function skin(day: Day): string {
  switch (day.state) {
    case "settled":
      return "bg-[var(--day-settled)] border-[var(--control-border)]";
    case "catchable":
      return "bg-[var(--day-catchable)] border-2 border-[var(--text)]";
    case "aboutToReturn":
      return "bg-[var(--day-about-to-return)] border-dashed border-[var(--control-border)]";
    case "today":
      return "bg-[var(--day-today)] border-2 border-[var(--text)]";
    case "toCome":
      // A card's edge rather than a divider, so a day still to come is outlined like every other sticker in the poster
      // look; the calm look's card edge is that same divider.
      return "bg-[var(--day-to-come)] border-[var(--card-border)]";
  }
}
