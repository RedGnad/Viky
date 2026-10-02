import type { Hex } from "viem";
import type { CreationLine } from "./gift-creation";
import { loadAllGifts } from "./gift-store";
import { completePendingMilestoneCreations } from "./milestone-creation";
import { canExpire, milestonePhase, readMilestoneGift, type MilestoneState } from "./milestone-reader";
import { MILESTONE_OURS_TO_FIX, runMilestoneReading, type MilestoneOutcome } from "./milestone-reading";
import { relayExpire, relayMilestoneRefund } from "./milestone-relay";
import { tellAboutMilestone } from "./morning-send";
import { liveTellingDeps } from "./morning-send-live";
import { isMilestoneGiftId, SHAPE_HAVE_OR_NOT } from "./milestone-protocol";
import { latestReviewOf } from "./portal-store";
import { escrowOf, RelayerError } from "./relayer";

/**
 * The keeper's pass over milestone gifts (C2), run inside both daily passes (src/daily-pass.ts).
 *
 * Every pass reads each gift still climbing, and the first reading at or past the target releases the whole gift.
 * Reading in both passes rather than one halves the longest wait between two readings, which matters because the
 * contract judges the reading, not the day: a target reached in the evening and first read after the deadline is
 * lost, and our schedule is the only thing between the two (D48 records that risk, and the recipient's page offers a
 * reading on demand for the same reason).
 *
 * The settling pass then closes what can no longer be reached, by the contract's own rules (`canExpire`), and sends the
 * whole amount back: a climb past its deadline, and since 1 Oct 2026 a gift of the second shape (a certificate, a
 * university, an exam, a race, a competition) nobody opened, or opened and never proved once the late window has passed. A gift whose reading failed on our side in this pass is held: it is not closed on a pass that
 * could not read it (D57), even though a reading after the deadline could not have saved it, so that nobody has to
 * reason about which of our failures were harmless.
 */

export type MilestonePassLine = { giftId: string; step: "create" | "read" | "expire" | "refund"; result: string; hash?: string };

export type MilestonePassDeps = {
  gifts: () => Promise<ReadonlyArray<{ giftId: string; escrow: Hex | null }>>;
  read: (contract: Hex, giftId: string) => Promise<MilestoneState>;
  reach: (giftId: string) => Promise<MilestoneOutcome>;
  expire: (giftId: string, contract: Hex) => Promise<{ hash: string }>;
  refund: (giftId: string, contract: Hex) => Promise<{ hash: string }>;
  now: () => number;
  /** Completes the milestone creations whose record failed after their money moved (D87). */
  completeCreations?: () => Promise<readonly CreationLine[]>;
  /** Whether a first proof of this gift is held for the operator's review (D312): shown, and not yet settled or refused. */
  inReview?: (giftId: string) => Promise<boolean>;
};

export function liveMilestonePassDeps(): MilestonePassDeps {
  return {
    gifts: async () => (await loadAllGifts()).filter((record) => isMilestoneGiftId(record.giftId)),
    read: (contract, giftId) => readMilestoneGift(contract, giftId),
    reach: (giftId) => runMilestoneReading({ giftId, purpose: "reach" }),
    expire: relayExpire,
    refund: relayMilestoneRefund,
    now: () => Math.floor(Date.now() / 1_000),
    completeCreations: () => completePendingMilestoneCreations(),
    inReview: async (giftId) => (await latestReviewOf(giftId))?.status === "pending",
  };
}

function describe(outcome: MilestoneOutcome): string {
  switch (outcome.kind) {
    case "reached":
      return `reached at ${outcome.rating}`;
    case "started":
      return `started at ${outcome.rating}`;
    case "notYet":
      return `not yet: ${outcome.rating} of ${outcome.target}${outcome.attested ? ", attested" : ""}`;
    case "already":
      return `skipped: ${outcome.reason}`;
    case "refused":
      return `refused: ${outcome.code}${outcome.rating !== undefined ? ` (${outcome.rating})` : ""}`;
    // A pass reads towards the target, it never starts a climb: named all the same, should one ever answer it.
    case "sign":
      return "held: the start waits for the recipient's signature";
  }
}

async function attempt(giftId: string, step: "expire" | "refund", action: () => Promise<{ hash: string }>): Promise<MilestonePassLine> {
  try {
    const result = await action();
    return { giftId, step, result: "sent", hash: result.hash };
  } catch (error) {
    if (error instanceof RelayerError && error.code === "REVERTED") return { giftId, step, result: `refused: ${error.contractError ?? "unknown"}` };
    throw error;
  }
}

export async function milestonePass(settle: boolean, deps: MilestonePassDeps = liveMilestonePassDeps()): Promise<MilestonePassLine[]> {
  const lines: MilestonePassLine[] = [];
  // First, a milestone gift whose money moved and whose record failed becomes a gift, so this pass can see it (D87).
  if (deps.completeCreations) {
    for (const line of await deps.completeCreations()) lines.push({ giftId: line.giftId ?? `creation ${line.nonce.slice(0, 10)}`, step: "create", result: line.result });
  }
  for (const record of await deps.gifts()) {
    try {
      lines.push(...(await passOne(record, settle, deps)));
    } catch (error) {
      // One gift that cannot be read today never stops the pass for the others, and the report says which.
      lines.push({ giftId: record.giftId, step: "read", result: `failed: ${error instanceof Error ? error.message.slice(0, 200) : String(error)}` });
    }
  }
  return lines;
}

async function passOne(record: { giftId: string; escrow: Hex | null }, settle: boolean, deps: MilestonePassDeps): Promise<MilestonePassLine[]> {
  const lines: MilestonePassLine[] = [];
  const giftId = record.giftId;
  let contract: Hex;
  try {
    contract = escrowOf(record);
  } catch (error) {
    return [{ giftId, step: "read", result: error instanceof Error ? error.message : "no contract recorded" }];
  }
  let state = await deps.read(contract, giftId);
  let held = false;
  if (milestonePhase(state, deps.now()) === "climbing") {
    const outcome = await deps.reach(giftId);
    lines.push({ giftId, step: "read", result: describe(outcome), hash: "hash" in outcome ? outcome.hash : undefined });
    held = outcome.kind === "refused" && MILESTONE_OURS_TO_FIX.has(outcome.code);
    if (outcome.kind === "reached") {
      await tellAboutMilestone(giftId, "reached", liveTellingDeps());
      state = await deps.read(contract, giftId);
    }
  }
  if (!settle) return lines;
  if (held) {
    lines.push({ giftId, step: "expire", result: "held: today's reading failed on our side" });
    return lines;
  }
  if (canExpire(state, deps.now())) {
    // A proof shown in time and still waiting for the operator is not the recipient's lateness: the gift is not taken
    // back on it. The report says so every day until the review is decided, which is the operator's to do.
    if (state.shape === SHAPE_HAVE_OR_NOT && state.recipient !== null && (await deps.inReview?.(giftId))) {
      lines.push({ giftId, step: "expire", result: "held: a first proof is under review, decide it (pnpm portal:pin)" });
      return lines;
    }
    const line = await attempt(giftId, "expire", () => deps.expire(giftId, contract));
    lines.push(line);
    if (line.result !== "sent") return lines;
    await tellAboutMilestone(giftId, "expired", liveTellingDeps());
    state = await deps.read(contract, giftId);
  }
  if (state.refundable > 0n) lines.push(await attempt(giftId, "refund", () => deps.refund(giftId, contract)));
  return lines;
}
