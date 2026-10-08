"use client";
import { useState, useSyncExternalStore } from "react";
import { ApiError } from "@/src/client/api";
import { useAccount } from "@/src/account/provider";
import { giftLinkAgain, giftLinkFound } from "@/src/client/gift";
import { followGiftLinks, giftLinkOnThisDevice, rememberGiftLink } from "@/src/gift-link-memory";
import { GIFT_PAGE as W } from "@/src/sentences";
import { BODY, HELP, PRIMARY_BUTTON, SECONDARY_BUTTON } from "../components/ui";
import { Button, useDone } from "./Button";
import { FieldRefusal } from "./FieldRefusal";
import { Sheet } from "./Sheet";
import { WAITS } from "@/src/sentences";

/**
 * The link of a gift nobody has opened, on the gift's own page, for the person who offered it. It is the screen after
 * paying since the UI pass of 8 Oct 2026 (screen 3): the gift's card says "Send it", and this is what is sent. It
 * stands in that card with no frame and no title of its own.
 *
 * On the device that holds the link: the link in its field, where a press copies it; "Copy the link", which says
 * "Copied" for a moment; and "Share" where the device can. Nothing more: that the device keeps it, and a way to find
 * a link that is right there, were said under it and are gone.
 *
 * On a device that does not hold it, two different things (gift 1000001, 19 Sep 2026: the tab was closed before the
 * link was copied, and there was no way back at all):
 * - A gift of the second version of the contracts has no key to replace (the audit of 1 Oct 2026): the key that opens
 *   it is in the terms the funder signed. The link is found again by the funder's own account signing the gift's
 *   salt, on any device, and it is the same link. So one button finds it, and the line under it says what it gives
 *   before the press: a step with no decision is the button's own state, never a sheet (rule 4 of the pass).
 * - A gift of the first contract keeps only the key's fingerprint, by design, so the old link can never be read back:
 *   a new key is made and the old link stops working. That is a decision, read in a sheet before the gesture.
 *
 * Shown only to the funder, and only while the gift is not open. Both are decided by the page that mounts this.
 */

const onServer = () => null;
const canShareHere = () => typeof navigator !== "undefined" && typeof navigator.share === "function";
const never = () => () => {};
const cannotShare = () => false;

export function LinkAgain({
  giftId,
  shareText,
  found = false,
}: Readonly<{ giftId: string; /** The words the link is shared with: who, how much, what it is. */ shareText: string; /** The gift's link is found again rather than replaced. */ found?: boolean }>) {
  const { ensureSigner } = useAccount();
  // The device's own memory, read in the browser and followed: the link found here is drawn the moment it is kept.
  const link = useSyncExternalStore(followGiftLinks, () => giftLinkOnThisDevice(giftId), onServer);
  const browser = useSyncExternalStore(never, () => true, () => false);
  const sharing = useSyncExternalStore(never, canShareHere, cannotShare);
  /** Whether the link on screen was brought here by a press on this page, and so says what it is. */
  const [brought, setBrought] = useState(false);
  const [busy, setBusy] = useState(false);
  /** "Copied", for the moment the button says it, then it copies again (app/kit/Button.tsx). */
  const [copied, markCopied] = useDone();
  const [refusal, setRefusal] = useState<string | null>(null);
  /** The sheet that says what the gesture does to the link already sent, on a gift of the first contract. */
  const [asking, setAsking] = useState(false);

  const copy = (value: string) => {
    setRefusal(null);
    navigator.clipboard
      .writeText(value)
      .then(() => markCopied())
      .catch(() => setRefusal(W.linkCopyRefused));
  };

  const bring = async () => {
    setBusy(true);
    setRefusal(null);
    try {
      // Found again by the funder's own account, which is opened here if it is not: the passkey makes the link.
      const { claimUrl } = found ? await giftLinkFound(await ensureSigner(), giftId) : await giftLinkAgain(giftId);
      // This device now holds the link, exactly as the device that made the gift did.
      rememberGiftLink(giftId, claimUrl);
      setBrought(true);
      setAsking(false);
    } catch (error) {
      // Our own typed refusal verbatim (the gift is open, it is not yours), anything else as the one true sentence:
      // a failure on our side changed nothing, so whatever link the funder had is still the live one.
      setRefusal(error instanceof ApiError ? error.message : found ? W.linkFindFailed : W.linkAgainFailed);
    }
    setBusy(false);
  };

  // Which of the two it is cannot be said before the browser has read its own memory: nothing is drawn until then.
  if (!browser) return null;

  if (link) {
    return (
      <div className="flex flex-col gap-[var(--space-md)]" data-gift-link-block="">
        {/* The link, where a press copies it: the field is the first thing somebody presses to take a link. It stays
            text, so a browser that refuses the clipboard still lets it be held and copied by hand. */}
        <p
          onClick={() => copy(link)}
          className="cursor-pointer break-all rounded-[var(--radius-control)] border-[length:var(--card-border-width)] border-[var(--card-border)] bg-[var(--background)] p-[var(--space-md)] text-[length:var(--type-help)] select-all"
          data-gift-link=""
        >
          {link}
        </p>
        {brought ? (
          <p className={BODY} role="status">
            {found ? W.linkFound : W.linkAgainDone}
          </p>
        ) : null}
        {/* Sending the link is the one action of this moment: the sun. */}
        <Button done={copied ? W.copied : null} failed={refusal} failedId={`link-refused-${giftId}`} onPress={() => copy(link)} data-copy-the-link="">
          {W.copyLink}
        </Button>
        {sharing ? (
          <button type="button" onClick={() => void navigator.share({ title: "Viky", text: shareText, url: link }).catch(() => undefined)} className={SECONDARY_BUTTON}>
            {W.shareLink}
          </button>
        ) : null}
      </div>
    );
  }

  if (found) {
    return (
      <div className="flex flex-col gap-[var(--space-md)]" data-gift-link-block="">
        <Button look="secondary" doing={busy ? W.findingLink : null} failed={refusal} failedId={`link-refused-${giftId}`} onPress={() => void bring()} data-find-the-link="">
          {W.findTheLink}
        </Button>
        <p className={HELP}>{W.sameLink}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[var(--space-md)]" data-gift-link-block="">
      {/* A gift of the first contract: what pressing does to the link already sent is read in the sheet, before the press. */}
      <button type="button" onClick={() => setAsking(true)} disabled={busy} className={PRIMARY_BUTTON}>
        {W.getLinkAgain}
      </button>
      {refusal && !asking ? <FieldRefusal id={`link-again-${giftId}`}>{refusal}</FieldRefusal> : null}
      <Sheet
        open={asking}
        title={W.getLinkAgain}
        onClose={() => {
          if (!busy) setAsking(false);
        }}
        footer={
          <>
            <Button doing={busy ? W.gettingLink : null} step={WAITS.newLink} failed={refusal} failedId={`link-again-sheet-${giftId}`} onPress={() => void bring()}>
              {W.getLinkAgain}
            </Button>
            <button type="button" onClick={() => setAsking(false)} disabled={busy} className={SECONDARY_BUTTON}>
              {W.notNow}
            </button>
          </>
        }
      >
        {/* Full strength, not the muted help grey: this is the one line saying that pressing kills a link the funder
            may already have sent. */}
        <p className={BODY}>{W.linkAgainWhy}</p>
      </Sheet>
    </div>
  );
}
