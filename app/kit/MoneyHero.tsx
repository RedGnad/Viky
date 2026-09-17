"use client";
import { useDisplayCurrency } from "@/src/client/display-currency";
import { formatAusd } from "@/src/gift-reader";
import { HOME as W } from "@/src/sentences";
import { AMOUNT_IN_TITLE, HELP } from "../components/ui";
import { dollarsHeld, firstReady, type Holdings } from "./money";

/**
 * The money of the account, first on Home, and its title (structure, section 4: "Home has no display title, the money
 * is its title"). So it is set at the display size, in the text face, because Anton is never on an amount (item 7),
 * and on the page ground rather than in a box: a card groups things, and the money is not one thing among others.
 * "In your account" above it is the page's heading for a machine, at the help size.
 *
 * The display currency leads when the account has one, the dollar stays readable under it with the rate's date; when
 * the account holds nothing but what the card service buys, that figure leads and no zero dollar is printed.
 */
const AMOUNT = `text-[length:var(--type-display)] leading-[var(--type-display-leading)] ${AMOUNT_IN_TITLE} tracking-[-0.02em] break-words`;

export function MoneyHero({ address, holdings }: Readonly<{ address: string; holdings: Holdings | null }>) {
  const money = useDisplayCurrency(address);
  if (holdings === null) {
    return (
      <section className="flex flex-col gap-[var(--space-xs)]">
        <h1 className={HELP}>{W.inAccount}</h1>
        <p className={AMOUNT}>…</p>
      </section>
    );
  }
  const dollars = dollarsHeld(holdings);
  const ready = firstReady(holdings);
  if (dollars === 0n && ready) {
    return (
      <section className="flex flex-col gap-[var(--space-xs)]">
        <h1 className={HELP}>{W.readyLabel(ready.way.name)}</h1>
        <p className={AMOUNT}>{ready.ready.number}</p>
        <p className={HELP}>{W.keep}</p>
      </section>
    );
  }
  const about = money.about(dollars);
  return (
    <section className="flex flex-col gap-[var(--space-xs)]">
      <h1 className={HELP}>{W.inAccount}</h1>
      {about ? (
        <>
          <p className={AMOUNT}>{about.replace(/ \(rate of .*\)$/, "")}</p>
          <p className={HELP}>
            {formatAusd(dollars)}, {about.match(/\((rate of .*)\)$/)?.[1]}
          </p>
        </>
      ) : (
        <>
          <p className={AMOUNT}>{formatAusd(dollars)}</p>
          {money.unavailable ? <p className={HELP}>{money.unavailable}</p> : null}
        </>
      )}
      {ready && !ready.native && dollars > 0n ? <p className={HELP}>{W.readyLine(ready.way.name, ready.ready.number)}</p> : null}
      <p className={HELP}>{W.keep}</p>
    </section>
  );
}
