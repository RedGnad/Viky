import type { Hex } from "viem";
import { alreadySpent } from "./exit-relay";
import type { CreationDeps } from "./gift-creation";
import { createdGiftOf, relayCreateGift } from "./gift-relay";
import {
  abandonCreation,
  beginCreation,
  completeCreation,
  loadPendingCreations,
  markCreationSubmitted,
  restartCreation,
  saveGift,
} from "./gift-store";

/** The creation's dependencies as production runs them: the database, the relayer, and the chain read back (D87). */
export function liveCreationDeps(): CreationDeps {
  return {
    begin: beginCreation,
    restart: restartCreation,
    submitted: markCreationSubmitted,
    relay: (params, authorization, onSubmitted) => relayCreateGift(params, authorization, onSubmitted),
    readBack: async (txHash: Hex) => {
      const back = await createdGiftOf(txHash);
      return back.kind === "made" ? { kind: "made", giftId: back.giftId, escrow: back.escrow } : back;
    },
    spent: (funder, nonce) => alreadySpent(funder, nonce),
    save: saveGift,
    complete: completeCreation,
    abandon: abandonCreation,
    loadPending: loadPendingCreations,
    now: () => Date.now(),
  };
}
