import { rampnowPage } from "./rails";

/**
 * Rampnow inside Viky (the founder, 3 Oct 2026): its widget in a frame of our own sheet instead of its page in another
 * tab, from its official widget mode (docs.rampnow.io/api-reference/widget-mode, read 3 Oct 2026) and the code of its
 * own SDK (`@rampnow/sdk` 0.0.8, MIT, `dist/rampnow-sdk.umd.js`, read the same day). Browser safe: no fetch, no key.
 *
 * What is taken from them, word for word:
 *   - the address is the page the way in already opens, `https://app.rampnow.io/order/quote`, with `apiKey`, the
 *     partner's public key from the Partner Dashboard ("Keys are prefixed with pk_live_"), and the same filled and
 *     locked fields: the amount, the euro, the card, USDC on Monad, the payer's own account (`rampnowPage`);
 *   - the frame's permissions are the SDK's own `iframeAllow`: the camera for the identity check, the payment, and the
 *     rest it asks for;
 *   - a message from the frame is believed only from Rampnow's own origin, with `source` "RAMPNOW_WIDGET" and a type
 *     the SDK knows, exactly the SDK's `isValidMessage`.
 *
 * It is off until `NEXT_PUBLIC_RAMPNOW_FRAME=on`: the page beside stays the way, and it stays the fallback when the
 * frame does not load or says it failed.
 */

export const RAMPNOW_ORIGIN = "https://app.rampnow.io";
export const RAMPNOW_FRAME_ALLOW = "camera; microphone; payment; clipboard-write; publickey-credentials-get";

/** Whether the frame is switched on here. The way in itself must be on too (`rampnowWayIn`). */
export function rampnowFrameOn(env: Readonly<Record<string, string | undefined>> = { NEXT_PUBLIC_RAMPNOW_FRAME: process.env.NEXT_PUBLIC_RAMPNOW_FRAME }): boolean {
  return env.NEXT_PUBLIC_RAMPNOW_FRAME?.trim() === "on";
}

/**
 * The frame's address: the locked page with the partner's public key. A key that does not look public (`pk_`) is never
 * put in an address a browser shows: Rampnow's other key, its secret, signs its webhooks and must stay on the server.
 */
export function rampnowFrameAddress(fill: Readonly<{ account?: string; euros?: number }>, apiKey: string): string | null {
  const key = apiKey.trim();
  if (!/^pk_[A-Za-z0-9_]+$/.test(key)) return null;
  return `${rampnowPage(fill)}&apiKey=${encodeURIComponent(key)}`;
}

/** The events the SDK knows (RampnowEventType), and so the only ones believed. */
export const RAMPNOW_EVENTS = [
  "WIDGET_READY",
  "WIDGET_CLOSED",
  "USER_AUTHENTICATED",
  "ORDER_CREATED",
  "ORDER_PAYMENT_PROCESSING",
  "ORDER_PAYMENT_COMPLETED",
  "ORDER_PAYMENT_FAILED",
  "ORDER_COMPLETED",
  "ORDER_FAILED",
  "KYC_STARTED",
  "KYC_SUBMITTED",
  "KYC_APPROVED",
  "KYC_REJECTED",
  "ERROR",
] as const;

export type RampnowEvent = Readonly<{ type: (typeof RAMPNOW_EVENTS)[number]; payload?: Record<string, unknown> }>;

/** A message from the frame, as the SDK would accept it, or nothing: another origin, another source, an unknown type. */
export function rampnowEventOf(message: Readonly<{ origin: string; data: unknown }>): RampnowEvent | null {
  if (message.origin !== RAMPNOW_ORIGIN) return null;
  const data = message.data as { source?: unknown; type?: unknown; payload?: unknown } | null;
  if (typeof data !== "object" || data === null || data.source !== "RAMPNOW_WIDGET") return null;
  if (typeof data.type !== "string" || !(RAMPNOW_EVENTS as readonly string[]).includes(data.type)) return null;
  return { type: data.type as RampnowEvent["type"], ...(typeof data.payload === "object" && data.payload !== null ? { payload: data.payload as Record<string, unknown> } : {}) };
}

/** What the sheet does on an event: the money is on its way, the person closed it, or the frame failed and the page is offered. */
export function rampnowOutcome(event: RampnowEvent): "arrived" | "closed" | "failed" | null {
  switch (event.type) {
    case "ORDER_COMPLETED":
      return "arrived";
    case "WIDGET_CLOSED":
      return "closed";
    case "ORDER_PAYMENT_FAILED":
    case "ORDER_FAILED":
    case "ERROR":
      return "failed";
    default:
      return null;
  }
}
