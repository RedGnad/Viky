import { liveMilestonePassDeps, milestonePass, type MilestonePassDeps, type MilestonePassLine } from "./milestone-pass";
import { runMilestoneReading } from "./milestone-reading";

// The guard has a module of its own since other things are claimed with it too; its names are still read from here.
export { claimPass, configurePassGuard, ensurePassGuardSchema, lastGuardedPass } from "./pass-guard";

/**
 * A pass over the milestones still climbing every five minutes, called from outside by a free scheduler
 * (cron-job.org, the founder, 29 Sep 2026), so a target reached in the afternoon is told within minutes rather than at
 * the next nightly pass. It reads and tells, nothing else: settling and sending back stay with the two nightly passes.
 *
 * Its address is public and carries no secret, so it guards itself: at most one pass every four minutes, claimed in the
 * database so two instances cannot both run one, and a call in between does nothing. Four and not five: the scheduler
 * calls every five minutes and a call can arrive a little early, which a five-minute guard would drop, leaving every
 * gift read every ten. Gifts are read one after another,
 * never in parallel, which is how Chess.com asks to be read. What a reading reaches is told with the table that tells
 * each gift's news once (`claimTelling`).
 */

export const FREQUENT_PASS_EVERY_SECONDS = 4 * 60;
/** A gift read this recently, by its open page, is not read again by this pass; the last pass's reading is older. */
export const FREQUENT_PASS_RECENT_SECONDS = 4 * 60;

/** The pass itself: every milestone still climbing, read one after another, and what is reached told. */
export function frequentMilestonePass(deps: MilestonePassDeps = frequentPassDeps()): Promise<MilestonePassLine[]> {
  return milestonePass(false, deps);
}

function frequentPassDeps(): MilestonePassDeps {
  const live = liveMilestonePassDeps();
  return {
    ...live,
    // A look that fails costs no proof here: this pass comes back in five minutes (src/milestone-reading.ts).
    reach: (giftId) => runMilestoneReading({ giftId, purpose: "reach", recentSeconds: FREQUENT_PASS_RECENT_SECONDS, lookMustSucceed: true }),
    // Creations left half made are the nightly passes' to complete.
    completeCreations: undefined,
  };
}
