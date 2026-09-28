import type { Hex } from "viem";
import type { ContractAuthorization } from "./ausd-authorization";
import { alreadySpent } from "./exit-relay";
import { completePendingCreations, makeGift, type CreationDeps, type CreationLine } from "./gift-creation";
import {
  abandonCreation,
  beginCreation,
  completeCreation,
  loadCreation,
  loadPendingCreations,
  markCreationSubmitted,
  restartCreation,
  saveGift,
  type MilestoneCreationFacts,
} from "./gift-store";
import { createdMilestoneOf, relayCreateMilestone } from "./milestone-relay";
import type { MilestoneParams } from "./milestone-protocol";
import { saveMilestoneGift } from "./milestone-store";

/**
 * Making a milestone gift in the order D87 set for every gift: the creation recorded before the money moves, the
 * transaction written the moment it is submitted, the gift recorded after, and a creation left pending completed by a
 * retry of the same terms or by the keeper. It is the same code as a daily gift's (`makeGift`), given the milestone
 * contract's relay, its event read back, and its own record, which the creation carries until the gift exists.
 */

export type MilestoneCreationInput = Readonly<{
  params: MilestoneParams;
  authorization: ContractAuthorization;
  nonce: Hex;
  goalUsername: string;
  recipientName?: string;
  funderName?: string;
  facts: MilestoneCreationFacts;
}>;

/**
 * The dependencies of a milestone creation. `params` is the milestone's own terms, which the relay sends; the shared
 * creation code sees the columns every gift has, and a milestone has no daily bar, so that one is zero.
 */
export function liveMilestoneCreationDeps(params?: MilestoneParams, facts?: MilestoneCreationFacts): CreationDeps {
  return {
    begin: (row) => beginCreation({ ...row, kind: "milestone", milestone: facts ?? null }),
    restart: restartCreation,
    submitted: markCreationSubmitted,
    relay: async (_daily, authorization, onSubmitted) => {
      if (!params) throw new Error("A milestone creation is relayed with its own terms");
      const created = await relayCreateMilestone(params, authorization, onSubmitted);
      return { giftId: created.giftId, hash: created.hash, escrow: created.contract };
    },
    readBack: createdMilestoneOf,
    spent: (funder, nonce) => alreadySpent(funder, nonce),
    save: saveGift,
    // The milestone's own record goes in before the creation is marked complete, so a failure here leaves it pending.
    complete: async (nonce, giftId, txHash, claimTokenHashOfLink) => {
      const row = await loadCreation(nonce);
      const recorded = facts ?? row?.milestone ?? null;
      if (!recorded) throw new Error(`Creation ${nonce} carries no milestone record`);
      await saveMilestoneGift({ giftId, conditionId: recorded.conditionId, mode: recorded.mode, standingAtOffer: recorded.standingAtOffer, standingReadAt: new Date(recorded.standingReadAt), portal: recorded.portal ?? null, course: recorded.course ?? null, gradeScale: recorded.gradeScale ?? null });
      await completeCreation(nonce, giftId, txHash, claimTokenHashOfLink);
    },
    abandon: abandonCreation,
    loadPending: (startedBefore) => loadPendingCreations(startedBefore, "milestone"),
    now: () => Date.now(),
  };
}

export async function makeMilestoneGift(input: MilestoneCreationInput, deps: CreationDeps = liveMilestoneCreationDeps(input.params, input.facts)) {
  const p = input.params;
  return makeGift(
    {
      params: { funder: p.funder, refundTo: p.refundTo, recipientContactHash: p.recipientContactHash, goalType: p.goalType, dailyTarget: 0, durationDays: p.durationDays, amount: p.amount, salt: p.salt },
      authorization: input.authorization,
      nonce: input.nonce,
      goalUsername: input.goalUsername,
      recipientName: input.recipientName,
      funderName: input.funderName,
    },
    deps,
  );
}

/** The keeper's part for milestone gifts: every milestone creation still pending is completed, abandoned or reported. */
export function completePendingMilestoneCreations(deps: CreationDeps = liveMilestoneCreationDeps()): Promise<CreationLine[]> {
  return completePendingCreations(deps);
}
