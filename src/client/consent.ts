import type { Address } from "viem";
import { isSignedIn, passkeyOutputFor, signIn } from "../account/mera";
import { consentBytes, toHex, type ConsentKind } from "../consent";
import type { ConsentTerms } from "../consent-terms";
import { getJson, postJson } from "./api";
import { consentKey, consentSalt, keepConsentOutput } from "./consent-key";
import { currentServerSession } from "./server-session";

/**
 * The recipient's yes and stop, from the browser (the founder, 29 Sep 2026). The yes is signed at the gesture the person
 * already makes, connect, name the account, open the portal, share the certificate, so no screen and no prompt is
 * added: the consent key was made when they signed in. A page that holds no key any more signs the person in again
 * at that gesture, and a device that gave no second output is asked once, here (`keyForSigning`).
 */

export type ConsentState = Readonly<{ kind: ConsentKind; signedAt: string }> | null;

/** What a reading would find now: the yes, the time before agreements, or no agreement (never given, or stopped). */
export type ConsentReading = "agreed" | "before_agreements" | "no_agreement";

export type GiftConsentAnswer = Readonly<{
  giftId: string;
  state: ConsentState;
  reading: ConsentReading;
  opened: boolean;
  finished: boolean;
  terms: ConsentTerms;
  until: string;
  texts?: Readonly<{ yes: string; stop: string }>;
}>;

export function loadConsent(giftId: string): Promise<GiftConsentAnswer> {
  return getJson(`/api/gift/${giftId}/consent`);
}

/**
 * The consent key, held or made now (the audit of 1 Oct 2026).
 *
 * A page signed in by the server's cookie alone holds no key: after a reload, in the app on the home screen of an
 * iPhone, which is given the cookies and not the storage, or once storage was cleared. Asking the passkey for the
 * consent salt alone needs to know which passkey, and there nothing says which, so no prompt opened at all and every
 * yes and every stop failed. So, with no key held and no account open, the person signs in: one prompt, both salts,
 * the passkey of their choosing where none is remembered. It is opened only as the account the cookie names, because
 * the first consent key a gift is shown is the one the server keeps: a passkey of another account must never sign.
 *
 * A device whose passkey answers the first salt and not the second is still asked once more, for the second alone.
 */
async function keyForSigning() {
  const held = consentKey();
  if (held) return held;
  if (!isSignedIn()) {
    await signIn({ as: currentServerSession().then((session) => (session ? (session.account as Address) : null)) });
    const made = consentKey();
    if (made) return made;
  }
  const output = await passkeyOutputFor(consentSalt());
  try {
    keepConsentOutput(output);
  } finally {
    output.fill(0);
  }
  const kept = consentKey();
  if (!kept) throw new Error("No consent key");
  return kept;
}

/** Signs this gift's yes or stop with the consent key and keeps it. Answers the gift's new state. */
export async function signConsent(giftId: string, kind: ConsentKind, loaded?: GiftConsentAnswer): Promise<ConsentState> {
  const answer = loaded ?? (await loadConsent(giftId));
  const text = answer.texts?.[kind];
  if (!text) throw new Error("Only the person the gift is for can agree or stop.");
  const key = await keyForSigning();
  const signature = await key.signMessage(consentBytes(text));
  const kept = await postJson<{ state: ConsentState }>(`/api/gift/${giftId}/consent`, { kind, publicKey: toHex(key.publicKey), signature: toHex(signature) });
  return kept.state;
}

/** The yes, at the gesture that asks for a reading: signed once, and not again while it holds. */
export async function agreeFirst(giftId: string): Promise<void> {
  const answer = await loadConsent(giftId);
  if (answer.state?.kind === "yes") return;
  await signConsent(giftId, "yes", answer);
}
