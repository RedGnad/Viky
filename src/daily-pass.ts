import type { Hex } from "viem";
import { retireExpiredExits } from "./exit-store";
import { readDailyGift } from "./daily-count";
import { connectedLineOf } from "./connected-checkin";
import type { PublicCheckInOutcome } from "./duolingo-public-checkin";
import { completePendingCreations, type CreationLine } from "./gift-creation";
import { liveCreationDeps } from "./gift-creation-live";
import { erasureLine } from "./gift-end-erasure";
import { readGift, utcDayOf, type GiftState } from "./gift-reader";
import { relayDrain, relayFinalise, relayRefund } from "./gift-relay";
import { loadAllGifts, loadBoundGifts } from "./gift-store";
import { milestonePass } from "./milestone-pass";
import { isMilestoneGiftId } from "./milestone-protocol";
import { catchUpSecondsOf } from "./catch-up";
import { countingSince, recordPass, type CountingLeft, type NewPass, type PassHold, type PassPlanName } from "./pass-log";
import { gatheringNotes } from "./pass-notes";
import { escrowOf, relayerClients, relayerPreflight, RelayerError } from "./relayer";
import { dailyAbiOf } from "./v2";
import { watchAtPassStart, type RelayerAtStart, type WatchLine } from "./watch";

/**
 * The keeper's pass (D27): read every bound gift from its public profile and credit what is owed, then
 * settle the days whose catch-up window has closed, finalise gifts that are over, and send back what a
 * missed day freed. Every line of the report is one relayed transaction, a typed refusal, or a skip with
 * its reason; nothing is silent.
 *
 * It runs twice a day and the split matters (D35). Counting runs just after midnight UTC so a reading
 * credits everything earned up to the end of yesterday, as late as a recipient can legitimately be.
 * Settling cannot run then: a day only becomes drainable six hours later (D30), so draining at midnight
 * would leave it open another whole day and the next morning's reading could pay for a day whose catch-up
 * had expired. The second pass settles at the moment D13 allows, without making counting less forgiving.
 *
 * And a third run reads again (the audit of 1 Oct 2026). A reading that failed on our side at half past midnight was
 * the last automatic chance for the day before yesterday: at 06:00 its catch-up window closes and at 07:00 the
 * settling pass sends it back. So at 03:30 the gifts the counting pass held are read once more, while that day can
 * still be paid; and if the counting pass left no row at all, or stopped part way, the whole reading pass is run.
 * Reading again inside the settling pass would be of no use: every check-in drains the expired days first.
 *
 * A reading looks plainly before it pays for a proof, and a look that failed takes none (src/daily-look.ts): the gift
 * is held, and read again at 03:30. That second reading is the only one that may go without a look, and only for a
 * gift whose oldest open day closes at 06:00 that morning: its last chance, once.
 */

export type DailyPassLine = { giftId: string; step: "create" | "count" | "drain" | "finalise" | "refund" | "read" | "expire" | "review" | "retire" | "erase"; result: string; hash?: string };

/**
 * Refusals that say something broke on our side rather than something the person did. A reading refused for
 * one of these is no evidence at all, so nothing may be settled against it.
 *
 * Deliberately not here: a profile that turned private, a name that no longer resolves, a code that is not
 * in the display name. Those are real answers about the person's own account, and holding the gift open for
 * them would let anyone stop the clock by hiding their profile.
 */
const OURS_TO_FIX: ReadonlySet<string> = new Set([
  "FETCH_FAILED",
  "PROOF_INVALID",
  "PROOF_MISMATCH",
  "NOT_CONFIGURED",
  // The worker runs other sources than this build (src/attested-read.ts): every attested reading is refused until it
  // is redeployed, which is nothing the person did.
  "WORKER_OUT_OF_DATE",
  // A connected source that did not answer the token refresh (src/strava.ts, src/fitbit.ts): an outage of theirs or
  // a limit we met, not a connection the person took back.
  "REFRESH_UNAVAILABLE",
  // The month's limit of attested readings is reached (src/attested-calls.ts): no reading was taken, so nothing is
  // settled against it, and the person reads why on the gift's page.
  "LIMIT_REACHED",
  // A day's ceiling of attested readings is reached (the breaker of src/attested-calls.ts): no reading was taken
  // either, and it resumes the next UTC day.
  "CEILING_REACHED",
  // A reading that threw instead of answering (see `counted` below).
  "READING_FAILED",
]);

/** Which of the pass's jobs a run does. Named, so the schedules cannot drift apart by accident. */
export type PassPlan = Readonly<{
  name: PassPlanName;
  count: boolean;
  refund: boolean;
  /** The only gifts the run is about, when it is not about all of them: the second reading's held gifts. */
  only?: ReadonlySet<string>;
}>;

/** Just after midnight UTC: read and credit. Settling anything here would be too early (D35). */
export const COUNTING_PASS: PassPlan = { name: "counting", count: true, refund: false };

/**
 * After the reading grace: settle the missed days and send them back. The refund is not optional. Draining
 * only moves a missed day out of the gift; sending it is what makes "a piece comes back to you" true, and
 * for a while nothing did it (D38).
 */
export const SETTLING_PASS: PassPlan = { name: "settling", count: false, refund: true };

/** Before 06:00 UTC: reads again what the counting pass held, or everything when it left nothing (see above). */
export const RECOUNT_PASS: PassPlan = { name: "recount", count: true, refund: false };

/**
 * How long a gift may wait unopened, or opened and never connected, before its whole amount can go back to the funder:
 * the contract's `UNCLAIMED_REFUND_DELAY`, fourteen days, mirrored here and checked against the contract's source by a
 * test. The check screen promises "If nobody opens it within 14 days, it comes back to you", and until 17 Sep nothing
 * made that true: the pass skipped every gift that had not started (decision 5 of the drawn flows).
 */
export const UNCLAIMED_REFUND_DELAY_SECONDS = 14 * 86_400;

type PassGift = Pick<GiftState, "cancelled" | "finalised" | "startDay" | "recipient" | "fundedAt" | "claimedAt"> &
  Partial<Pick<GiftState, "refundable" | "refundedToFunder" | "endDay" | "settledThroughDay">>;

/**
 * What a gift already closed still owes its funder: what the contract made refundable and has not sent yet. The pass
 * skipped every closed gift until 23 Sep 2026, so the last refund of a gift finalised after its settling pass was
 * never sent: gift 1 held 2.857148 AUSD that way (D186).
 */
export function stillOwedToFunder(gift: PassGift): bigint {
  const refundable = gift.refundable ?? 0n;
  const refunded = gift.refundedToFunder ?? 0n;
  return refundable > refunded ? refundable - refunded : 0n;
}

/** Whether a gift that never started has waited long enough for the contract to send all of it back. */
export function unstartedAndOverdue(gift: PassGift, nowSeconds: number): boolean {
  if (gift.cancelled || gift.finalised || gift.startDay !== 0) return false;
  const since = gift.recipient === null ? gift.fundedAt : gift.claimedAt;
  return since > 0 && nowSeconds >= since + UNCLAIMED_REFUND_DELAY_SECONDS;
}

export type DailyPassDeps = {
  boundGifts: () => Promise<ReadonlyArray<{ giftId: string }>>;
  allGifts: () => Promise<ReadonlyArray<{ giftId: string; escrow: Hex | null; goalType?: number }>>;
  read: (escrow: Hex, giftId: string) => Promise<PassGift>;
  /** One gift's reading, told which pass asks: which of them may read without a look is the reading's own rule (src/daily-look.ts). */
  count: (giftId: string, pass: "counting" | "recount") => Promise<PublicCheckInOutcome>;
  drain: (giftId: string, escrow: Hex) => Promise<{ hash: string }>;
  finalise: (giftId: string, escrow: Hex) => Promise<{ hash: string }>;
  refund: (giftId: string, escrow: Hex) => Promise<{ hash: string }>;
  start: () => Promise<{ address: string; balance: bigint }>;
  nowSeconds?: () => number;
  /**
   * Whether check-ins are paused on a contract. While they are, nobody can be read, so no day is drained and no gift
   * finalised there: on the first version of the contract the clock runs through a pause, and draining then would
   * take days nobody could have earned (the audit of 1 Oct 2026). Absent in the tests of the other steps.
   */
  paused?: (escrow: Hex) => Promise<boolean>;
  /** How long after a day's end a reading can still pay it, on a contract. The contracts' own window when absent. */
  catchUpSeconds?: (escrow: Hex) => number;
  /** What the latest counting pass since a moment left (src/pass-log.ts), for the second reading. */
  countingSince?: (since: Date) => Promise<CountingLeft | null>;
  /** Completes the creations whose record failed after their money moved (D87); absent in the tests of the other steps. */
  completeCreations?: () => Promise<readonly CreationLine[]>;
  /** The milestone gifts' own pass (src/milestone-pass.ts), told whether this pass settles. */
  milestones?: (settle: boolean) => Promise<DailyPassLine[]>;
  /** Writes this run to the pass journal (src/pass-log.ts), one row per run; absent in the tests of the other steps. */
  journal?: (pass: NewPass) => Promise<void>;
  /** Retires the exit terms whose deadline has passed, so no row says `signed` of a signature nothing can use. */
  retireExits?: () => Promise<number>;
  /**
   * Tells the operator what the start of the pass shows (src/watch.ts): a relayer running low or refusing, the
   * exchange's pin, the evidence key. Absent in the tests of the other steps. It never stops the pass.
   */
  watch?: (relayer: RelayerAtStart, pass: PassPlanName) => Promise<readonly WatchLine[]>;
  /**
   * Erases what a gift on a connected source kept, once the gift is over (src/gift-end-erasure.ts): the access, the
   * account's name and id, the morning readings. It answers one line for the report, or nothing when nothing was left;
   * it never throws. Absent in the tests of the other steps.
   */
  eraseAtEnd?: (giftId: string) => Promise<string | null>;
};

/**
 * What a run reports: one line per step, what the watch saw at the start, and what did not leave while it ran (a
 * morning message a push service refused, an alert Resend refused), each of which is also a line in the logs.
 */
export type DailyPassReport = { relayer: string; balanceWei: string; lines: DailyPassLine[]; watch: readonly WatchLine[]; unsent: string[] };

function liveDeps(): DailyPassDeps {
  const clients = relayerClients();
  return {
    retireExits: () => retireExpiredExits(),
    boundGifts: loadBoundGifts,
    allGifts: loadAllGifts,
    read: (escrow, giftId) => readGift(escrow, giftId, clients.publicClient),
    count: (giftId, pass) => readDailyGift({ giftId, purpose: "count", pass }),
    drain: relayDrain,
    finalise: relayFinalise,
    refund: relayRefund,
    start: async () => ({ address: clients.address, balance: (await relayerPreflight(clients)).balance }),
    paused: (escrow) => clients.publicClient.readContract({ address: escrow, abi: dailyAbiOf(escrow), functionName: "checkInPaused" }) as Promise<boolean>,
    catchUpSeconds: catchUpSecondsOf,
    countingSince,
    completeCreations: () => completePendingCreations(liveCreationDeps()),
    milestones: (settle) => milestonePass(settle),
    journal: recordPass,
    watch: (relayer, pass) => watchAtPassStart(relayer, pass),
    eraseAtEnd: (giftId) => erasureLine(giftId),
  };
}

/** What the run counts as it goes, for the journal. Gathered from what happened, never worked out afterwards. */
type RunTally = {
  readingsAttempted: number;
  readingsSucceeded: number;
  holds: PassHold[];
  failures: Record<string, number>;
  /** Every refusal a reading met, by its code, ours or not: the journal said nothing of the others (the audit's gap a). */
  refusals: Record<string, number>;
  /** The gifts whose reading failed on our side in this run, and those of them whose held days are already named. */
  unread: Set<string>;
  held: Set<string>;
};

/** The window every contract but the earliest gives a day: the day after it, and six hours. */
const CATCH_UP_SECONDS = 86_400 + 6 * 3_600;

/**
 * The days a hold is about: every day of the gift that a reading could still have paid when it failed.
 *
 * It was yesterday alone, and that looked at the wrong day (the audit of 1 Oct 2026). Just after midnight the day
 * before yesterday is still inside its catch-up window, and it is the one the settling pass sends back seven hours
 * later: the day a failed reading actually costs. So a hold names each day that is past, not yet settled, inside the
 * gift's window and still inside its catch-up window, and "Days lost because of us" is then counted on the right ones.
 * A gift whose days could not be read is held for yesterday, as before.
 */
export function heldDaysOf(gift: Partial<Pick<GiftState, "startDay" | "endDay" | "settledThroughDay">> | null, nowSeconds: number, catchUpSeconds: number = CATCH_UP_SECONDS): number[] {
  const yesterday = utcDayOf(nowSeconds) - 1;
  if (!gift || !gift.startDay || gift.endDay === undefined || gift.settledThroughDay === undefined) return [yesterday];
  const days: number[] = [];
  for (let day = Math.max(gift.settledThroughDay + 1, gift.startDay); day <= Math.min(yesterday, gift.endDay); day += 1) {
    if (nowSeconds < (day + 1) * 86_400 + catchUpSeconds) days.push(day);
  }
  return days.length > 0 ? days : [yesterday];
}

/** The code a thrown failure is counted under: its own, when it carries one. */
function failureCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && code.length > 0 ? code : "PASS_FAILED";
}

function countFailure(run: RunTally, code: string): void {
  run.failures[code] = (run.failures[code] ?? 0) + 1;
}

/**
 * Every refusal a reading met, by its own code, whether or not it was ours to fix.
 *
 * The journal used to count only ours, so a morning of three readings the contract refused with `NothingToCredit`
 * wrote "3 asked, 0 credited, 0 errors" and left no trace of why: a silent morning that was nothing of the sort (the
 * audit of 18 Sep, gap a). The codes are the contract's and the sources' own; they are counted, never translated.
 */
function countRefusal(run: RunTally, code: string): void {
  run.refusals[code] = (run.refusals[code] ?? 0) + 1;
}

/** The watch at the start of a pass. Whatever it meets, the pass goes on: telling the operator is not a step of it. */
async function watching(deps: DailyPassDeps, relayer: RelayerAtStart, pass: PassPlanName): Promise<readonly WatchLine[]> {
  if (!deps.watch) return [];
  try {
    return await deps.watch(relayer, pass);
  } catch (error) {
    console.error(`watch failed at the start of the ${pass} pass: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

async function writeJournal(deps: DailyPassDeps, plan: PassPlan, startedAt: number, endedAt: number, run: RunTally): Promise<void> {
  if (!deps.journal) return;
  try {
    await deps.journal({
      plan: plan.name,
      startedAt: new Date(startedAt * 1_000),
      endedAt: new Date(endedAt * 1_000),
      readingsAttempted: run.readingsAttempted,
      readingsSucceeded: run.readingsSucceeded,
      holds: run.holds,
      failures: run.failures,
      refusals: run.refusals,
    });
  } catch (error) {
    // The journal records the pass, it is never a condition of it: a pass that did its work keeps it, as the day
    // record does when its own write fails (src/gift-relay.ts).
    console.error(`pass not journalled: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Runs the pass and writes exactly one journal row for it, whether it finished or threw. A run that stopped part way
 * still did what it did up to there, and its own failure is counted as an error like any other of ours.
 */
export async function dailyPass(
  plan: PassPlan = COUNTING_PASS,
  deps: DailyPassDeps = liveDeps(),
): Promise<DailyPassReport> {
  const clock = () => (deps.nowSeconds ? deps.nowSeconds() : Math.floor(Date.now() / 1_000));
  const startedAt = clock();
  const run: RunTally = { readingsAttempted: 0, readingsSucceeded: 0, holds: [], failures: {}, refusals: {}, unread: new Set(), held: new Set() };
  try {
    const { value, notes } = await gatheringNotes(() => runPass(plan, deps, run, clock));
    return { ...value, unsent: notes };
  } catch (error) {
    countFailure(run, failureCode(error));
    throw error;
  } finally {
    // A gift whose reading failed and whose days were not named, because the run stopped before it reached it or the
    // list of gifts did not hold it, is held all the same, for yesterday: the second reading must find it.
    for (const giftId of run.unread) if (!run.held.has(giftId)) for (const day of heldDaysOf(null, clock())) run.holds.push({ giftId, day });
    await writeJournal(deps, plan, startedAt, clock(), run);
  }
}

async function runPass(
  plan: PassPlan,
  deps: DailyPassDeps,
  run: RunTally,
  clock: () => number,
): Promise<Omit<DailyPassReport, "unsent">> {
  let started: { address: string; balance: bigint };
  try {
    started = await deps.start();
  } catch (error) {
    // A pass that cannot start says so to the operator before it gives up: until 1 Oct 2026 a relayer under its
    // reserve was a line in the logs of a run nobody was looking at.
    await watching(deps, { refused: error instanceof Error ? error.message : String(error) }, plan.name);
    throw error;
  }
  const { address, balance } = started;
  const watch = await watching(deps, started, plan.name);
  const lines: DailyPassLine[] = [];

  // First, a gift whose money moved and whose record failed becomes a gift, so the rest of this pass, and the
  // fourteen-day return, can see it (D87).
  if (deps.completeCreations && !plan.only) {
    for (const line of await deps.completeCreations()) {
      lines.push({ giftId: line.giftId ?? `creation ${line.nonce.slice(0, 10)}`, step: "create", result: line.result });
    }
  }

  // A gift whose reading failed for a reason of ours is left alone for the rest of the pass. Draining it
  // would take a day from someone who did the work, because our worker, the source, or the attestor was
  // down. Our failures are ours, never theirs to pay for (D57). The day stays open and the next working
  // reading can still credit it, because only a drain closes a day.
  const unread = run.unread;

  // Milestone gifts live on their own contract and have their own pass, below. Read with this contract's ABI they
  // would fail, and one failure here stops the pass for every daily gift after it.
  const about = (entry: { giftId: string }) => !isMilestoneGiftId(entry.giftId) && (!plan.only || plan.only.has(entry.giftId));
  if (plan.count) {
    for (const gift of (await deps.boundGifts()).filter(about)) {
      // Counted before the call so a pass that falls over still records the reading it was taking. A gift already
      // counted today, finished, cancelled or not yet connected is never asked of the source at all, so it is taken
      // back out: it is not a reading, and counting it as one would make the source look silent when nobody spoke.
      run.readingsAttempted += 1;
      const outcome = await counted(deps, gift.giftId, plan.name === "recount" ? "recount" : "counting");
      if (outcome.kind === "already") run.readingsAttempted -= 1;
      if (outcome.kind === "counted" || outcome.kind === "bound") run.readingsSucceeded += 1;
      if (outcome.kind === "refused") {
        countRefusal(run, outcome.code);
        if (OURS_TO_FIX.has(outcome.code)) {
          // Held, and its days are named below, once the gift has been read on the contract.
          unread.add(gift.giftId);
          countFailure(run, outcome.code);
        }
      }
      lines.push(describe(outcome));
    }
  }

  // One answer per contract and per run: a pause is the contract's, not a gift's.
  const pauses = new Map<string, Promise<boolean>>();
  const pausedOn = (escrow: Hex): Promise<boolean> => {
    if (!deps.paused) return Promise.resolve(false);
    const key = escrow.toLowerCase();
    // A pause that cannot be read is treated as one: holding a day open costs nothing, draining it cannot be undone.
    if (!pauses.has(key)) pauses.set(key, deps.paused(escrow).catch(() => true));
    return pauses.get(key)!;
  };
  const held = run.held;
  const hold = (giftId: string, gift: PassGift | null, escrow: Hex | null) => {
    held.add(giftId);
    const window = escrow && deps.catchUpSeconds ? deps.catchUpSeconds(escrow) : CATCH_UP_SECONDS;
    for (const day of heldDaysOf(gift, clock(), window)) run.holds.push({ giftId, day });
  };

  for (const record of (await deps.allGifts()).filter(about)) {
    const giftId = record.giftId;
    let escrow: Hex;
    try {
      escrow = escrowOf(record);
    } catch (error) {
      // One unreadable record must never stop the pass for every other gift.
      if (unread.has(giftId)) hold(giftId, null, null);
      lines.push({ giftId, step: "drain", result: error instanceof Error ? error.message : "no contract recorded" });
      continue;
    }
    let gift: Awaited<ReturnType<DailyPassDeps["read"]>>;
    try {
      gift = await deps.read(escrow, giftId);
    } catch (error) {
      // A gift the chain could not be read for is one line of the report; the others are still settled.
      if (unread.has(giftId)) hold(giftId, null, escrow);
      lines.push({ giftId, step: "read", result: `failed: ${failureCode(error)}` });
      continue;
    }
    if (unread.has(giftId)) {
      hold(giftId, gift, escrow);
      lines.push({ giftId, step: "drain", result: "held: today's reading failed on our side" });
      continue;
    }
    if (gift.cancelled || gift.finalised) {
      // Closed, and nothing to drain or finalise; but what it still owes its funder is sent, by the settling pass.
      if (plan.refund && stillOwedToFunder(gift) > 0n) lines.push(await attempt(giftId, "refund", () => deps.refund(giftId, escrow)));
      // And what a connected source's gift kept is erased, each morning until nothing is left: a gift its person
      // ended is finalised on the contract, so the three ways a gift is over all come through here.
      if (plan.refund) await eraseIfConnected(deps, record, lines);
      continue;
    }
    if (gift.startDay === 0) {
      // Nothing to drain or finalise before a first reading. A gift nobody opened, or nobody connected, is sent back
      // whole once the contract allows it, and only by the settling pass, which is the one that sends money back.
      if (plan.refund && unstartedAndOverdue(gift, clock())) lines.push(await attempt(giftId, "refund", () => deps.refund(giftId, escrow)));
      continue;
    }
    if (await pausedOn(escrow)) {
      // Nobody can be read during a pause, so nothing is settled against the days it covers. What an earlier pass
      // already freed is still sent.
      lines.push({ giftId, step: "drain", result: "held: check-ins are paused on this contract" });
      if (plan.refund && stillOwedToFunder(gift) > 0n) lines.push(await attempt(giftId, "refund", () => deps.refund(giftId, escrow)));
      continue;
    }
    lines.push(await attempt(giftId, "drain", () => deps.drain(giftId, escrow)));
    const finalised = await attempt(giftId, "finalise", () => deps.finalise(giftId, escrow));
    lines.push(finalised);
    if (plan.refund) lines.push(await attempt(giftId, "refund", () => deps.refund(giftId, escrow)));
    // The gift this pass has just closed is erased by this pass, not by tomorrow's.
    if (plan.refund && finalised.result === "sent") await eraseIfConnected(deps, record, lines);
  }
  // The second reading of held gifts is about those gifts alone: the milestones and the exits have their own passes.
  if (plan.only) return { relayer: address, balanceWei: balance.toString(), lines, watch };
  if (deps.milestones) {
    try {
      lines.push(...(await deps.milestones(plan.refund)));
    } catch (error) {
      if (stopsEveryRelay(error)) throw error;
      lines.push({ giftId: "milestones", step: "drain", result: `failed: ${failureCode(error)}` });
    }
  }
  // Terms nobody can use any more say so, on the pass that settles. Nothing here moves money: the contract already
  // refuses a deadline that has passed, and this is the row catching up with that fact (the audit's gap e).
  if (plan.refund && deps.retireExits) {
    const retired = await deps.retireExits();
    if (retired > 0) lines.push({ giftId: "exits", step: "retire", result: `${retired} set(s) of terms past their deadline` });
  }
  return { relayer: address, balanceWei: balance.toString(), lines, watch };
}

/**
 * Erases what a gift that is over kept of a connected source, and says so in the report when something was there.
 * Asked only of a gift whose goal is on a connected source: the others hold no access, and the name their funder gave
 * is the gift's own term.
 */
async function eraseIfConnected(deps: DailyPassDeps, record: { giftId: string; goalType?: number }, lines: DailyPassLine[]): Promise<void> {
  if (!deps.eraseAtEnd || record.goalType === undefined || !connectedLineOf(record.goalType)) return;
  const result = await deps.eraseAtEnd(record.giftId);
  if (result) lines.push({ giftId: record.giftId, step: "erase", result });
}

/**
 * One gift's reading. A reading that throws instead of answering is a refusal of ours for that gift, and the pass
 * goes on to the next one: until 1 Oct 2026 one connected source that threw stopped the morning's readings for every
 * gift after it (the audit, F-23).
 */
async function counted(deps: DailyPassDeps, giftId: string, pass: "counting" | "recount"): Promise<PublicCheckInOutcome> {
  try {
    return await deps.count(giftId, pass);
  } catch (error) {
    if (stopsEveryRelay(error)) throw error;
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`reading failed for gift ${giftId}: ${reason.slice(0, 300)}`);
    return { kind: "refused", giftId, code: "READING_FAILED", message: "The reading could not be taken." };
  }
}

/**
 * The second reading of the morning. With no counting pass in the journal since midnight UTC, or one that stopped
 * part way, the whole reading pass runs: it is the pass that did not happen. Otherwise only the gifts that pass held
 * are read again, so a reading the person's own account refused is not asked of the source twice. Journalled under
 * its own name either way.
 */
export async function recountPass(deps: DailyPassDeps = liveDeps()): Promise<DailyPassReport> {
  const now = deps.nowSeconds ? deps.nowSeconds() : Math.floor(Date.now() / 1_000);
  const midnight = new Date(utcDayOf(now) * 86_400_000);
  let left: CountingLeft | null = null;
  try {
    left = deps.countingSince ? await deps.countingSince(midnight) : null;
  } catch (error) {
    // A journal that cannot be read is treated as an empty one: reading everything again is the safe side.
    console.error(`recount: the journal could not be read: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!left || left.stopped) return dailyPass(RECOUNT_PASS, deps);
  return dailyPass({ ...RECOUNT_PASS, only: new Set(left.held) }, deps);
}

function describe(outcome: PublicCheckInOutcome): DailyPassLine {
  switch (outcome.kind) {
    case "counted":
      return { giftId: outcome.giftId, step: "count", result: `counted, ${outcome.creditedDays} day(s) credited, ${outcome.xp} ${outcome.unit ?? "XP"}`, hash: outcome.hash };
    case "bound":
      return { giftId: outcome.giftId, step: "count", result: `bound, ${outcome.xp} ${outcome.unit ?? "XP"}`, hash: outcome.hash };
    case "already":
      return { giftId: outcome.giftId, step: "count", result: `skipped: ${outcome.reason}` };
    case "refused":
      // A refusal a plain look foresaw says so: no attested reading was taken for it (src/daily-look.ts).
      return { giftId: outcome.giftId, step: "count", result: `refused: ${outcome.code}${outcome.xp !== undefined ? ` (${outcome.xp} XP)` : ""}${outcome.looked ? ", by a look, no proof taken" : ""}` };
    // A pass never asks for a look alone: named all the same, should one ever answer it.
    case "seen":
      return { giftId: outcome.giftId, step: "count", result: `seen: a lesson is in (${outcome.xp} XP), no proof taken` };
    // A pass counts, it never takes a first reading: named all the same, should one ever answer it.
    case "sign":
      return { giftId: outcome.giftId, step: "count", result: "held: the first reading waits for the recipient's signature" };
  }
}

/** A failure every later relay of the pass would meet as well: the relayer below its reserve, on the wrong chain, or not set up. */
function stopsEveryRelay(error: unknown): boolean {
  return error instanceof RelayerError && (error.code === "RESERVE_TOO_LOW" || error.code === "WRONG_CHAIN" || error.code === "NOT_CONFIGURED");
}

/**
 * One step for one gift. A refusal of the contract, or a failure of this step alone (a finality wait that ran out, an
 * endpoint that did not answer), is a line of the report and the pass goes on to every other gift (the money path
 * audit of 27 Sep 2026: one timeout used to end the pass, milestones and exits included). Only a failure every later
 * relay would meet stops it.
 */
async function attempt(giftId: string, step: "drain" | "finalise" | "refund", action: () => Promise<{ hash: string }>): Promise<DailyPassLine> {
  try {
    const result = await action();
    return { giftId, step, result: "sent", hash: result.hash };
  } catch (error) {
    if (error instanceof RelayerError && error.code === "REVERTED") return { giftId, step, result: `refused: ${error.contractError ?? "unknown"}` };
    if (stopsEveryRelay(error)) throw error;
    return { giftId, step, result: `failed: ${failureCode(error)}` };
  }
}
