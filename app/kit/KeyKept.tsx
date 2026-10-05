"use client";
import { useEffect, useState } from "react";
import { useOnAComputer } from "@/src/account/door";
import { useKeyKept } from "@/src/account/provider";
import { ACCOUNT_DOOR as W } from "@/src/sentences";
import { BODY, CARD, HELP, SMALL_BUTTON } from "../components/ui";

/**
 * Where the account's key is kept, said on a computer once the browser has said it (the founder, 5 Oct 2026;
 * src/account/key-kept.ts). An account is made wherever it serves, at a payment or on a gift's link, so what its key
 * turned out to be is said where everybody arrives afterwards, and not in one of the doors.
 */

/** Which passkey's notice was read on this device: it is not shown again for that one. */
const READ_KEY = "viky.key.kept.read";

/** The sentence for this device, or nothing: on a phone, before any ceremony said, or for a store nothing is known of. */
function useKeptSentence(): Readonly<{ sentence: string; here: boolean; credentialId: string }> | null {
  const kept = useKeyKept();
  const computer = useOnAComputer();
  if (!computer || !kept) return null;
  const sentence = W.keyKept(kept);
  return sentence ? { sentence, here: !kept.follows && !kept.apart, credentialId: kept.credentialId } : null;
}

/**
 * On Home, once: a key this computer keeps for itself alone opens the account nowhere else, and the person learns it
 * the day they look for their account on their phone unless it is said. Any other key is said on Me, without a notice.
 */
export function KeyKeptNotice() {
  const said = useKeptSentence();
  const [read, setRead] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    // Past the body of the effect, as the screen's other readings of the device are.
    void Promise.resolve().then(() => {
      if (!live) return;
      try {
        setRead(window.localStorage.getItem(READ_KEY));
      } catch {
        setRead(null);
      }
    });
    return () => {
      live = false;
    };
  }, []);
  if (!said || !said.here || read === undefined || read === said.credentialId) return null;
  const gotIt = () => {
    setRead(said.credentialId);
    try {
      window.localStorage.setItem(READ_KEY, said.credentialId);
    } catch {
      // A browser that keeps nothing shows it again on its next visit.
    }
  };
  return (
    <section className={CARD} role="status" data-key-kept="here">
      <p className={BODY}>{said.sentence}</p>
      <button type="button" onClick={gotIt} className={`${SMALL_BUTTON} self-start`}>
        {W.gotIt}
      </button>
    </section>
  );
}

/** The same fact as one line of the account's own screen, for as long as it is true. */
export function KeyKeptLine() {
  const said = useKeptSentence();
  if (!said) return null;
  return (
    <p className={HELP} data-key-kept="line">
      {said.sentence}
    </p>
  );
}
