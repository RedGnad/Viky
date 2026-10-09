"use client";
import { useEffect, useMemo, useState } from "react";
import type { Hex } from "viem";
import { postJson } from "@/src/client/api";
import { readCoinBalance } from "@/src/client/onchain";
import { AUSD, coinAt, COINS, isNative, MON, USDC } from "@/src/coins";
import { dollarsToTheCent, readyFor, toTheCent, type Ready } from "@/src/exit-steps";
import { chainCoinToChange } from "@/src/funding-step";
import { WAYS_OUT, type WayOut } from "@/src/rails";
import { forgetOnThisScreen, useSeen, writeSeen } from "./seen";

/**
 * What the account holds, of all three coins. The way out is offered as soon as any of them is above what an account
 * cannot spend, which is why all three are read and not only what a gift holds.
 *
 * Read again while the screen is in front of the person, and at once when they come back to it (the founder, 28 Sep
 * 2026): money that arrives shows without reloading the page. A reading that finds the same amounts changes nothing.
 */
export type Holdings = Readonly<Record<string, bigint>>;

/** How often the holdings are read again while the screen is visible. */
export const HOLDINGS_EVERY_MS = 10_000;

function sameHoldings(one: Holdings | null, other: Holdings): boolean {
  return one !== null && COINS.every((coin) => one[coin.symbol] === other[coin.symbol]);
}

export function useHoldings(address: string | undefined, start?: Holdings | null): Holdings | null {
  const [holdings, setHoldings] = useState<Holdings | null>(start ?? null);
  useEffect(() => {
    if (!address) return;
    let live = true;
    let reading = false;
    const read = () => {
      if (reading || document.visibilityState !== "visible") return;
      reading = true;
      Promise.all(COINS.map((coin) => readCoinBalance(coin, address as Hex)))
        .then((amounts) => {
          const next: Holdings = Object.fromEntries(COINS.map((coin, index) => [coin.symbol, amounts[index]]));
          if (live) setHoldings((was) => (sameHoldings(was, next) ? was : next));
        })
        .catch(() => {})
        .finally(() => {
          reading = false;
        });
    };
    read();
    const timer = setInterval(read, HOLDINGS_EVERY_MS);
    document.addEventListener("visibilitychange", read);
    window.addEventListener("focus", read);
    return () => {
      live = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", read);
      window.removeEventListener("focus", read);
    };
  }, [address]);
  return address ? holdings : null;
}

/**
 * The dollars an account holds, of both dollar coins, each cut to the cent before they are added (D124). What the
 * person's gifts have already paid them is in the coin a gift holds: given, it is added to that coin before the cut,
 * exactly as the way out counts it.
 */
export function dollarsHeld(holdings: Holdings, inGifts = 0n): bigint {
  return dollarsToTheCent((holdings[AUSD.symbol] ?? 0n) + inGifts, holdings[USDC.symbol] ?? 0n);
}

/**
 * What the chain's own coin in the account is worth, for the amount a screen says the account holds (the founder,
 * 4 Oct 2026). A card payment can deliver that coin, and an account holding nothing else read zero.
 *
 * It is counted at the exchange's own quote for exactly what the account holds above what it keeps: what choosing a
 * way would give for it now, the same quote the waiting screen changes a payment with, and never a price read
 * elsewhere. Asked again only when the amount changes.
 *
 * The account itself is always read, from the chain. The quote is the one part asked of an outside service, and it
 * can go unanswered: the exchange is slow or down, it has no route for the amount, or too many were asked at once.
 * Nothing is said of that on a screen (the founder, 4 Oct 2026): it is asked again, quietly, until it answers.
 *
 * - "none": nothing of it to count. "reading": the quote has not answered yet, and no figure is shown without it.
 * - "worth": the dollars it would give, cut to the cent.
 * - "unread": the quote did not answer, and is being asked again.
 */
export type ChainCoinWorth = Readonly<{ state: "none" | "reading" | "unread" } | { state: "worth"; units: bigint }>;

/** How long after a quote that did not answer it is asked again. */
export const QUOTE_AGAIN_AFTER_MS = 30_000;

export function useChainCoinWorth(holdings: Holdings | null): ChainCoinWorth {
  const amount = holdings ? chainCoinToChange(holdings[MON.symbol] ?? 0n) : 0n;
  const [answer, setAnswer] = useState<Readonly<{ amount: bigint; units: bigint | null }> | null>(null);
  /** Counts the times a quote went unanswered: each one asks again, after a while. */
  const [again, setAgain] = useState(0);
  useEffect(() => {
    if (amount === 0n) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    postJson<{ output: string }>("/api/fund/quote", { amount: amount.toString() }).then(
      (quote) => live && setAnswer({ amount, units: toTheCent(BigInt(quote.output), AUSD.decimals) }),
      () => {
        if (!live) return;
        setAnswer({ amount, units: null });
        timer = setTimeout(() => setAgain((times) => times + 1), QUOTE_AGAIN_AFTER_MS);
      },
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [amount, again]);
  return useMemo<ChainCoinWorth>(() => {
    if (holdings === null || amount === 0n) return { state: "none" };
    if (!answer || answer.amount !== amount) return { state: "reading" };
    return answer.units === null ? { state: "unread" } : { state: "worth", units: answer.units };
  }, [holdings, amount, answer]);
}

/** What is ready to send to a payout service, if anything, with the service it is ready for. */
export function firstReady(holdings: Holdings): { way: WayOut; ready: Ready; native: boolean } | undefined {
  for (const way of WAYS_OUT) {
    const coin = coinAt(way.coin) ?? USDC;
    const ready = readyFor(way, coin, holdings[coin.symbol] ?? 0n);
    if (ready) return { way, ready, native: isNative(coin) };
  }
  return undefined;
}

/** What the gifts made out to this account still hold for it, in the coin's units (D208). */
export function heldInGifts(gifts: ReadonlyArray<Readonly<{ takeable?: string }>> | null | undefined): bigint {
  return (gifts ?? []).reduce((sum, gift) => sum + BigInt(gift.takeable ?? "0"), 0n);
}

/**
 * Everything that is the person's and that they can take out now, as one amount (the founder, 4 Oct 2026): the
 * account's dollars of both coins, what their gifts have already paid them, and the chain's own coin at the
 * exchange's quote. It is the figure "Yours" heads the way out with (app/components/CashOut.tsx). Home used to count
 * the account alone: it said €0.00 over "Spend or withdraw" while the gift's own page said "$0.18 yours so far".
 *
 * Unknown, and no figure shown, until each part has been read: the account alone, then the account and a gift, would
 * be two figures. A list of gifts that could not be read leaves its part out, and the list says so itself. A quote
 * that did not answer leaves the coin out, unless nothing else is held: a zero would then stand over money, so the
 * figure stays unknown until the quote answers.
 */
export function useMoneyHeld(holdings: Holdings | null, gifts: ReadonlyArray<Readonly<{ takeable?: string }>> | null, giftsUnread = false): bigint | undefined {
  const coin = useChainCoinWorth(holdings);
  if (holdings === null || coin.state === "reading" || (gifts === null && !giftsUnread)) return undefined;
  const dollars = dollarsHeld(holdings, heldInGifts(gifts));
  if (coin.state === "worth") return dollars + coin.units;
  return coin.state === "unread" && dollars === 0n ? undefined : dollars;
}

/**
 * Whether the way out has anything to offer at all: the account's own money, or what its gifts hold for it, which
 * the way out takes first (D208). A gift's page tells its recipient to take that from Home, so Home must offer it.
 */
export function holdsAnything(holdings: Holdings, gifts?: ReadonlyArray<Readonly<{ takeable?: string }>> | null): boolean {
  return dollarsHeld(holdings) > 0n || firstReady(holdings) !== undefined || heldInGifts(gifts) > 0n;
}

/**
 * Whether this device saw something to take out on this account last time it looked, and it remembers what it sees
 * now (D147).
 *
 * It decides one thing only: whether Home draws the way out while the balance is still being read, so nothing under
 * it moves when the answer lands. A device that has never seen money here holds nothing, and an account with nothing
 * to take never keeps a hole where a button is not. It is kept for the device rather than per account.
 *
 * Kept with what else this device last saw (app/kit/seen.tsx, the founder, 9 Oct 2026): the server reads it while it
 * draws the page, so the place is held in the first image. In the device's own store it was read once the browser
 * ran, a moment after that image. What is written is what the screen offered: the account's own money or what its
 * gifts hold for it, once both have been read.
 */
export const SAW_MONEY = "viky.seen.holds";

/**
 * Whether the way out is drawn, on Home and on Me (the founder, 9 Oct 2026). Once the account and its gifts are read,
 * when there is something to take; until then, when what has been read already says so, or when this device saw money
 * here last time.
 */
export function useSomethingToTake(holdings: Holdings | null, gifts: ReadonlyArray<Readonly<{ takeable?: string }>> | null, giftsRead: boolean): boolean {
  const sawMoney = useSawMoney(holdings, gifts, giftsRead);
  return holdings !== null && giftsRead ? holdsAnything(holdings, gifts) : (holdings !== null && holdsAnything(holdings)) || sawMoney;
}

export function useSawMoney(holdings: Holdings | null, gifts: ReadonlyArray<Readonly<{ takeable?: string }>> | null = null, giftsRead = true): boolean {
  const saw = useSeen(SAW_MONEY) === 1;
  useEffect(() => {
    if (holdings === null || !giftsRead) return;
    writeSeen(SAW_MONEY, holdsAnything(holdings, gifts) ? 1 : 0);
    return () => forgetOnThisScreen(SAW_MONEY);
  }, [holdings, gifts, giftsRead]);
  return saw;
}
