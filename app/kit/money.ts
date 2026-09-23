"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { Hex } from "viem";
import { readCoinBalance } from "@/src/client/onchain";
import { AUSD, coinAt, COINS, isNative, USDC } from "@/src/coins";
import { dollarsToTheCent, readyFor, type Ready } from "@/src/exit-steps";
import { WAYS_OUT, type WayOut } from "@/src/rails";

/**
 * What the account holds, of all three coins, read once for a screen. The way out is offered as soon as any of
 * them is above what an account cannot spend, which is why all three are read and not only what a gift holds.
 */
export type Holdings = Readonly<Record<string, bigint>>;

export function useHoldings(address: string | undefined, start?: Holdings | null): Holdings | null {
  const [holdings, setHoldings] = useState<Holdings | null>(start ?? null);
  useEffect(() => {
    if (!address) return;
    let live = true;
    Promise.all(COINS.map((coin) => readCoinBalance(coin, address as Hex)))
      .then((read) => {
        if (live) setHoldings(Object.fromEntries(COINS.map((coin, index) => [coin.symbol, read[index]])));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [address]);
  return address ? holdings : null;
}

/** The dollars an account holds, of both dollar coins, each cut to the cent before they are added (D124). */
export function dollarsHeld(holdings: Holdings): bigint {
  return dollarsToTheCent(holdings[AUSD.symbol] ?? 0n, holdings[USDC.symbol] ?? 0n);
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
 * Whether the way out has anything to offer at all: the account's own money, or what its gifts hold for it, which
 * the way out takes first (D208). A gift's page tells its recipient to take that from Home, so Home must offer it.
 */
export function holdsAnything(holdings: Holdings, gifts?: ReadonlyArray<Readonly<{ takeable?: string }>> | null): boolean {
  return dollarsHeld(holdings) > 0n || firstReady(holdings) !== undefined || heldInGifts(gifts) > 0n;
}

/**
 * Whether this device saw money on this account last time it looked, and it remembers what it sees now (D147).
 *
 * It decides one thing only: whether Home holds the room the way out will take while the balance is still being
 * read, so the card under it does not jump when the answer lands. A device that has never seen money here holds
 * nothing, and an account with nothing to take never keeps a hole where a button is not. It is kept for the device
 * rather than per account, because the page has to know before it knows whose it is.
 */
const SAW_MONEY = "viky.seen.holds";
const neverChanges = () => () => {};
const sawMoneyHere = () => {
  try {
    return window.localStorage.getItem(SAW_MONEY) === "1";
  } catch {
    return false;
  }
};
const nothingRemembered = () => false;

export function useSawMoney(holdings: Holdings | null): boolean {
  const saw = useSyncExternalStore(neverChanges, sawMoneyHere, nothingRemembered);
  useEffect(() => {
    if (holdings === null) return;
    try {
      window.localStorage.setItem(SAW_MONEY, holdsAnything(holdings) ? "1" : "0");
    } catch {
      // A device that keeps nothing holds no room, which is the same as a first visit.
    }
  }, [holdings]);
  return saw;
}
