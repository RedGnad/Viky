"use client";
import { useState, useSyncExternalStore } from "react";
import { ApiError } from "@/src/client/api";
import { giftLinkAgain } from "@/src/client/gift";
import { giftLinkOnThisDevice, rememberGiftLink } from "@/src/gift-link-memory";
import { GIFT_PAGE as W } from "@/src/sentences";
import { BODY, CARD, HELP, INLINE_BUTTON, SECONDARY_BUTTON, TITLE } from "../components/ui";
import { FieldRefusal } from "./FieldRefusal";

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
 */

const never = () => () => {};
const inBrowser = () => true;
const onServer = () => false;

export function LinkAgain({ giftId, recipientName }: Readonly<{ giftId: string; recipientName: string | null }>) {
  const browser = useSyncExternalStore(never, inBrowser, onServer);
  const [made, setMade] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const kept = browser ? giftLinkOnThisDevice(giftId) : null;
  const link = made ?? kept;
  const sharing = browser && typeof navigator !== "undefined" && typeof navigator.share === "function";

  const copy = (value: string) => {
    setRefusal(null);
    navigator.clipboard
      .writeText(value)
      .then(() => setCopied(true))
      .catch(() => setRefusal(W.copyRefused));
  };

  const askAgain = async () => {
    setBusy(true);
    setRefusal(null);
    setCopied(false);
    try {
      const { claimUrl } = await giftLinkAgain(giftId);
      // This device now holds the only live link, exactly as the device that made the gift did.
      rememberGiftLink(giftId, claimUrl);
      setMade(claimUrl);
    } catch (error) {
      // Our own typed refusal verbatim (the gift is open, it is not yours), anything else as the one true sentence:
      // a failure on our side changed nothing, so whatever link the funder had is still the live one.
      setRefusal(error instanceof ApiError ? error.message : W.linkAgainFailed);
    }
    setBusy(false);
  };

  return (
    <section className={CARD}>
      <h2 className={TITLE}>{W.linkAgainTitle}</h2>
      {link ? (
        <p className="break-all rounded-[var(--radius-control)] border-[length:var(--card-border-width)] border-[var(--card-border)] bg-[var(--background)] p-[var(--space-md)] text-[length:var(--type-help)] select-all">{link}</p>
      ) : null}
      {/* What this link is stands above every button: a funder who copies and leaves must have read that the link
          they had is dead, and in the first state that pressing the button is what kills it. */}
      {made ? <p className={BODY} role="status">{W.linkAgainDone}</p> : null}
      {kept && !made ? <p className={HELP}>{W.linkOnlyHere}</p> : null}
      {/* Full strength, not the muted help grey: this is the one line saying that pressing kills a link the funder
          may already have sent, and it was the palest text on the card until the review of 19 Sep 2026. */}
      {made ? null : <p className={BODY}>{W.linkAgainWhy}</p>}
      {link ? (
        <button type="button" onClick={() => copy(link)} className={SECONDARY_BUTTON}>
          {copied ? W.copied : made ? W.copyLink : W.copyLinkAgain}
        </button>
      ) : null}
      {link && sharing ? (
        <button
          type="button"
          onClick={() => void navigator.share({ title: "Viky", text: W.shareLinkText(recipientName), url: link }).catch(() => undefined)}
          className={SECONDARY_BUTTON}
        >
          {W.shareLink}
        </button>
      ) : null}
      {made ? null : (
        <button type="button" onClick={() => void askAgain()} disabled={busy} className={link ? INLINE_BUTTON : SECONDARY_BUTTON}>
          {busy ? W.gettingLink : W.getLinkAgain}
        </button>
      )}
      {refusal ? <FieldRefusal id={`link-again-${giftId}`}>{refusal}</FieldRefusal> : null}
    </section>
  );
}
