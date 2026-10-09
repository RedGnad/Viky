import type { Hex } from "viem";
import type { CreationLine } from "./gift-creation";
import { loadAllGifts } from "./gift-store";
import { completePendingMilestoneCreations } from "./milestone-creation";
import { canExpire, lateProofCloses, milestonePhase, readMilestoneGift, type MilestoneState } from "./milestone-reader";
import { MILESTONE_OURS_TO_FIX, runMilestoneReading, type MilestoneOutcome } from "./milestone-reading";
import { relayExpire, relayMilestoneRefund } from "./milestone-relay";
import { tellAboutMilestone, tellAboutReview } from "./morning-send";
import { liveTellingDeps } from "./morning-send-live";
import { SHAPE_CLIMB, isMilestoneGiftId, SHAPE_HAVE_OR_NOT } from "./milestone-protocol";
import { closeNeverReviewed, latestReviewOf, loadPortal, NEVER_REVIEWED, pendingReviews, type PortalReview } from "./portal-store";
import { heldProofsReminder, wholeDays, type HeldProofLine } from "./provider-alert";
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
 *
 * A first proof held for the operator's review (D312) is the settling pass's too, since 8 Oct 2026. While the contract
 * can still pay it, the operator is reminded of it each morning, with the time left. Once the contract takes no proof
 * for the gift any more, no review can pay it: the review is closed as never made, the person reads that, and the gift
 * goes back as any other. Before, the pass held such a gift from that same moment on, for good: nothing was paid and
 * nothing came back until somebody refused the proof by hand.
 */

export type MilestonePassLine = { giftId: string; step: "create" | "read" | "expire" | "refund" | "review"; result: string; hash?: string };

/** A first proof held for review, as the pass needs it: whose it is, and when it was shown. */
export type HeldProof = Pick<PortalReview, "sessionId" | "portalId" | "sense" | "giftId" | "observedAt">;

/** One held proof in the morning's reminder: until when the contract can pay it, or nothing when its gift is over. */
export type HeldReminder = HeldProof & Readonly<{ closesAt: number | null }>;

export type MilestonePassDeps = {
  gifts: () => Promise<ReadonlyArray<{ giftId: string; escrow: Hex | null }>>;
  read: (contract: Hex, giftId: string) => Promise<MilestoneState>;
  reach: (giftId: string) => Promise<MilestoneOutcome>;
  expire: (giftId: string, contract: Hex) => Promise<{ hash: string }>;
  refund: (giftId: string, contract: Hex) => Promise<{ hash: string }>;
  now: () => number;
  /** Completes the milestone creations whose record failed after their money moved (D87). */
  completeCreations?: () => Promise<readonly CreationLine[]>;
  /** The first proofs held for the operator's review (D312): shown, and not yet settled or refused. Asked once a settling pass. */
  heldProofs?: () => Promise<readonly HeldProof[]>;
  /** Closes a gift's held proofs as never reviewed, once the contract takes none any more: how many it closed. */
  closeNeverReviewed?: (giftId: string) => Promise<number>;
  /** Whether a gift's last review was closed that way, by this pass or an earlier one whose `expire` did not leave. */
  neverReviewed?: (giftId: string) => Promise<boolean>;
  /** Reminds the operator of what is still held, once a morning. */
  remind?: (held: readonly HeldReminder[], nowSeconds: number) => Promise<void>;
  /** Tells whoever asked to be told about the gift (src/morning-send.ts). */
  tell?: (giftId: string, news: "reached" | "expired" | "neverReviewed") => Promise<unknown>;
};

/** The morning's reminder, once in a UTC day whatever runs the settling pass again. */
async function remindOfHeldProofs(held: readonly HeldReminder[], nowSeconds: number): Promise<void> {
  const { tellOnceToday } = await import("./attested-calls");
  await tellOnceToday(
    "held-proofs",
    async () => {
      const lines: HeldProofLine[] = [];
      for (const proof of held) {
        const university = (await loadPortal(proof.portalId).catch(() => null))?.university ?? null;
        lines.push({ sessionId: proof.sessionId, portalId: proof.portalId, university, sense: proof.sense, giftId: proof.giftId, shownAt: proof.observedAt, closesAt: proof.closesAt });
      }
      return heldProofsReminder(lines, nowSeconds);
    },
    nowSeconds * 1_000,
  );
}

function liveTell(giftId: string, news: "reached" | "expired" | "neverReviewed"): Promise<unknown> {
  return news === "neverReviewed" ? tellAboutReview(giftId, "unread", liveTellingDeps()) : tellAboutMilestone(giftId, news, liveTellingDeps());
}

export function liveMilestonePassDeps(): MilestonePassDeps {
  return {
    gifts: async () => (await loadAllGifts()).filter((record) => isMilestoneGiftId(record.giftId)),
    read: (contract, giftId) => readMilestoneGift(contract, giftId),
    reach: (giftId) => runMilestoneReading({ giftId, purpose: "reach" }),
    expire: relayExpire,
    refund: relayMilestoneRefund,
    now: () => Math.floor(Date.now() / 1_000),
    completeCreations: () => completePendingMilestoneCreations(),
    heldProofs: () => pendingReviews(),
    closeNeverReviewed,
    neverReviewed: async (giftId) => {
      const last = await latestReviewOf(giftId);
      return last?.status === "refused" && last.reason === NEVER_REVIEWED;
    },
    remind: remindOfHeldProofs,
    tell: liveTell,
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

/**
 * A step that failed for another reason than the contract's own refusal: it still ends this gift's pass, and the
 * report names the step it was, where it used to say "read" of an `expire` that did not leave (the final audit of
 * 9 Oct 2026).
 */
class StepFailed extends Error {
  constructor(
    readonly step: "expire" | "refund",
    readonly cause: unknown,
  ) {
    super(cause instanceof Error ? cause.message : String(cause));
  }
}

async function attempt(giftId: string, step: "expire" | "refund", action: () => Promise<{ hash: string }>): Promise<MilestonePassLine> {
  try {
    const result = await action();
    return { giftId, step, result: "sent", hash: result.hash };
  } catch (error) {
    if (error instanceof RelayerError && error.code === "REVERTED") return { giftId, step, result: `refused: ${error.contractError ?? "unknown"}` };
    throw new StepFailed(step, error);
  }
}

export async function milestonePass(settle: boolean, deps: MilestonePassDeps = liveMilestonePassDeps()): Promise<MilestonePassLine[]> {
  const lines: MilestonePassLine[] = [];
  // First, a milestone gift whose money moved and whose record failed becomes a gift, so this pass can see it (D87).
  if (deps.completeCreations) {
    for (const line of await deps.completeCreations()) lines.push({ giftId: line.giftId ?? `creation ${line.nonce.slice(0, 10)}`, step: "create", result: line.result });
  }
  // What is held for review, read once. A list that cannot be read is not an empty one: no gift a held proof could
  // belong to is closed on it (`passOne`), and the report says so.
  let held: readonly HeldProof[] | null = [];
  if (settle && deps.heldProofs) {
    try {
      held = await deps.heldProofs();
    } catch (error) {
      held = null;
      lines.push({ giftId: "reviews", step: "review", result: `failed: ${error instanceof Error ? error.message.slice(0, 200) : String(error)}` });
    }
  }
  const reminders: HeldReminder[] = [];
  for (const record of await deps.gifts()) {
    try {
      lines.push(...(await passOne(record, settle, deps, held, reminders)));
    } catch (error) {
      // One gift that cannot be read today never stops the pass for the others, and the report says which, and which
      // step it was when it was sending money back.
      lines.push({ giftId: record.giftId, step: error instanceof StepFailed ? error.step : "read", result: `failed: ${error instanceof Error ? error.message.slice(0, 200) : String(error)}` });
    }
  }
  if (reminders.length > 0 && deps.remind) {
    // A reminder that does not leave never fails the pass: the lines above say what is held all the same.
    await deps.remind(reminders, deps.now()).catch((error) => lines.push({ giftId: "reviews", step: "review", result: `reminder not sent: ${error instanceof Error ? error.message.slice(0, 200) : String(error)}` }));
  }
  return lines;
}

async function passOne(
  record: { giftId: string; escrow: Hex | null },
  settle: boolean,
  deps: MilestonePassDeps,
  heldProofs: readonly HeldProof[] | null = [],
  reminders: HeldReminder[] = [],
): Promise<MilestonePassLine[]> {
  const lines: MilestonePassLine[] = [];
  const giftId = record.giftId;
  let contract: Hex;
  try {
    contract = escrowOf(record);
  } catch (error) {
    return [{ giftId, step: "read", result: error instanceof Error ? error.message : "no contract recorded" }];
  }
  const tell = deps.tell ?? liveTell;
  let state = await deps.read(contract, giftId);
  let held = false;
  const phase = milestonePhase(state, deps.now());
  // A climb past its deadline and still inside its grace is asked too (the review of 2 Oct 2026, R-14): nothing read
  // now can count for it, but a reading a pause kept from being sent can, and this is where it is sent.
  if (phase === "climbing" || (phase === "overdue" && state.shape === SHAPE_CLIMB && !canExpire(state, deps.now()))) {
    const outcome = await deps.reach(giftId);
    lines.push({ giftId, step: "read", result: describe(outcome), hash: "hash" in outcome ? outcome.hash : undefined });
    held = outcome.kind === "refused" && MILESTONE_OURS_TO_FIX.has(outcome.code);
    if (outcome.kind === "reached") {
      await tell(giftId, "reached");
      state = await deps.read(contract, giftId);
    }
  }
  if (!settle) return lines;
  const now = deps.now();
  const closable = canExpire(state, now);
  // Only a gift had or not, opened, has a proof to hold: nothing else is asked about a review.
  const hadOrNot = state.shape === SHAPE_HAVE_OR_NOT && state.recipient !== null;
  const proofs = hadOrNot ? (heldProofs ?? []).filter((proof) => proof.giftId === giftId) : [];
  if (proofs.length > 0 && !closable) {
    // Held while the contract can still pay it: the operator is reminded each morning, with the time left. A gift
    // paid or ended meanwhile leaves a held proof that pays nothing, which only a refusal closes.
    const over = state.settled || state.cancelled;
    const closesAt = over ? null : lateProofCloses(state);
    for (const proof of proofs) reminders.push({ ...proof, closesAt });
    lines.push({
      giftId,
      step: "review",
      result: closesAt === null ? "held: a first proof of a gift that is over, refuse it to close it (pnpm portal:pin)" : `held: a first proof waits for review, the contract can pay it for ${wholeDays(closesAt - now)} more (pnpm portal:pin)`,
    });
  }
  if (held) {
    lines.push({ giftId, step: "expire", result: "held: today's reading failed on our side" });
    return lines;
  }
  if (closable) {
    if (hadOrNot && heldProofs === null) {
      lines.push({ giftId, step: "expire", result: "held: the proofs held for review could not be read" });
      return lines;
    }
    // The contract takes no proof for this gift any more (`lateProofCloses`), so one still held can never be paid:
    // its review is closed as never made, which is ours and which the person reads, before the gift goes back.
    const closed = proofs.length > 0 ? ((await deps.closeNeverReviewed?.(giftId)) ?? 0) : 0;
    if (closed > 0) lines.push({ giftId, step: "review", result: `closed: ${closed === 1 ? "a first proof was" : `${closed} first proofs were`} never reviewed, and the contract takes none any more` });
    const line = await attempt(giftId, "expire", () => deps.expire(giftId, contract));
    lines.push(line);
    if (line.result !== "sent") return lines;
    // Said as what happened: a proof never reviewed is not "the time is up", on this pass or on the one that
    // sends the `expire` an earlier pass could not.
    const unread = closed > 0 || (hadOrNot && (await deps.neverReviewed?.(giftId)) === true);
    await tell(giftId, unread ? "neverReviewed" : "expired");
    state = await deps.read(contract, giftId);
  }
  if (state.refundable > 0n) lines.push(await attempt(giftId, "refund", () => deps.refund(giftId, contract)));
  return lines;
}
