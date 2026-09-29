import type { ConsentTerms } from "./consent-terms";

/**
 * The text a recipient signs (the founder, 29 Sep 2026): one agreement per gift, written by the server from the gift and
 * the register, signed by the person's consent key (src/client/consent-key.ts) exactly as it is, byte for byte. The
 * server never takes a text from the browser: it rebuilds this one and checks the signature against it, so what is
 * signed is what the screen says and nothing else. Browser safe.
 *
 * A stop is its own short text, signed by the same key, and it applies from the moment it is kept.
 */

export type ConsentKind = "yes" | "stop";

export type ConsentText = Readonly<{
  account: string;
  giftId: string;
  terms: ConsentTerms;
  /** Until when the yes holds, in words: the gift's last day, or how long it runs once it starts. */
  until: string;
  /** What Viky keeps of the readings once the gift is over. */
  kept: string;
}>;

/** What is kept of the readings today (the privacy page says the same). */
export const KEPT_AFTER = "each reading's verdict, its transaction on the public ledger, and the attested proof of it, as the record of this gift";

export function consentText(kind: ConsentKind, input: ConsentText): string {
  const head = [`Viky ${kind === "yes" ? "agreement" : "stop"}, version 1`, `Account: ${input.account.toLowerCase()}`, `Gift: ${input.giftId}`];
  if (kind === "stop") return [...head, "Viky stops reading for this gift, from now, on every device."].join("\n");
  return [
    ...head,
    `Viky may read, for this gift and nothing else: ${input.terms.reads}`,
    `The person who offered it sees: ${input.terms.funderSees}`,
    `Until: ${input.until}`,
    `Kept after: ${input.kept}`,
  ].join("\n");
}

/** The bytes signed: the text as UTF-8, nothing added. */
export function consentBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export const toHex = (bytes: Uint8Array) => `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
export function fromHex(hex: string): Uint8Array | null {
  if (!/^0x([0-9a-fA-F]{2})+$/.test(hex)) return null;
  const bytes = new Uint8Array((hex.length - 2) / 2);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = parseInt(hex.slice(2 + index * 2, 4 + index * 2), 16);
  return bytes;
}
