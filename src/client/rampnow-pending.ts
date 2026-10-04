"use client";
import { useMemo, useSyncExternalStore } from "react";

/**
 * A card payment that may have left through Rampnow and has not arrived yet (the founder, 3 Oct 2026). Kept on this
 * device, for this account, so that every screen says the truth after the frame was left, or after the page was left
 * and come back to: the payment is at Rampnow, and the pay button leads back to it instead of starting another.
 *
 * Browser only, and that is its limit: another device knows nothing of it, and neither does a device that keeps
 * nothing. There the screens say what they said before, "not made yet", and offer the card.
 */

/**
 * `known`: a message of the frame said a payment is under way or made; otherwise it is only possible, and the screen
 * says "if you paid". `via`: where it was started, the frame or Rampnow's page in a tab of its own, since Rampnow's
 * session in one is not its session in the other and an order is finished where the person is signed in.
 */
export type RampnowPending = Readonly<{ sinceMs: number; orderUid: string | null; known: boolean; via: "frame" | "tab" }>;

/** A day: an order older than that is no longer waited for here. */
const FORGOTTEN_AFTER_MS = 24 * 3_600_000;

const key = (account: string) => `viky.rampnow.pending.${account.toLowerCase()}`;

/** Said to every screen of this page that reads it, when what is kept changes. */
const CHANGED = "viky:rampnow-pending";
const tell = () => {
  try {
    window.dispatchEvent(new Event(CHANGED));
  } catch {
    // No window to tell: nothing reads it either.
  }
};

function subscribe(listener: () => void): () => void {
  window.addEventListener(CHANGED, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(CHANGED, listener);
    window.removeEventListener("storage", listener);
  };
}

function kept(account: string | undefined): string | null {
  if (!account) return null;
  try {
    return window.localStorage.getItem(key(account));
  } catch {
    return null;
  }
}

/** What this device keeps for the account, as the screen reads it: nothing on the server, and nothing while it is not known. */
export function useRampnowPending(account: string | undefined): RampnowPending | null {
  const raw = useSyncExternalStore(
    subscribe,
    () => kept(account),
    () => null,
  );
  return useMemo(() => (raw === null ? null : readRampnowPending(account)), [raw, account]);
}

export function readRampnowPending(account: string | undefined, nowMs: number = Date.now()): RampnowPending | null {
  if (!account) return null;
  try {
    const kept = JSON.parse(window.localStorage.getItem(key(account)) ?? "null") as { sinceMs?: unknown; orderUid?: unknown; known?: unknown; via?: unknown } | null;
    if (!kept || typeof kept.sinceMs !== "number" || nowMs - kept.sinceMs > FORGOTTEN_AFTER_MS) return null;
    return { sinceMs: kept.sinceMs, orderUid: typeof kept.orderUid === "string" ? kept.orderUid : null, known: kept.known === true, via: kept.via === "tab" ? "tab" : "frame" };
  } catch {
    return null;
  }
}

/**
 * Notes that a payment may have left, and what was learnt of it since: the order Rampnow named, that a payment is
 * known, where it was started. What is already kept is never unlearnt: an order named stays named, a payment known
 * stays known, and the time is that of the first note.
 */
export function noteRampnowPending(account: string | undefined, learnt: Readonly<{ orderUid?: string | null; known?: boolean; via?: "frame" | "tab" }> = {}, nowMs: number = Date.now()): RampnowPending | null {
  if (!account) return null;
  const before = readRampnowPending(account, nowMs);
  const next: RampnowPending = {
    sinceMs: before?.sinceMs ?? nowMs,
    orderUid: learnt.orderUid ?? before?.orderUid ?? null,
    known: learnt.known === true || (before?.known ?? false),
    via: learnt.via ?? before?.via ?? "frame",
  };
  try {
    window.localStorage.setItem(key(account), JSON.stringify(next));
  } catch {
    // Nothing kept: the screen cannot say it after the frame is left.
  }
  tell();
  return next;
}

/** The money arrived, the payment failed, or the person says they have not paid: nothing is waited for any more. */
export function clearRampnowPending(account: string | undefined): void {
  if (!account) return;
  try {
    window.localStorage.removeItem(key(account));
  } catch {
    // Nothing to forget.
  }
  tell();
}
