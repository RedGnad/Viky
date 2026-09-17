import type { Hex } from "viem";
import { runPublicCheckIn, type PublicCheckInOutcome } from "./duolingo-public-checkin";
import { completePendingCreations, type CreationLine } from "./gift-creation";
import { liveCreationDeps } from "./gift-creation-live";
import { readGift, type GiftState } from "./gift-reader";
import { relayDrain, relayFinalise, relayRefund } from "./gift-relay";
import { loadAllGifts, loadBoundGifts } from "./gift-store";
import { escrowOf, relayerClients, relayerPreflight, RelayerError } from "./relayer";

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
 */

export type DailyPassLine = { giftId: string; step: "create" | "count" | "drain" | "finalise" | "refund"; result: string; hash?: string };

/**
 * Refusals that say something broke on our side rather than something the person did. A reading refused for
 * one of these is no evidence at all, so nothing may be settled against it.
 *
 * Deliberately not here: a profile that turned private, a name that no longer resolves, a code that is not
 * in the display name. Those are real answers about the person's own account, and holding the gift open for
 * them would let anyone stop the clock by hiding their profile.
 */
const OURS_TO_FIX: ReadonlySet<string> = new Set(["FETCH_FAILED", "PROOF_INVALID", "PROOF_MISMATCH", "NOT_CONFIGURED"]);

/** Which of the pass's jobs a run does. Named, so the two schedules cannot drift apart by accident. */
export type PassPlan = Readonly<{ count: boolean; refund: boolean }>;

/** Just after midnight UTC: read and credit. Settling anything here would be too early (D35). */
export const COUNTING_PASS: PassPlan = { count: true, refund: false };

/**
 * After the reading grace: settle the missed days and send them back. The refund is not optional. Draining
 * only moves a missed day out of the gift; sending it is what makes "a piece comes back to you" true, and
 * for a while nothing did it (D38).
 */
export const SETTLING_PASS: PassPlan = { count: false, refund: true };

/**
 * How long a gift may wait unopened, or opened and never connected, before its whole amount can go back to the funder:
 * the contract's `UNCLAIMED_REFUND_DELAY`, fourteen days, mirrored here and checked against the contract's source by a
 * test. The check screen promises "If nobody opens it within 14 days, it comes back to you", and until 17 Sep nothing
 * made that true: the pass skipped every gift that had not started (decision 5 of the drawn flows).
 */
export const UNCLAIMED_REFUND_DELAY_SECONDS = 14 * 86_400;

type PassGift = Pick<GiftState, "cancelled" | "finalised" | "startDay" | "recipient" | "fundedAt" | "claimedAt">;

/** Whether a gift that never started has waited long enough for the contract to send all of it back. */
export function unstartedAndOverdue(gift: PassGift, nowSeconds: number): boolean {
  if (gift.cancelled || gift.finalised || gift.startDay !== 0) return false;
  const since = gift.recipient === null ? gift.fundedAt : gift.claimedAt;
  return since > 0 && nowSeconds >= since + UNCLAIMED_REFUND_DELAY_SECONDS;
}

export type DailyPassDeps = {
  boundGifts: () => Promise<ReadonlyArray<{ giftId: string }>>;
  allGifts: () => Promise<ReadonlyArray<{ giftId: string; escrow: Hex | null }>>;
  read: (escrow: Hex, giftId: string) => Promise<PassGift>;
  count: (giftId: string) => Promise<PublicCheckInOutcome>;
  drain: (giftId: string, escrow: Hex) => Promise<{ hash: string }>;
  finalise: (giftId: string, escrow: Hex) => Promise<{ hash: string }>;
  refund: (giftId: string, escrow: Hex) => Promise<{ hash: string }>;
  start: () => Promise<{ address: string; balance: bigint }>;
  nowSeconds?: () => number;
  /** Completes the creations whose record failed after their money moved (D87); absent in the tests of the other steps. */
  completeCreations?: () => Promise<readonly CreationLine[]>;
};

function liveDeps(): DailyPassDeps {
  const clients = relayerClients();
  return {
    boundGifts: loadBoundGifts,
    allGifts: loadAllGifts,
    read: (escrow, giftId) => readGift(escrow, giftId, clients.publicClient),
    count: (giftId) => runPublicCheckIn({ giftId, purpose: "count" }),
    drain: relayDrain,
    finalise: relayFinalise,
    refund: relayRefund,
    start: async () => ({ address: clients.address, balance: (await relayerPreflight(clients)).balance }),
    completeCreations: () => completePendingCreations(liveCreationDeps()),
  };
}

export async function dailyPass(
  plan: PassPlan = COUNTING_PASS,
  deps: DailyPassDeps = liveDeps(),
): Promise<{ relayer: string; balanceWei: string; lines: DailyPassLine[] }> {
  const { address, balance } = await deps.start();
  const lines: DailyPassLine[] = [];

  // First, a gift whose money moved and whose record failed becomes a gift, so the rest of this pass, and the
  // fourteen-day return, can see it (D87).
  if (deps.completeCreations) {
    for (const line of await deps.completeCreations()) {
      lines.push({ giftId: line.giftId ?? `creation ${line.nonce.slice(0, 10)}`, step: "create", result: line.result });
    }
  }

  // A gift whose reading failed for a reason of ours is left alone for the rest of the pass. Draining it
  // would take a day from someone who did the work, because our worker, the source, or the attestor was
  // down. Our failures are ours, never theirs to pay for (D57). The day stays open and the next working
  // reading can still credit it, because only a drain closes a day.
  const unread = new Set<string>();

  if (plan.count) {
    for (const gift of await deps.boundGifts()) {
      const outcome = await deps.count(gift.giftId);
      if (outcome.kind === "refused" && OURS_TO_FIX.has(outcome.code)) unread.add(gift.giftId);
      lines.push(describe(outcome));
    }
  }

  for (const record of await deps.allGifts()) {
    const giftId = record.giftId;
    if (unread.has(giftId)) {
      lines.push({ giftId, step: "drain", result: "held: today's reading failed on our side" });
      continue;
    }
    let escrow: Hex;
    try {
      escrow = escrowOf(record);
    } catch (error) {
      // One unreadable record must never stop the pass for every other gift.
      lines.push({ giftId, step: "drain", result: error instanceof Error ? error.message : "no contract recorded" });
      continue;
    }
    const gift = await deps.read(escrow, giftId);
    if (gift.cancelled || gift.finalised) continue;
    if (gift.startDay === 0) {
      // Nothing to drain or finalise before a first reading. A gift nobody opened, or nobody connected, is sent back
      // whole once the contract allows it, and only by the settling pass, which is the one that sends money back.
      const now = deps.nowSeconds ? deps.nowSeconds() : Math.floor(Date.now() / 1_000);
      if (plan.refund && unstartedAndOverdue(gift, now)) lines.push(await attempt(giftId, "refund", () => deps.refund(giftId, escrow)));
      continue;
    }
    lines.push(await attempt(giftId, "drain", () => deps.drain(giftId, escrow)));
    lines.push(await attempt(giftId, "finalise", () => deps.finalise(giftId, escrow)));
    if (plan.refund) lines.push(await attempt(giftId, "refund", () => deps.refund(giftId, escrow)));
  }
  return { relayer: address, balanceWei: balance.toString(), lines };
}

function describe(outcome: PublicCheckInOutcome): DailyPassLine {
  switch (outcome.kind) {
    case "counted":
      return { giftId: outcome.giftId, step: "count", result: `counted, ${outcome.creditedDays} day(s) credited, ${outcome.totalXp} XP`, hash: outcome.hash };
    case "bound":
      return { giftId: outcome.giftId, step: "count", result: `bound, ${outcome.totalXp} XP`, hash: outcome.hash };
    case "already":
      return { giftId: outcome.giftId, step: "count", result: `skipped: ${outcome.reason}` };
    case "refused":
      return { giftId: outcome.giftId, step: "count", result: `refused: ${outcome.code}${outcome.totalXp !== undefined ? ` (${outcome.totalXp} XP)` : ""}` };
  }
}

async function attempt(giftId: string, step: "drain" | "finalise" | "refund", action: () => Promise<{ hash: string }>): Promise<DailyPassLine> {
  try {
    const result = await action();
    return { giftId, step, result: "sent", hash: result.hash };
  } catch (error) {
    if (error instanceof RelayerError && error.code === "REVERTED") return { giftId, step, result: `refused: ${error.contractError ?? "unknown"}` };
    throw error;
  }
}
