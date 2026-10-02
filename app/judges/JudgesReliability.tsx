import { daysSince, heldDays, passesSince, readingTotals, refusalsByCode } from "@/src/pass-log";
import { TITLE } from "../components/ui";

const HELP = "text-[length:var(--type-help)]";
const MUTED = "text-[length:var(--type-help)] text-[var(--muted)]";

const day = (at: Date) => at.toISOString().slice(0, 10);

/** A delay in the words a person uses, from seconds, without ever rounding a late run down to nothing. */
function delay(seconds: number): string {
  if (seconds < 60) return `${seconds} ${seconds === 1 ? "second" : "seconds"}`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

/** How late the runs of one plan actually began, which is the figure a pass mark would hide. */
function after(plan: { runs: number; soonestSeconds: number; latestSeconds: number }): string {
  if (plan.runs === 0) return "";
  if (plan.runs === 1 || plan.soonestSeconds === plan.latestSeconds) return `It began ${delay(plan.latestSeconds)} after its minute.`;
  return `They began between ${delay(plan.soonestSeconds)} and ${delay(plan.latestSeconds)} after that minute.`;
}

/**
 * The reliability figures, every one of them from a query against the journal each pass writes (U2, point 3), with
 * the refusals each reading met beside them (the audit of 18 Sep, gap a: a refusal that was not ours left no trace,
 * so a morning of three refused readings read as a silent one).
 *
 * Nothing on this page is estimated and nothing was filled in afterwards: before the journal existed, no pass left a
 * trace, so the figures start the day it was switched on and the page says which day that was. A pass that never ran
 * leaves no row at all, which is why the number of runs is shown beside the number of days elapsed rather than as a
 * percentage that would quietly turn a missed run into a good one.
 */
export async function JudgesReliability() {
  // A journal that cannot be read is said so here, and never takes the rest of the judges page down with it.
  const read = await Promise.all([passesSince(), readingTotals(), heldDays(), refusalsByCode()]).catch(() => null);
  if (!read) {
    return (
      <section className="space-y-[var(--space-sm)]">
        <h2 className={TITLE}>How reliable the readings are</h2>
        <p className={HELP}>
          The journal could not be read just now, so no figure is shown here rather than an old one.
        </p>
      </section>
    );
  }
  const [since, readings, held, refusals] = read;
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
      <p className={MUTED}>
        The hour, and not the minute, is what a run is held to here, because it is what the platform undertakes: on
        this plan Vercel &quot;may invoke these cron jobs at any point within the specified hour to help distribute load
        across all accounts&quot; (their documentation, read 19 September 2026). How long after its minute each pass
        actually began is said below, so the promise being kept never hides the delay.
      </p>
      <dl className="grid grid-cols-1 gap-x-[var(--space-md)] gap-y-[var(--space-xs)] [@media(min-width:600px)]:grid-cols-[18rem_1fr]">
        {since.plans.map((plan) => (
          <div key={plan.plan} className="contents">
            <dt className={MUTED}>
              {plan.plan === "counting"
                ? "Readings pass, just after midnight"
                : plan.plan === "recount"
                  ? "Second reading, before the catch-up window closes"
                  : "Settling pass, after the catch-up window"}
            </dt>
            <dd className={HELP}>
              {plan.runs} {plan.runs === 1 ? "run" : "runs"}, {plan.onTime} inside the hour the schedule names
              {elapsed === 0 ? "" : `, over ${elapsed} ${elapsed === 1 ? "day" : "days"}`}. {after(plan)} A run that
              never happened writes nothing, so a missing run shows here as a run fewer, never as a late one.
            </dd>
          </div>
        ))}
        <dt className={MUTED}>Readings asked of the source</dt>
        <dd className={HELP}>
          {readings.attempted} asked, {readings.succeeded} of which credited a day. A reading that finds the day&apos;s
          work not done yet answers perfectly well and credits nothing, so the second number is smaller than the first
          on any ordinary morning. A gift already counted today, finished, cancelled or not yet connected is not asked
          at all, and milestone readings run in their own pass: neither is in either number.
        </dd>
        <dt className={MUTED}>Refusals the readings met</dt>
        <dd className={HELP}>
          {refusals.length === 0 ? "None recorded yet." : `${refusals.map((refusal) => `${refusal.code} ${refusal.times}`).join(", ")}.`} These are
          the codes the contract and the sources answered with, counted as they came and not translated:
          &quot;NothingToCredit&quot; is the contract saying the day it was offered was already settled, and a code from a
          source is that source&apos;s own. A morning where nothing was credited is either a quiet morning or a morning
          of refusals, and this line is what tells the two apart.
        </dd>
        <dt className={MUTED}>Days held because a reading failed on our side</dt>
        <dd className={HELP}>
          {held.caughtUp + held.lost + held.open} held, {held.caughtUp} caught up later, {held.open} still open.
        </dd>
        <dt className={MUTED}>Days lost because of us</dt>
        <dd className={HELP}>
          {held.lost}. This is the measured number. What the code does: a reading that fails for a reason of ours is
          tried again at 03:30 UTC, and any working reading can still credit the day until its catch-up window closes,
          30 hours after the day ends (06:00 UTC). Past that hour the day goes back to the funder, whoever was at
          fault: the settling pass of 07:00 UTC sends it, and on the second version of the daily contract the next
          check-in settles it by itself. A failure of ours does not hold a day past its window. Only the owner pausing
          readings before that hour does, on the second version alone.
        </dd>
      </dl>
    </section>
  );
}
