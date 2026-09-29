import { passkeyOutputFor } from "../account/mera";
import { consentBytes, toHex, type ConsentKind } from "../consent";
import type { ConsentTerms } from "../consent-terms";
import { getJson, postJson } from "./api";
import { consentKey, consentSalt, keepConsentOutput } from "./consent-key";

/**
 * The recipient's yes and stop, from the browser (the founder, 29 Sep 2026). The yes is signed at the gesture the person
 * already makes, connect, name the account, open the portal, share the certificate, so no screen and no prompt is
 * added: the consent key was made when they signed in. A device that gave no second output is asked once, here.
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

async function keyForSigning() {
  const held = consentKey();
  if (held) return held;
  // The one extra prompt, on a device whose passkey did not answer the second salt at sign-in.
  keepConsentOutput(await passkeyOutputFor(consentSalt()));
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
