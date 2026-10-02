"use client";
import { useState } from "react";
import { useAccount } from "@/src/account/provider";
import { ApiError, postJson } from "@/src/client/api";
import { sendWithExplicitGas } from "@/src/client/onchain";
import { GIFT_PAGE as W } from "@/src/sentences";
import { BODY, PRIMARY_BUTTON, SECONDARY_BUTTON } from "../components/ui";
import { FieldRefusal } from "./FieldRefusal";
import { Sheet } from "./Sheet";

/**
 * Taking back a gift nobody has opened (the founder's third defect on gift 1000001, 19 Sep 2026). The contract has
 * had `cancel(giftId)` from the first day and no screen ever offered it, so a funder who set a gift up and never sent
 * the link had to wait fourteen days for it to come back by itself.
 *
 * Irreversible, so it is built like every irreversible gesture here: a reading before, with the amount that comes
 * back and what stops working, and a confirmation after, with the amount and the date it happened. The reading is a
 * sheet, opened from the funder's round button (app/kit/FunderControls.tsx, the founder's rules of 1 Oct 2026): it was
 * a link under the card, and a card that opened below the fold of a phone.
 *
 * The contract insists on the funder in person, so this is the one call the relayer cannot carry: the route puts what
 * the account needs in place and hands back the call, and this account sends it with its own key.
 */

export type TakenBack = Readonly<{ amount: string; atMs: number }>;

export function TakeItBackSheet({
  open,
  giftId,
  amountDisplay,
  recipientName,
  onClose,
  onTakenBack,
}: Readonly<{ open: boolean; giftId: string; amountDisplay: string; recipientName: string | null; onClose: () => void; onTakenBack: (done: TakenBack) => void | Promise<void> }>) {
  const { ensureSigner, status } = useAccount();
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const working = busy || status === "busy";

  const takeItBack = async () => {
    setBusy(true);
    setRefusal(null);
    try {
      // The passkey opens at the one moment a signature is needed, as everywhere else money moves.
      const signer = await ensureSigner();
      const ready = await postJson<{ to: `0x${string}`; data: `0x${string}`; gas: string; comingBackDisplay: string }>(`/api/gift/${giftId}/cancel`, {});
      await sendWithExplicitGas(signer, { to: ready.to, data: ready.data });
      await onTakenBack({ amount: ready.comingBackDisplay, atMs: Date.now() });
    } catch (error) {
      setRefusal(error instanceof ApiError ? error.message : W.takeBackFailed);
    }
    setBusy(false);
  };

  return (
    <Sheet
      open={open}
      title={W.takeBackFor(recipientName)}
      onClose={() => {
        if (!busy) onClose();
      }}
      footer={
        <>
          <button type="button" onClick={() => void takeItBack()} disabled={working} className={PRIMARY_BUTTON}>
            {busy ? W.takingBack : W.takeBackConfirm(amountDisplay)}
          </button>
          <button type="button" onClick={onClose} disabled={working} className={SECONDARY_BUTTON}>
            {W.notNow}
          </button>
          {refusal ? <FieldRefusal id={`take-back-${giftId}`}>{refusal}</FieldRefusal> : null}
        </>
      }
    >
      <p className={BODY}>{W.takeBackReview(amountDisplay)}</p>
      {/* What this costs is said at full strength, not in the muted help grey: it is half of what the person is
          deciding, and it was the palest text on the card until the review of 19 Sep 2026. */}
      <p className={BODY}>{W.takeBackAndLink}</p>
    </Sheet>
  );
}
