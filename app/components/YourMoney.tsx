"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount } from "@/src/account/provider";
import { useDisplayCurrency } from "@/src/client/display-currency";
import { readCoinBalance } from "@/src/client/onchain";
import { AUSD, coinAt, COINS, isNative, USDC } from "@/src/coins";
import { readyFor } from "@/src/exit-steps";
import { formatAusd } from "@/src/gift-reader";
import { WAYS_OUT } from "@/src/rails";
import { YOUR_MONEY as W } from "@/src/sentences";
import { HELP, MONEY, SECONDARY_BUTTON, STICKER } from "./ui";

/**
 * Money sitting in the person's own account, whoever they are, and the way out from it (flows W1).
 *
 * It reads everything an account can hold, not only what a gift holds: after a change, the account holds what
 * the payout service buys and nothing else, and a card that read one coin left that person with no way out at
 * all (the first of the three changes under the screens, 17 Sep 2026). The way out is offered as soon as the
 * account holds anything.
 */
export function YourMoney() {
  const { address } = useAccount();
  const money = useDisplayCurrency(address);
  const [holdings, setHoldings] = useState<Record<string, bigint> | null>(null);

  useEffect(() => {
    let live = true;
    void Promise.resolve()
      .then(() => (address ? Promise.all(COINS.map((coin) => readCoinBalance(coin, address))) : null))
      .then((read) => {
        if (live && read) setHoldings(Object.fromEntries(COINS.map((coin, index) => [coin.symbol, read[index]])));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [address]);

  if (!address || holdings === null) return null;
  const dollars = (holdings[AUSD.symbol] ?? 0n) + (holdings[USDC.symbol] ?? 0n);
  const ready = WAYS_OUT.map((way) => {
    const coin = coinAt(way.coin) ?? USDC;
    return { way, ready: readyFor(way, coin, holdings[coin.symbol] ?? 0n) };
  }).find((entry) => entry.ready !== undefined);
  if (dollars <= 0n && !ready) return null;

  const about = money.about(dollars);
  // Nothing but what the card service buys: that figure leads, and no zero dollar is printed above money that exists.
  if (dollars <= 0n && ready?.ready) {
    return (
      <section className={STICKER.sun}>
        <p className={HELP}>{W.readyLabel(ready.way.name)}</p>
        <p className={MONEY}>{ready.ready.number}</p>
        <p className={HELP}>{W.keep}</p>
        <Link href="/cash-out" className={SECONDARY_BUTTON}>
          {W.takeItOut}
        </Link>
      </section>
    );
  }
  return (
    <section className={STICKER.sun}>
      <p className={HELP}>{W.label}</p>
      {about ? (
        <>
          <p className={MONEY}>{about.replace(/ \(rate of .*\)$/, "")}</p>
          <p className={HELP}>
            {formatAusd(dollars)}, {about.match(/\((rate of .*)\)$/)?.[1]}
          </p>
        </>
      ) : (
        <>
          <p className={MONEY}>{formatAusd(dollars)}</p>
          {money.unavailable ? <p className={HELP}>{money.unavailable}</p> : null}
        </>
      )}
      {ready?.ready && !isNative(coinAt(ready.way.coin) ?? USDC) ? <p className={HELP}>{W.readyLine(ready.way.name, ready.ready.number)}</p> : null}
      <p className={HELP}>{W.keep}</p>
      <Link href="/cash-out" className={SECONDARY_BUTTON}>
        {W.takeItOut}
      </Link>
    </section>
  );
}
