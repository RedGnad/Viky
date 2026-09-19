"use client";
import { useEffect, useRef, useState } from "react";
import { useAccount } from "@/src/account/provider";
import { ApiError, postJson } from "@/src/client/api";
import { sendWithExplicitGas } from "@/src/client/onchain";
import { whenInWords } from "@/src/display-currency";
import { GIFT_PAGE as W } from "@/src/sentences";
import { BODY, CARD, HELP, PRIMARY_BUTTON, SECONDARY_BUTTON, TITLE } from "../components/ui";
import { FieldRefusal } from "./FieldRefusal";

/**
 * Taking back a gift nobody has opened (the founder's third defect on gift 1000001, 19 Sep 2026). The contract has
 * had `cancel(giftId)` from the first day and no screen ever offered it, so a funder who set a gift up and never sent
 * the link had to wait fourteen days for it to come back by itself.
 *
 * Irreversible, so it is built like every irreversible gesture here: a reading before, with the amount that comes
 * back and what stops working, and a confirmation after, with the amount and the date it happened.
 *
 * The contract insists on the funder in person, so this is the one call the relayer cannot carry: the route puts what
 * the account needs in place and hands back the call, and this account sends it with its own key.
 */

type Done = Readonly<{ amount: string; atMs: number }>;

export function TakeItBack({ giftId, amountDisplay, recipientName, onTakenBack }: Readonly<{ giftId: string; amountDisplay: string; recipientName: string | null; onTakenBack?: () => Promise<void> }>) {
  const { ensureSigner, status } = useAccount();
  const [reviewing, setReviewing] = useState(false);
  /**
   * The card opens at the foot of a page somebody is reading from the top, so on a phone it opened entirely below the
   * fold: all that showed was a sliver of the button that cannot be undone, with its way out off screen, and the page
   * did not move by itself (ui review, 19 Sep 2026). It moves now, and the whole decision is on the screen.
   */
  const card = useRef<HTMLElement>(null);
  useEffect(() => {
    if (reviewing) card.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [reviewing]);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const working = busy || status === "busy";

  const takeItBack = async () => {
    setBusy(true);
    setRefusal(null);
    try {
      // The passkey opens at the one moment a signature is needed, as everywhere else money moves.
      const signer = await ensureSigner();
      const ready = await postJson<{ to: `0x${string}`; data: `0x${string}`; gas: string; comingBackDisplay: string }>(`/api/gift/${giftId}/cancel`, {});
      await sendWithExplicitGas(signer, { to: ready.to, data: ready.data });
      setReviewing(false);
      setDone({ amount: ready.comingBackDisplay, atMs: Date.now() });
      await onTakenBack?.();
    } catch (error) {
      setRefusal(error instanceof ApiError ? error.message : W.takeBackFailed);
    }
    setBusy(false);
  };

  if (done) {
    return (
      <section className={CARD} role="status">
        <p className="font-medium">{W.takenBack(done.amount, whenInWords(done.atMs))}</p>
        <p className={HELP}>{W.takenBackLink}</p>
      </section>
    );
  }

  if (!reviewing) {
    return (
      <div className="flex flex-col gap-[var(--space-xs)]">
        <button type="button" onClick={() => setReviewing(true)} disabled={working} className={`${HELP} inline-flex min-h-[var(--tap-target)] items-center self-start underline`}>
          {W.takeBack}
        </button>
        {refusal ? <FieldRefusal id={`take-back-${giftId}`}>{refusal}</FieldRefusal> : null}
      </div>
    );
  }

  return (
    <section className={CARD} ref={card}>
      <h2 className={TITLE}>{W.takeBackFor(recipientName)}</h2>
      <p className={BODY}>{W.takeBackReview(amountDisplay)}</p>
      {/* What this costs is said at full strength, not in the muted help grey: it is half of what the person is
          deciding, and it was the palest text on the card until the review of 19 Sep 2026. */}
      <p className={BODY}>{W.takeBackAndLink}</p>
      <button type="button" onClick={() => void takeItBack()} disabled={working} className={PRIMARY_BUTTON}>
        {busy ? W.takingBack : W.takeBackConfirm(amountDisplay)}
      </button>
      {refusal ? <FieldRefusal id={`take-back-${giftId}`}>{refusal}</FieldRefusal> : null}
      <button type="button" onClick={() => setReviewing(false)} disabled={working} className={SECONDARY_BUTTON}>
        {W.notNow}
      </button>
    </section>
  );
}
