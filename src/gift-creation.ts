import type { Hex } from "viem";
import type { ContractAuthorization } from "./ausd-authorization";
import { GiftApiError } from "./gift-api";
import type { GiftParams } from "./gift-attestation";
import type { CreationRow } from "./gift-store";
import { claimTokenHash, newClaimToken } from "./gift-store";

/**
 * Making a gift, in the order that keeps the money findable (D87).
 *
 * The money moves on the relay and the gift exists for Viky only once it is recorded. Relaying first and recording
 * after left a hole: a record that failed between the two left a funded gift with no row, no link that works and no
 * pass that would ever send it back. So the creation is recorded first, as pending, under the authorization's nonce,
 * which is the hash of the exact terms and cannot be spent twice; the transaction's hash is written the moment it is
 * submitted; and only then is the gift recorded and the creation marked complete.
 *
 * A request retried with the same nonce finds its row rather than relaying twice. The keeper's pass completes a row
 * that stayed pending. Everything that touches the chain or the database comes in `deps`, so each of those paths is
 * tested without either.
 */

/** How long an attempt is left alone before another request with the same terms may take it over. */
export const CREATION_LEASE_MS = 2 * 60_000;
/** How long a creation with nothing submitted waits before the pass calls it abandoned, if its money never moved. */
export const CREATION_ABANDON_MS = 60 * 60_000;

export type CreatedGiftFacts = Readonly<{ giftId: string; hash: Hex; escrow: Hex }>;
export type ReadBack = { kind: "made"; giftId: string; escrow: Hex } | { kind: "reverted" } | { kind: "unknown" };

export type CreationDeps = Readonly<{
  begin: (row: Omit<CreationRow, "status" | "txHash" | "giftId" | "startedAt">) => Promise<{ inserted: true } | { inserted: false; existing: CreationRow }>;
  restart: (nonce: Hex, claimTokenHashOfAttempt: string, previousStart: Date) => Promise<boolean>;
  submitted: (nonce: Hex, txHash: Hex) => Promise<void>;
  relay: (params: GiftParams, authorization: ContractAuthorization, onSubmitted: (hash: Hex) => Promise<void>) => Promise<CreatedGiftFacts>;
  readBack: (txHash: Hex) => Promise<ReadBack>;
  spent: (funder: Hex, nonce: Hex) => Promise<boolean>;
  save: (input: {
    giftId: string;
    funder: string;
    contactHash: Hex;
    claimTokenHash: string;
    goalType: number;
    dailyTarget: number;
    durationDays: number;
    amount: bigint;
    createdTx: Hex;
    escrow: Hex;
    goalUsername?: string;
    recipientName?: string;
    funderName?: string;
  }) => Promise<void>;
  complete: (nonce: Hex, giftId: string, txHash: Hex, claimTokenHashOfLink: string) => Promise<void>;
  abandon: (nonce: Hex) => Promise<void>;
  loadPending: (startedBefore: Date) => Promise<CreationRow[]>;
  now: () => number;
}>;

export type CreationInput = Readonly<{
  params: GiftParams;
  authorization: ContractAuthorization;
  nonce: Hex;
  goalUsername?: string;
  recipientName?: string;
  funderName?: string;
}>;

const alreadyMade = () => new GiftApiError("ALREADY_MADE", "This gift is already made. It is in your gifts.", 409);
const inProgress = () => new GiftApiError("IN_PROGRESS", "This gift is being made. Give it a minute, then look in your gifts.", 409);
const beingRecorded = () =>
  new GiftApiError("BEING_RECORDED", "The money for this gift has moved and the gift is being recorded. It will be in your gifts shortly.", 409);

/** Records the gift of a creation from what the chain says it made, with the key hash the link will carry. */
async function record(row: Omit<CreationRow, "status" | "txHash" | "giftId" | "startedAt">, made: CreatedGiftFacts, keyHash: string, deps: CreationDeps): Promise<void> {
  await deps.save({
    giftId: made.giftId,
    funder: row.funder,
    contactHash: row.contactHash,
    claimTokenHash: keyHash,
    goalType: row.goalType,
    dailyTarget: row.dailyTarget,
    durationDays: row.durationDays,
    amount: row.amount,
    createdTx: made.hash,
    escrow: made.escrow,
    goalUsername: row.goalUsername ?? undefined,
    recipientName: row.recipientName ?? undefined,
    funderName: row.funderName ?? undefined,
  });
  await deps.complete(row.nonce, made.giftId, made.hash, keyHash);
}

/**
 * Makes one gift: records the creation, relays the money, records the gift. Answers the gift's number and the link's
 * key, which exists nowhere else. A retry of the same terms completes a creation whose record failed, with a fresh key:
 * the attempt that failed ended in an error, so its key never reached anybody.
 */
export async function makeGift(input: CreationInput, deps: CreationDeps): Promise<{ giftId: string; claimToken: string; hash: Hex; escrow: Hex }> {
  const claimToken = newClaimToken();
  const keyHash = claimTokenHash(claimToken);
  const row = {
    nonce: input.nonce,
    funder: input.params.funder,
    contactHash: input.params.recipientContactHash,
    goalType: input.params.goalType,
    dailyTarget: input.params.dailyTarget,
    durationDays: input.params.durationDays,
    amount: input.params.amount,
    goalUsername: input.goalUsername ?? null,
    recipientName: input.recipientName ?? null,
    funderName: input.funderName ?? null,
    claimTokenHash: keyHash,
  };

  const begun = await deps.begin(row);
  if (!begun.inserted) {
    const existing = begun.existing;
    if (existing.status === "complete") throw alreadyMade();
    if (existing.status === "abandoned") {
      // An attempt whose money never moved: the same terms may go again at once.
    } else if (existing.txHash) {
      const back = await deps.readBack(existing.txHash);
      if (back.kind === "made") {
        const made = { giftId: back.giftId, hash: existing.txHash, escrow: back.escrow };
        await record(row, made, keyHash, deps);
        return { giftId: made.giftId, claimToken, hash: made.hash, escrow: made.escrow };
      }
      if (back.kind === "unknown") throw inProgress();
      // Reverted: the money did not move under this transaction; the terms may be tried again below.
    } else if (deps.now() - existing.startedAt.getTime() < CREATION_LEASE_MS) {
      throw inProgress();
    }
    if (await deps.spent(input.params.funder, input.nonce)) throw beingRecorded();
    if (!(await deps.restart(input.nonce, keyHash, existing.startedAt))) throw inProgress();
  }

  let submitted = false;
  let made: CreatedGiftFacts;
  try {
    made = await deps.relay(input.params, input.authorization, async (hash) => {
      submitted = true;
      await deps.submitted(input.nonce, hash);
    });
  } catch (error) {
    // Refused before anything was submitted (the simulation, the relayer's own checks): no money moved, so the same
    // terms may be tried again at once rather than after the lease.
    if (!submitted) await deps.abandon(input.nonce).catch(() => undefined);
    throw error;
  }
  // From here the money has moved. A failure below leaves the creation pending with its transaction, for a retry of
  // the same terms or for the keeper's pass to complete.
  await record(row, made, keyHash, deps);
  return { giftId: made.giftId, claimToken, hash: made.hash, escrow: made.escrow };
}

export type CreationLine = Readonly<{ nonce: Hex; result: string; giftId?: string }>;

/**
 * The keeper's part (D87): every creation still pending past its lease is completed from its transaction, called
 * abandoned when its money never moved, or reported for an operator when the money moved and no transaction was
 * recorded. A completed gift keeps the key hash of the attempt that made it; its link was never shown, and the gift is
 * then in the funder's gifts and goes back to them after fourteen days unopened.
 */
export async function completePendingCreations(deps: CreationDeps): Promise<CreationLine[]> {
  const lines: CreationLine[] = [];
  const now = deps.now();
  for (const row of await deps.loadPending(new Date(now - CREATION_LEASE_MS))) {
    if (row.txHash) {
      const back = await deps.readBack(row.txHash);
      if (back.kind === "made") {
        await record(row, { giftId: back.giftId, hash: row.txHash, escrow: back.escrow }, row.claimTokenHash, deps);
        lines.push({ nonce: row.nonce, result: "completed", giftId: back.giftId });
        continue;
      }
      if (back.kind === "unknown") {
        lines.push({ nonce: row.nonce, result: "skipped: its transaction is not final yet" });
        continue;
      }
    }
    if (await deps.spent(row.funder as Hex, row.nonce)) {
      lines.push({ nonce: row.nonce, result: "needs an operator: the money moved and no transaction is recorded" });
      continue;
    }
    if (now - row.startedAt.getTime() >= CREATION_ABANDON_MS) {
      await deps.abandon(row.nonce);
      lines.push({ nonce: row.nonce, result: "abandoned: its money never moved" });
    }
  }
  return lines;
}
