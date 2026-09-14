import { createHmac, timingSafeEqual } from "node:crypto";
import { getAddress, type Hex } from "viem";
import { GiftApiError } from "./gift-api";

/**
 * The figure the screen showed, carried back to us intact.
 *
 * Between reading a figure and signing for it, the person leaves Viky: they place an order at the payout
 * service for exactly the amount they were shown, and come back with the destination it gave them. The floor
 * we then bind into their signature has to be that same figure, or the promise on the screen means nothing.
 *
 * So the figure is signed here rather than stored: the browser carries it, cannot change it, and we need no
 * row for something that lives four minutes. The account is inside it too, so one person's quote is worth
 * nothing to another.
 */

const TICKET_TTL_SECONDS = 4 * 60;

type Ticket = Readonly<{ account: string; amount: string; floor: string; shown: string; expiresAt: number }>;

function secret(): string {
  const value = process.env.SESSION_SIGNING_SECRET?.trim();
  if (!value || value.length < 32) throw new GiftApiError("NOT_CONFIGURED", "Viky is not ready for this yet.", 503);
  return value;
}

function signatureFor(encoded: string): string {
  return createHmac("sha256", secret()).update(`viky-exit-quote:schema-1:${encoded}`).digest("base64url");
}

export function issueExitTicket(input: { account: Hex; amount: bigint; floor: bigint; shown: string; now?: Date }): string {
  const payload: Ticket = {
    account: getAddress(input.account),
    amount: input.amount.toString(),
    floor: input.floor.toString(),
    shown: input.shown,
    expiresAt: Math.floor((input.now?.getTime() ?? Date.now()) / 1_000) + TICKET_TTL_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signatureFor(encoded)}`;
}

export type ExitQuoteTicket = Readonly<{ account: Hex; amount: bigint; floor: bigint; shown: string }>;

/** Refuses anything that was not issued here, has expired, or belongs to somebody else. */
export function readExitTicket(token: unknown, account: Hex, now: Date = new Date()): ExitQuoteTicket {
  const refuse = () => new GiftApiError("QUOTE_EXPIRED", "That quote has expired. Ask for a new one.", 409);
  if (typeof token !== "string" || token.length < 16 || token.length > 4 * 1_024) throw refuse();
  const [encoded, supplied] = token.split(".");
  if (!encoded || !supplied) throw refuse();
  const expected = Buffer.from(signatureFor(encoded));
  const given = Buffer.from(supplied);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw refuse();
  let payload: Ticket;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Ticket;
  } catch {
    throw refuse();
  }
  if (!Number.isSafeInteger(payload.expiresAt) || payload.expiresAt * 1_000 <= now.getTime()) throw refuse();
  if (getAddress(payload.account) !== getAddress(account)) throw refuse();
  return { account: getAddress(payload.account), amount: BigInt(payload.amount), floor: BigInt(payload.floor), shown: payload.shown };
}
