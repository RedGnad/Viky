"use client";
import { useDisplayCurrency } from "@/src/client/display-currency";
import { formatAusd } from "@/src/gift-reader";
import { HOME as W } from "@/src/sentences";
import { CARD, HELP, MONEY } from "../components/ui";
import { dollarsHeld, firstReady, type Holdings } from "./money";

/**
 * The money of the account, first on Home, and its title: "In your account" is the page's heading, at the help
 * size, so Home has a heading a machine can read without a word in the title face (structure, section 4). The
 * display currency leads when the account has one, the dollar stays readable under it with the rate's date; when
 * the account holds nothing but what the card service buys, that figure leads and no zero dollar is printed.
 */
export function MoneyHero({ address, holdings }: Readonly<{ address: string; holdings: Holdings | null }>) {
  const money = useDisplayCurrency(address);
  if (holdings === null) {
    return (
      <section className={CARD}>
        <h1 className={HELP}>{W.inAccount}</h1>
        <p className={MONEY}>…</p>
      </section>
    );
  }
  const dollars = dollarsHeld(holdings);
  const ready = firstReady(holdings);
  if (dollars === 0n && ready) {
    return (
      <section className={CARD}>
        <h1 className={HELP}>{W.readyLabel(ready.way.name)}</h1>
        <p className={MONEY}>{ready.ready.number}</p>
        <p className={HELP}>{W.keep}</p>
      </section>
    );
  }
  const about = money.about(dollars);
  return (
    <section className={CARD}>
      <h1 className={HELP}>{W.inAccount}</h1>
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
      {ready && !ready.native && dollars > 0n ? <p className={HELP}>{W.readyLine(ready.way.name, ready.ready.number)}</p> : null}
      <p className={HELP}>{W.keep}</p>
    </section>
  );
}
