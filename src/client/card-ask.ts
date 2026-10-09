"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { askOfTheQuote, askOfTheRule, usdcToAsk, type CardAsk, type CardAskState, type QuoteSaid } from "@/src/card-ask";
import { getJson } from "@/src/client/api";
import { WAY_IN_USDC, type WayIn } from "@/src/rails";

/**
 * What the card is asked, for a screen (9 Oct 2026): Rampnow's own quote in the money the screen is read in, when this
 * deployment asks for quotes and Rampnow gives one; the rule otherwise (src/card-ask.ts). While the quote is asked
 * the screen says so and names no figure: a figure by the rule first, and then another, would move under a finger.
 */

/** How long a quote is waited for: past it the rule answers, and an answer that comes later changes nothing. */
export const QUOTE_WAIT_MS = 3_000;

/** Whether this deployment asks Rampnow for quotes: said by the server on the page itself (app/layout.tsx). */
export function cardQuotesOn(): boolean {
  return document.body.dataset.cardQuotes === "on";
}
const never = () => () => undefined;
const notOnTheServer = () => false;

/**
 * The ask a pay press was made on, kept for the screen that waits, so the amount pressed is the amount its frame
 * opens on. For this visit and ten minutes: past them, or for another amount left to pay, the wait asks again.
 */
const KEPT_KEY = "viky.card-ask";
export const ASK_KEPT_MS = 10 * 60_000;
type Kept = Readonly<{ ask: CardAsk; quoted: boolean; forUnits: string; code: string; at: number }>;

export function keepCardAsk(kept: Omit<Kept, "at">, now: number = Date.now()): void {
  try {
    window.sessionStorage.setItem(KEPT_KEY, JSON.stringify({ ...kept, at: now }));
  } catch {
    // A browser that keeps nothing asks again on the wait, which is true as well.
  }
}

export function cardAskKept(forUnits: bigint, code: string, now: number = Date.now()): Readonly<{ ask: CardAsk; quoted: boolean }> | null {
  try {
    const kept = JSON.parse(window.sessionStorage.getItem(KEPT_KEY) ?? "null") as Kept | null;
    if (!kept || kept.forUnits !== forUnits.toString() || kept.code !== code || !(now - kept.at < ASK_KEPT_MS)) return null;
    const { currency, amount, fee } = kept.ask;
    if (typeof currency !== "string" || !(amount > 0) || !(fee >= 0)) return null;
    return { ask: { currency, amount, fee }, quoted: kept.quoted === true };
  } catch {
    return null;
  }
}

export function useCardAsk(input: Readonly<{ on: boolean; offer: Readonly<{ way: WayIn; euros: number | undefined; atFloor: boolean }>; short: bigint; code: string; usdPerEur: number | undefined; kept?: boolean }>): CardAskState {
  const { on, offer, short, code, usdPerEur } = input;
  const quotes = useSyncExternalStore(never, cardQuotesOn, notOnTheServer);
  const need = usdcToAsk(short);
  const asks = on && quotes && offer.way === WAY_IN_USDC && need > 0n;
  const name = `${code}:${need}`;
  const [answer, setAnswer] = useState<Readonly<{ name: string; said: QuoteSaid }> | null>(null);
  // The ask the pay press was made on, when this screen is the wait that follows it.
  const carried = on && input.kept ? cardAskKept(short, code) : null;
  const isCarried = carried !== null;
  useEffect(() => {
    if (!asks || isCarried) return;
    let waited = true;
    const say = (said: QuoteSaid) => {
      if (!waited) return;
      waited = false;
      setAnswer({ name, said });
    };
    const cut = setTimeout(() => say("late"), QUOTE_WAIT_MS);
    getJson<QuoteSaid>(`/api/rails/card-quote?currency=${encodeURIComponent(code)}&units=${need}`).then(say, () => say("late"));
    return () => {
      waited = false;
      clearTimeout(cut);
    };
  }, [asks, name, code, need, isCarried]);
  if (!on || short <= 0n) return { state: "none" };
  if (carried) return { state: "ask", ask: carried.ask, quoted: carried.quoted };
  const rule = askOfTheRule(offer, usdPerEur);
  if (!asks) return rule;
  if (answer?.name !== name) return { state: "asking" };
  return askOfTheQuote(answer.said, rule);
}
