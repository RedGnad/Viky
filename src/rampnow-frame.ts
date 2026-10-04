import { rampnowPage } from "./rails";

/**
 * Rampnow inside Viky (the founder, 3 Oct 2026): its widget in a frame of our own sheet instead of its page in another
 * tab, from its official widget mode (docs.rampnow.io/api-reference/widget-mode, read 3 Oct 2026) and the code of its
 * own SDK (`@rampnow/sdk` 0.0.8, MIT, `dist/rampnow-sdk.umd.js`, read the same day). Browser safe: no fetch, no key.
 *
 * What is taken from them, word for word:
 *   - the address is the page the way in already opens, `https://app.rampnow.io/order/quote`, with the same filled and
 *     locked fields: the amount, the euro, the card, USDC on Monad, the payer's own account (`rampnowPage`); and with
 *     `apiKey`, the partner's public key from the Partner Dashboard ("Keys are prefixed with pk_live_"), when there
 *     is one;
 *   - the frame's permissions are the SDK's own `iframeAllow`: the camera for the identity check, the payment, and the
 *     rest it asks for;
 *   - a message from the frame is believed only from Rampnow's own origin, with `source` "RAMPNOW_WIDGET" and a type
 *     the SDK knows, exactly the SDK's `isValidMessage`.
 *
 * Without a partner's key (the founder, 3 Oct 2026): the Partner Dashboard has no sign-up, its key comes through
 * Rampnow's sales team, and the public locked page, the one a real payment went through that day in a tab of its own,
 * is served without a header that forbids a frame (read the same day: no `X-Frame-Options`, no `frame-ancestors`).
 * So the frame takes that page as it is. Its messages may then never come, and nothing here counts on them: what
 * closes the frame is the money arriving in the account, seen by the screen that waits under it
 * (app/components/PayGift.tsx).
 *
 * It is off until `NEXT_PUBLIC_RAMPNOW_FRAME=on`: the page beside stays the way, and it stays the fallback when the
 * frame does not load or says it failed.
 */

export const RAMPNOW_ORIGIN = "https://app.rampnow.io";

/**
 * One gift, one payment (the founder, 3 Oct 2026), from what the first payment through the frame showed that day: 6 EUR
 * paid in the frame at 21:23 UTC, 5.600948 USDC on the account at 21:38:57, gift 1000 made at 21:44:32.
 *
 * Rampnow finishes an order from its own page: the card buys USDC on Base into an account Rampnow keeps for the person
 * (21:24:51 that day), and its page then sends it on to Monad, signed in the browser ("Do not close this window until
 * the order processing is completed"). The frame was closed meanwhile, the money waited on Base for fourteen minutes,
 * until Rampnow's page was opened again; and opening the frame again from "Pay by card" started a second order.
 *
 * So the pay button always leads to the payment of this gift. The frame open has no cross and no other way to close:
 * one way out under it, for somebody who says they have not paid. A payment the frame says is under way leaves no way
 * out at all, until five minutes have passed without the money. Left otherwise, the screen that waits says the payment
 * is at Rampnow and its main action opens that order again, in the frame, where the person is still signed in
 * (Rampnow's session in a frame is kept apart from a tab's: its cookies are "Partitioned", read on /api/auth/csrf).
 * A new order is started only after the person says they have not paid.
 */

/** Rampnow's list of a person's orders, behind its own sign-in: where an order left unfinished is found again. */
export const RAMPNOW_ORDERS_PAGE = `${RAMPNOW_ORIGIN}/order/list`;

/**
 * How long the frame must have been open before a payment can have left through it: nobody signs in, gives a card and
 * passes their bank's check in less. Left before, nothing is waited for.
 */
export const PAYMENT_POSSIBLE_AFTER_MS = 20_000;

/**
 * How long the frame stays without a way out of its own once a payment may be under way (the founder, 4 Oct 2026):
 * five minutes without the money, and a way out appears, which leads to the screen that waits. To be set again on the
 * measured length of a real payment.
 */
export const LATE_WAY_OUT_AFTER_MS = 5 * 60_000;

/** An order's identifier as Rampnow writes it, and nothing that could turn an address into another one. */
const ORDER_UID = /^[A-Za-z0-9_-]{1,80}$/;

/** The page on which Rampnow finishes one order (read in its own script, 3 Oct 2026: `/order/dapp/<uid>`), or nothing for an identifier that does not look like one. */
export function rampnowOrderPage(orderUid: string | null | undefined): string | null {
  return orderUid && ORDER_UID.test(orderUid) ? `${RAMPNOW_ORIGIN}/order/dapp/${orderUid}` : null;
}

/** Where a payment already started is finished: its own order when Rampnow named it, the person's list of orders otherwise. Never a new payment. */
export function rampnowFinishPage(orderUid: string | null | undefined): string {
  return rampnowOrderPage(orderUid) ?? RAMPNOW_ORDERS_PAGE;
}

export const RAMPNOW_FRAME_ALLOW = "camera; microphone; payment; clipboard-write; publickey-credentials-get";

/** Whether the frame is switched on here. The way in itself must be on too (`rampnowWayIn`). */
export function rampnowFrameOn(env: Readonly<Record<string, string | undefined>> = { NEXT_PUBLIC_RAMPNOW_FRAME: process.env.NEXT_PUBLIC_RAMPNOW_FRAME }): boolean {
  return env.NEXT_PUBLIC_RAMPNOW_FRAME?.trim() === "on";
}

/**
 * Whether Rampnow's frame can keep the person signed in, in this browser (the founder, 4 Oct 2026).
 *
 * Rampnow's session in a frame lives in cookies set "Partitioned" (read on its /api/auth/csrf). Safari's engine reads
 * such cookies in 18.4 and from 26.2, and not in between or before (webkit.org/blog/17640, "WebKit Features for Safari
 * 26.2": shipped in Safari 18.4, removed in 18.5, shipped again in 26.2). Measured by the founder on Safari 17.6
 * (macOS 14.7.3), on a neutral page holding this same frame: after the code received by e-mail, Rampnow's page went
 * back to its sign-in form. So where it cannot, the person never sees the frame: Rampnow's page opens beside, from the
 * first press, and the payment is followed as one started from a tab.
 *
 * Read from what the browser says of itself, which is all there is to read without a second origin to measure from:
 *   - on an iPhone or an iPad every browser runs on Safari's engine. Safari writes its own version ("Version/17.6");
 *     since version 26 it writes a system frozen at 18_6 beside it, while Chrome and Firefox there write the real
 *     system and no version of their own. So the engine's version is the higher of the two;
 *   - on a Mac, Safari alone, by "Version/"; an iPad asking for the desktop site says the same thing.
 * Every other browser keeps the frame. So does a version that cannot be read on a Mac. Its limit: on a Mac, Safari's
 * version is not the system's, and the cookies are kept by the system, so a Safari 18.4 or 26.2 on an older system may
 * be read as able when it is not. Under the frame, "Can't sign in here?" and the page beside are there for that.
 */
export function frameKeepsSignIn(userAgent: string): boolean {
  const version = safariEngineVersion(userAgent);
  if (version === null) return true;
  const atLeast = (major: number, minor: number) => version.major > major || (version.major === major && version.minor >= minor);
  return (atLeast(18, 4) && !atLeast(18, 5)) || atLeast(26, 2);
}

/** The version of Safari's engine a browser says it runs on, or nothing for a browser on another engine. */
export function safariEngineVersion(userAgent: string): Readonly<{ major: number; minor: number }> | null {
  const read = (found: RegExpMatchArray | null) => (found ? { major: Number(found[1]), minor: Number(found[2] ?? 0) } : null);
  const own = read(userAgent.match(/\bVersion\/(\d+)(?:\.(\d+))?/));
  if (/\b(iPhone|iPad|iPod)\b/.test(userAgent)) {
    const system = read(userAgent.match(/\bOS (\d+)(?:_(\d+))?/));
    // Nothing readable on a device where every browser is Safari's engine: counted as the oldest, which opens the page beside.
    if (!own && !system) return { major: 0, minor: 0 };
    if (!own || !system) return own ?? system;
    return own.major > system.major || (own.major === system.major && own.minor >= system.minor) ? own : system;
  }
  const safariOnAMac = /\bMacintosh\b/.test(userAgent) && /\bSafari\//.test(userAgent) && !/\b(Chrome|Chromium|Edg|OPR|Firefox)\//.test(userAgent);
  return safariOnAMac ? own : null;
}

/**
 * The frame's address: the public locked page, without its "Buy" and "Sell" tabs, and with the partner's public key
 * added when there is one. `hideOrderTabs` is read by the page's own script (`app/(full)/order/quote/page-*.js`, its
 * header: the tabs are drawn unless it is "true"), and measured on the page itself on 4 Oct 2026: two tabs without it,
 * none with it. A key that does not look public (`pk_`) is never put in an address a browser shows: Rampnow's other
 * key, its secret, signs its webhooks and must stay on the server. With no public key the page goes without one.
 */
export function rampnowFrameAddress(fill: Readonly<{ account?: string; euros?: number }>, apiKey: string = ""): string {
  const page = `${rampnowPage(fill)}&hideOrderTabs=true`;
  const key = apiKey.trim();
  return /^pk_[A-Za-z0-9_]+$/.test(key) ? `${page}&apiKey=${encodeURIComponent(key)}` : page;
}

/**
 * The frame's height: as tall as Rampnow's own widget when the sheet has the room, never shorter than a form can be
 * used in, and in between whatever the sheet has left (the founder, 3 Oct 2026). At a fixed 600 it stood taller than
 * the sheet on a laptop of 700: its last button was cut, the link under it was out of sight, and nothing could be
 * scrolled, since a wheel or a finger on a frame moves the frame's own page and never the sheet around it.
 */
export const FRAME_HEIGHT = { most: 600, least: 360 } as const;

/** What the sheet has left for the frame: its cap, less its head, the air around its contents, and what stands under the frame. */
export function frameHeightFor(room: Readonly<{ cap: number; head: number; padding: number; under: number }>): number {
  const left = Math.floor(room.cap - room.head - room.padding - room.under);
  return Math.max(FRAME_HEIGHT.least, Math.min(FRAME_HEIGHT.most, left));
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

/**
 * The order an event is about, when it names one: every event of an order carries `orderUid` (`@rampnow/sdk` 0.0.8,
 * its own types). Kept so the order can be opened again where it is finished.
 */
export function orderUidOf(event: RampnowEvent): string | null {
  const uid = event.payload?.orderUid;
  return typeof uid === "string" && ORDER_UID.test(uid) ? uid : null;
}

/**
 * What an event says of a payment (`@rampnow/sdk` 0.0.8, its own names; none of the order events has been seen without
 * a partner's key, so nothing here is counted on):
 *   - "ordered": an order exists, and nothing says a card paid for it. The person may still say they have not paid.
 *   - "paying": a payment is under way or made. From here the frame leaves no way out of its own.
 *   - "failed": the payment did not go through, and nothing was taken. A failed payment says it whenever it comes; a
 *     failed order says it only while no payment is known, since an order that fails after its card paid has taken
 *     something, and nothing is said here that could be false.
 * Nothing for the others: ready, signed in, an identity check, an error, a widget closed. None of them is about money.
 */
export function rampnowSays(event: RampnowEvent, paying: boolean): "ordered" | "paying" | "failed" | null {
  switch (event.type) {
    case "ORDER_CREATED":
      return "ordered";
    case "ORDER_PAYMENT_PROCESSING":
    case "ORDER_PAYMENT_COMPLETED":
    case "ORDER_COMPLETED":
      return "paying";
    case "ORDER_PAYMENT_FAILED":
      return "failed";
    case "ORDER_FAILED":
      return paying ? null : "failed";
    default:
      return null;
  }
}
