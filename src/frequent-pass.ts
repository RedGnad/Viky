import { readAsTheDayGoes, readDailyGift } from "./daily-count";
import type { PublicCheckInOutcome } from "./duolingo-public-checkin";
import { loadBoundGifts, type GiftRecord } from "./gift-store";
import { liveMilestonePassDeps, milestonePass, type MilestonePassDeps, type MilestonePassLine } from "./milestone-pass";
import { isMilestoneGiftId } from "./milestone-protocol";
import { runMilestoneReading } from "./milestone-reading";
import { RelayerError } from "./relayer";

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

/**
 * The same for the daily gifts read as the day goes (src/daily-count.ts, the founder, 3 Oct 2026): on the third daily
 * contract a reading pays its own day, so a lesson done at noon is paid within the quarter of an hour rather than at
 * the next night's pass. Every quarter of an hour, each such gift is looked at plainly, which costs nothing, and an
 * attested reading is taken only for a lesson the look saw: one proof for a day credited, none for a day without a
 * lesson, none when the look fails. It reads and credits, nothing else: settling, sending back and the reading
 * without a look stay with the nightly passes, and a day it credits is told as any credited day is (src/gift-relay.ts).
 *
 * It has no address of its own. The scheduler's one call every five minutes (`/api/cron/milestones`) claims it under
 * its own guard, fourteen minutes: a call can arrive a little early, which a guard of fifteen would drop.
 */
export const FREQUENT_DAILY_PASS_EVERY_SECONDS = 14 * 60;

export type FrequentDailyLine = Readonly<{ giftId: string; result: string }>;

export type FrequentDailyDeps = Readonly<{
  /** Every connected daily gift; the pass keeps those read as the day goes. */
  gifts: () => Promise<ReadonlyArray<Pick<GiftRecord, "giftId" | "escrow" | "goalType">>>;
  count: (giftId: string) => Promise<PublicCheckInOutcome>;
}>;

const liveFrequentDailyDeps: FrequentDailyDeps = {
  gifts: loadBoundGifts,
  count: (giftId) => readDailyGift({ giftId, purpose: "count", onlyOnALook: true }),
};

function dailyLine(outcome: PublicCheckInOutcome): string {
  switch (outcome.kind) {
    case "counted":
      return `counted, ${outcome.creditedDays} day(s) credited`;
    case "refused":
      return `${outcome.looked ? "looked" : "refused"}: ${outcome.code}`;
    case "already":
      return `skipped: ${outcome.reason}`;
    default:
      return outcome.kind;
  }
}

/** The pass itself: one gift after another, and a gift whose reading fails is one line, never the end of the pass. */
export async function frequentDailyPass(deps: FrequentDailyDeps = liveFrequentDailyDeps): Promise<FrequentDailyLine[]> {
  const lines: FrequentDailyLine[] = [];
  for (const record of await deps.gifts()) {
    if (isMilestoneGiftId(record.giftId) || !readAsTheDayGoes(record)) continue;
    try {
      lines.push({ giftId: record.giftId, result: dailyLine(await deps.count(record.giftId)) });
    } catch (error) {
      // What every later relay would meet as well ends the pass: the relayer below its reserve, or not set up.
      if (error instanceof RelayerError && (error.code === "RESERVE_TOO_LOW" || error.code === "WRONG_CHAIN" || error.code === "NOT_CONFIGURED")) throw error;
      lines.push({ giftId: record.giftId, result: `failed: ${error instanceof Error ? error.message.slice(0, 120) : String(error)}` });
    }
  }
  return lines;
}
