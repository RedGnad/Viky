"use client";
import type { CSSProperties } from "react";
import { useDisplayCurrency } from "@/src/client/display-currency";
import { formatAusd } from "@/src/gift-reader";
import { HOME as W } from "@/src/sentences";
import { AMOUNT_IN_TITLE, HELP } from "../components/ui";
import { ArrivalAmount, useLastSeen } from "./Motion";
import { dollarsHeld, firstReady, type Holdings } from "./money";

/**
 * The money of the account, first on Home, and its title (structure, section 4: "Home has no display title, the money
 * is its title"). So it is set at the display size, in the text face, because the title face is never on an amount (item 7),
 * and on the page ground rather than in a box: a card groups things, and the money is not one thing among others.
 * "In your account" above it is the page's heading for a machine, at the help size.
 *
 * The display currency leads when the account has one, the dollar stays readable under it with the rate's date; when
 * the account holds nothing but what the card service buys, that figure leads and no zero dollar is printed.
 *
 * At the display size the amount is the symbol and the number, on one line, and the size gives way before the line does
 * (the art direction brief of 17 Sep 2026, section 8): "about", the rate's day and the dollars are the caption under it.
 * When it has changed since this device last saw it, it counts to its value once, last in the screen's arrival.
 */
const AMOUNT = `money-display ${AMOUNT_IN_TITLE} tracking-[-0.02em]`;

export function MoneyHero({ address, holdings }: Readonly<{ address: string; holdings: Holdings | null }>) {
  const money = useDisplayCurrency(address);
  const dollars = holdings === null ? undefined : dollarsHeld(holdings);
  const figure = dollars === undefined ? undefined : money.figure(dollars);
  // What this device last saw of this account's money, so a change counts to its value once (brief, section 6).
  const seen = useLastSeen(`viky.seen.money.${address}.${money.currency}`, figure?.value);

  if (holdings === null || dollars === undefined || figure === undefined) {
    return (
      <section className="money-display-box flex flex-col gap-[var(--space-xs)]">
        <h1 className={HELP}>{W.inAccount}</h1>
        <p className={AMOUNT} style={chars(1)}>
          …
        </p>
      </section>
    );
  }

  const ready = firstReady(holdings);
  if (dollars === 0n && ready) {
    return (
      <section className="money-display-box flex flex-col gap-[var(--space-xs)]">
        <h1 className={HELP}>{W.readyLabel(ready.way.name)}</h1>
        <p className={AMOUNT} style={chars(ready.ready.number.length)}>
          {ready.ready.number}
        </p>
        <p className={HELP}>{W.keep}</p>
      </section>
    );
  }

  return (
    <section className="money-display-box flex flex-col gap-[var(--space-xs)]">
      <h1 className={HELP}>{W.inAccount}</h1>
      <p data-amount className={AMOUNT} style={chars(figure.text.length)}>
        <ArrivalAmount from={seen ?? figure.value} to={figure.value} symbol={figure.symbol} decimals={figure.decimals} after={figure.after} />
      </p>
      {figure.rateDate ? <p className={HELP}>{W.aboutRate(figure.rateDate, formatAusd(dollars))}</p> : null}
      {!figure.rateDate && money.unavailable ? <p className={HELP}>{money.unavailable}</p> : null}
      {ready && !ready.native && dollars > 0n ? <p className={HELP}>{W.readyLine(ready.way.name, ready.ready.number)}</p> : null}
      <p className={HELP}>{W.keep}</p>
    </section>
  );
}

/** How many characters the amount has, which is what lets its size give way before its line does (globals.css). */
const chars = (count: number) => ({ "--amount-chars": count }) as CSSProperties;
