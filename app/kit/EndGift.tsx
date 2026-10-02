"use client";
import { useState } from "react";
import type { Hex } from "viem";
import { isAccountError } from "@/src/account/errors";
import { useAccount } from "@/src/account/provider";
import { ApiError } from "@/src/client/api";
import { endGift } from "@/src/client/v2";
import type { EndOffer } from "@/src/gift-ending";
import { END_GIFT as E, YOU_DECIDE as Y } from "@/src/sentences";
import { CARD_LABEL } from "../components/ui";

/**
 * Ending a gift (the audit of 1 Oct 2026, section 3.6): the person a gift is for ends it. What was counted stays
 * theirs, the rest goes back to the person who offered it, at once, and it cannot be undone.
 *
 * It is one of the two choices of the sheet "Stop" opens (app/kit/YouDecide.tsx, the mockup you-decide.html), offered
 * to the person the gift is for and to nobody else, on a gift of the second version of the contracts and no other: the
 * page offers it only when the gift's status carries what an ending would do.
 *
 * The confirmation shows the two amounts the contract moves, the ones the person's account then signs, to the unit:
 * the contract works both out again and refuses if either differs. Because an ending cannot be undone, the passkey
 * is asked again even with the session open: a press by whoever holds the phone is not enough.
 */
export function useEnding({ giftId, contract, offer, onEnded }: Readonly<{ giftId: string; contract: Hex | null; offer: EndOffer | null; onEnded: () => void | Promise<void> }>) {
  const { confirmWithPasskey } = useAccount();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  /** Ends the gift, and answers whether it did. */
  const end = async (): Promise<boolean> => {
    if (!contract || !offer) return false;
    setBusy(true);
    setProblem(null);
    try {
      const account = await confirmWithPasskey();
      await endGift({ account, giftId, contract, offer });
      await onEnded();
      return true;
    } catch (error) {
      // The server's own sentence when it has one (the amounts changed, the gift is finished), the passkey's when the
      // passkey refused, and otherwise the one true thing: nothing was changed.
      setProblem(error instanceof ApiError ? error.message : isAccountError(error) ? error.guidance : E.failed);
      // An ending refused because the amounts moved: the page is read again so the sheet shows the new ones.
      if (error instanceof ApiError && error.code === "END_CHANGED") await onEnded();
      return false;
    } finally {
      setBusy(false);
    }
  };

  return { busy, problem, end, forget: () => setProblem(null) };
}

/**
 * An ending in two figures (the mockup's third frame): what stays theirs and what goes back, each in its own box,
 * where a sentence said both. When nothing stays theirs, what goes back stands alone: "$0.00" is never printed.
 */
export function EndFigures({ offer, funderName }: Readonly<{ offer: EndOffer; funderName: string | null }>) {
  const nothingKept = BigInt(offer.keep) === 0n;
  return (
    <div className="decide-two" data-end-figures>
      {nothingKept ? null : (
        <div>
          <p className="decide-amount">{offer.keepDisplay}</p>
          <p className={`${CARD_LABEL} decide-label`}>{Y.yours}</p>
        </div>
      )}
      <div>
        <p className="decide-amount">{offer.giveBackDisplay}</p>
        <p className={`${CARD_LABEL} decide-label`}>{Y.backTo(funderName)}</p>
      </div>
    </div>
  );
}
