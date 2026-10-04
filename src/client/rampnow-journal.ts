"use client";
import { RAMPNOW_ORIGIN } from "../rampnow-frame";

/**
 * What Rampnow's frame said, and what the screens did, written down on this device (the founder, 4 Oct 2026). None of
 * its order messages has been seen without a partner's key, and a real payment is the only way to see them: so every
 * payment through the frame leaves its trace here, with the times, from which the real length of a payment is read.
 *
 * It stays on the device and is sent nowhere. Nothing of it is ever drawn on a person's screen: it is read on the
 * page the founder opens on demand (app/dev/rampnow), on the device that paid, and copied from there.
 */

/**
 * `what`: a message's own type, or what a screen did, in a few plain words. `carried`: what a message held, cut short.
 * `times` and `lastMs`: the same line said again and again is one line, with how many times and when last, so that a
 * page that repeats itself never pushes the lines that matter out of what is kept.
 */
export type RampnowJournalLine = Readonly<{ atMs: number; what: string; orderUid?: string; carried?: string; times?: number; lastMs?: number }>;

const KEY = "viky.rampnow.journal";
/** Enough for several payments, and never a device's storage filling up. */
const LINES_KEPT = 300;
const CARRIED_KEPT = 600;
/** A week: older lines go when a new one is written. */
const KEPT_FOR_MS = 7 * 24 * 3_600_000;

/** Said to the page that reads the journal, when a line is written or all of it is forgotten. */
const CHANGED = "viky:rampnow-journal";
const tell = () => {
  try {
    window.dispatchEvent(new Event(CHANGED));
  } catch {
    // No window to tell: nothing reads it either.
  }
};

/** For a screen that reads the journal as it grows: told of every change, on this page and on another tab of it. */
export function subscribeToRampnowJournal(listener: () => void): () => void {
  window.addEventListener(CHANGED, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(CHANGED, listener);
    window.removeEventListener("storage", listener);
  };
}

/** The journal as it is kept, one text: what a store compares to know that it changed. */
export function rampnowJournalAsKept(): string {
  try {
    return window.localStorage.getItem(KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

export function readRampnowJournal(): RampnowJournalLine[] {
  try {
    const kept = JSON.parse(rampnowJournalAsKept()) as unknown;
    if (!Array.isArray(kept)) return [];
    return kept.filter((line): line is RampnowJournalLine => typeof line === "object" && line !== null && typeof (line as RampnowJournalLine).atMs === "number" && typeof (line as RampnowJournalLine).what === "string");
  } catch {
    return [];
  }
}

/** Writes one line. A device that keeps nothing loses it, and nothing else changes. */
export function noteInRampnowJournal(what: string, detail: Readonly<{ orderUid?: string | null; carried?: unknown }> = {}, nowMs: number = Date.now()): void {
  try {
    const carried = detail.carried === undefined ? undefined : JSON.stringify(detail.carried)?.slice(0, CARRIED_KEPT);
    const line: RampnowJournalLine = { atMs: nowMs, what, ...(detail.orderUid ? { orderUid: detail.orderUid } : {}), ...(carried ? { carried } : {}) };
    const before = readRampnowJournal().filter((kept) => nowMs - (kept.lastMs ?? kept.atMs) <= KEPT_FOR_MS);
    const last = before.at(-1);
    const again = last !== undefined && last.what === line.what && last.orderUid === line.orderUid && last.carried === line.carried;
    const lines = again ? [...before.slice(0, -1), { ...last, times: (last.times ?? 1) + 1, lastMs: nowMs }] : [...before, line].slice(-LINES_KEPT);
    window.localStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    // Nothing kept.
  }
  tell();
}

/**
 * Anything Rampnow's own origin posts to this page, written down whether or not it is believed: the types its SDK
 * names, and any other, since what it sends without a partner's key is exactly what is not known.
 */
export function noteRampnowMessage(message: Readonly<{ origin: string; data: unknown }>, nowMs: number = Date.now()): void {
  if (message.origin !== RAMPNOW_ORIGIN) return;
  const data = message.data as { type?: unknown; payload?: unknown } | null;
  const type = typeof data === "object" && data !== null && typeof data.type === "string" ? data.type : "a message without a type";
  const payload = typeof data === "object" && data !== null ? (data.payload as { orderUid?: unknown } | undefined) : undefined;
  const orderUid = typeof payload === "object" && payload !== null && typeof payload.orderUid === "string" ? payload.orderUid.slice(0, 80) : null;
  noteInRampnowJournal(`Rampnow: ${type}`.slice(0, 120), { orderUid, carried: typeof data === "object" && data !== null && data.type !== undefined ? data.payload : message.data }, nowMs);
}

export function clearRampnowJournal(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to forget.
  }
  tell();
}
