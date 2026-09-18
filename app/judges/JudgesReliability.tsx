import { daysSince, heldDays, passesSince, readingTotals } from "@/src/pass-log";
import { TITLE } from "../components/ui";

const HELP = "text-[length:var(--type-help)]";
const MUTED = "text-[length:var(--type-help)] text-[var(--muted)]";

const day = (at: Date) => at.toISOString().slice(0, 10);

/**
 * The reliability figures, every one of them from a query against the journal each pass writes (U2, point 3).
 *
 * Nothing on this page is estimated and nothing was filled in afterwards: before the journal existed, no pass left a
 * trace, so the figures start the day it was switched on and the page says which day that was. A pass that never ran
 * leaves no row at all, which is why the number of runs is shown beside the number of days elapsed rather than as a
 * percentage that would quietly turn a missed run into a good one.
 */
export async function JudgesReliability() {
  const [since, readings, held] = await Promise.all([passesSince(), readingTotals(), heldDays()]);
  if (!since.firstPassAt) {
    return (
      <section className="space-y-[var(--space-sm)]">
        <h2 className={TITLE}>How reliable the readings are</h2>
        <p className={HELP}>
          The journal is in place and empty: no pass has run since it was switched on, so there is nothing to show yet.
          Every figure here comes from that journal, so none can appear before a pass has written one.
        </p>
      </section>
    );
  }
  const elapsed = daysSince(since.firstPassAt);
  return (
    <section className="space-y-[var(--space-sm)]">
      <h2 className={TITLE}>How reliable the readings are</h2>
      <p className={HELP}>
        Since {day(since.firstPassAt)}, the day each pass started writing a record of itself, which is{" "}
        {elapsed === 0 ? "today" : `${elapsed} ${elapsed === 1 ? "day" : "days"} ago`}. Passes before that day left no
        trace, so they are not counted here, and nothing has been filled in for them.
      </p>
      <dl className="grid grid-cols-1 gap-x-[var(--space-md)] gap-y-[var(--space-xs)] [@media(min-width:600px)]:grid-cols-[18rem_1fr]">
        {since.plans.map((plan) => (
          <div key={plan.plan} className="contents">
            <dt className={MUTED}>
              {plan.plan === "counting" ? "Readings pass, just after midnight" : "Settling pass, after the catch-up window"}
            </dt>
            <dd className={HELP}>
              {plan.runs} {plan.runs === 1 ? "run" : "runs"}, {plan.onTime} within a quarter of an hour of the scheduled
              minute{elapsed === 0 ? "" : `, over ${elapsed} ${elapsed === 1 ? "day" : "days"}`}. A run that never
              happened writes nothing, so a missing run shows here as a run fewer, never as a late one.
            </dd>
          </div>
        ))}
        <dt className={MUTED}>Readings asked of the source</dt>
        <dd className={HELP}>
          {readings.attempted} asked, {readings.succeeded} answered and counted. A gift already counted today, finished,
          cancelled or not yet connected is not asked at all, so it is in neither number, and milestone readings run in
          their own pass and are in neither either.
        </dd>
        <dt className={MUTED}>Days held because a reading failed on our side</dt>
        <dd className={HELP}>
          {held.caughtUp + held.lost + held.open} held, {held.caughtUp} caught up later, {held.open} still open.
        </dd>
        <dt className={MUTED}>Days lost because of us</dt>
        <dd className={HELP}>
          {held.lost}. The rule in the code is that this is zero: a reading that fails for a reason of ours holds the
          gift instead of draining it, and the next working reading can still credit the day. This is the measured
          number, not the rule.
        </dd>
      </dl>
    </section>
  );
}
