"use client";
import { useEffect, useState } from "react";
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

export function useHoldings(address: string | undefined): Holdings | null {
  const [holdings, setHoldings] = useState<Holdings | null>(null);
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

/** Whether the way out has anything to offer at all. */
export function holdsAnything(holdings: Holdings): boolean {
  return dollarsHeld(holdings) > 0n || firstReady(holdings) !== undefined;
}
