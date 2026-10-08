"use client";
import { useState, useSyncExternalStore } from "react";
import { ApiError } from "@/src/client/api";
import { useAccount } from "@/src/account/provider";
import { giftLinkAgain, giftLinkFound } from "@/src/client/gift";
import { giftLinkOnThisDevice, rememberGiftLink } from "@/src/gift-link-memory";
import { GIFT_PAGE as W } from "@/src/sentences";
import { BODY, CARD, HELP, PRIMARY_BUTTON, SECONDARY_BUTTON, SMALL_BUTTON, TITLE } from "../components/ui";
import { Button, useDone } from "./Button";
import { FieldRefusal } from "./FieldRefusal";
import { Sheet } from "./Sheet";
import { WAITS } from "@/src/sentences";

/**
 * The link of a gift nobody has opened, given back to the funder (gift 1000001, 19 Sep 2026: the tab was closed
 * before the link was copied, and there was no way back at all).
 *
 * Two ways, because they are two different things. The device that made the gift kept the link, so it can simply
 * show it again. Any other device cannot: only the key's fingerprint is kept, by design, so the old link can never be
 * read back. There, a new key is made and the old link stops working, which the screen says before the gesture and
 * again after it.
 *
 * Shown only to the funder, and only while the gift is not open. Both are decided by the page that mounts this.
 *
 * A gift of the second version of the contracts has no key to replace (the audit of 1 Oct 2026): the key that opens
 * it is in the terms the funder signed. There the link is found again, by the funder's own account signing the gift's
 * salt, on any device, and it is the same link: nothing stops working, and the sentences say so (`found`).
 */

const never = () => () => {};
const inBrowser = () => true;
const onServer = () => false;

export function LinkAgain({
  giftId,
  shareText,
  found = false,
}: Readonly<{ giftId: string; /** The words the link is shared with: who, how much, what it is. */ shareText: string; /** The gift's link is found again rather than replaced. */ found?: boolean }>) {
  const { ensureSigner } = useAccount();
  const browser = useSyncExternalStore(never, inBrowser, onServer);
  const [made, setMade] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** "Copied", for the moment the button says it, then it copies again (app/kit/Button.tsx). */
  const [copied, markCopied] = useDone();
  const [refusal, setRefusal] = useState<string | null>(null);
  /** The sheet that says what the gesture does to the link already sent, before it is made. */
  const [asking, setAsking] = useState(false);
  const kept = browser ? giftLinkOnThisDevice(giftId) : null;
  const link = made ?? kept;
  const sharing = browser && typeof navigator !== "undefined" && typeof navigator.share === "function";

  const copy = (value: string) => {
    setRefusal(null);
    navigator.clipboard
      .writeText(value)
      .then(() => markCopied())
      .catch(() => setRefusal(W.copyRefused));
  };

  const askAgain = async () => {
    setBusy(true);
    setRefusal(null);
    try {
      // Found again by the funder's own account, which is opened here if it is not: the passkey makes the link.
      const { claimUrl } = found ? await giftLinkFound(await ensureSigner(), giftId) : await giftLinkAgain(giftId);
      // This device now holds the only live link, exactly as the device that made the gift did.
      rememberGiftLink(giftId, claimUrl);
      setMade(claimUrl);
      setAsking(false);
    } catch (error) {
      // Our own typed refusal verbatim (the gift is open, it is not yours), anything else as the one true sentence:
      // a failure on our side changed nothing, so whatever link the funder had is still the live one.
      setRefusal(error instanceof ApiError ? error.message : found ? W.linkFindFailed : W.linkAgainFailed);
    }
    setBusy(false);
  };

  /** The words of the one gesture: found again where the link is the same one, made again where the old one dies. */
  const again = found ? W.linkFind : W.getLinkAgain;

  return (
    <section className={CARD}>
      <h2 className={TITLE}>{W.linkAgainTitle}</h2>
      {link ? (
        <p className="break-all rounded-[var(--radius-control)] border-[length:var(--card-border-width)] border-[var(--card-border)] bg-[var(--background)] p-[var(--space-md)] text-[length:var(--type-help)] select-all">{link}</p>
      ) : null}
      {made ? <p className={BODY} role="status">{found ? W.linkFound : W.linkAgainDone}</p> : null}
      {kept && !made ? <p className={HELP}>{W.linkOnlyHere}</p> : null}
      {/* Sending the link is the one action of this moment: the sun, once the link is here. */}
      {link ? (
        <Button done={copied ? W.copied : null} onPress={() => copy(link)}>
          {made ? W.copyLink : W.copyLinkAgain}
        </Button>
      ) : null}
      {link && sharing ? (
        <button
          type="button"
          onClick={() => void navigator.share({ title: "Viky", text: shareText, url: link }).catch(() => undefined)}
          className={SECONDARY_BUTTON}
        >
          {W.shareLink}
        </button>
      ) : null}
      {/* The way to a link this device does not hold: the one action when there is no link here, a small button
          beside one that is. What pressing it does to the link already sent is read in the sheet, before the press. */}
      {made ? null : (
        <button type="button" onClick={() => setAsking(true)} disabled={busy} className={link ? `${SMALL_BUTTON} self-start` : PRIMARY_BUTTON}>
          {again}
        </button>
      )}
      {refusal && !asking ? <FieldRefusal id={`link-again-${giftId}`}>{refusal}</FieldRefusal> : null}
      <Sheet
        open={asking}
        title={again}
        onClose={() => {
          if (!busy) setAsking(false);
        }}
        footer={
          <>
            <Button doing={busy ? W.gettingLink : null} step={WAITS.newLink} failed={refusal} failedId={`link-again-sheet-${giftId}`} onPress={() => void askAgain()}>
              {again}
            </Button>
            <button type="button" onClick={() => setAsking(false)} disabled={busy} className={SECONDARY_BUTTON}>
              {W.notNow}
            </button>
          </>
        }
      >
        {/* Full strength, not the muted help grey: on a gift of the first version this is the one line saying that
            pressing kills a link the funder may already have sent. */}
        <p className={BODY}>{found ? W.linkFindWhy : W.linkAgainWhy}</p>
      </Sheet>
    </section>
  );
}
