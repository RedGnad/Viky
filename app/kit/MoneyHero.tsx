"use client";
import type { CSSProperties } from "react";
import { useDisplayCurrency } from "@/src/client/display-currency";
import { HOME as W } from "@/src/sentences";
import { AMOUNT_IN_TITLE, CARD_LABEL, HELP } from "../components/ui";
import { ArrivalAmount, useLastSeen } from "./Motion";
import { useMoneyHeld, type Holdings } from "./money";

/**
 * The money of the account, first on Home, and its title (structure, section 4: "Home has no display title, the money
 * is its title"). So it is set at the display size, in the text face, because the title face is never on an amount (item 7),
 * and on the page ground rather than in a box: a card groups things, and the money is not one thing among others.
 * "Yours" above it is the page's heading for a machine, and the amount's name: the same word, written the same way, as
 * over the same figure on the screen that takes money out (the founder, 4 Oct 2026).
 *
 * The account's own currency is what it says, and nothing else (D147). The dollar the contract holds used to stand
 * under it with the rate's day, which is the contract speaking: a person who is not in crypto has no use for it, it
 * is the same decision D144 took on the card, and it arrived a beat after the figure and pushed the page down for it.
 * What is really held is said where money leaves, on the way out.
 *
 * One amount, and no service named (the founder, 3 Oct 2026). A line under it used to say "$5.60 of it is ready to send
 * to Ramp" for any USDC the account held, and a card payment delivers USDC: a moment after paying, Home announced a
 * withdrawal nobody had asked for. A withdrawal's state is said where a withdrawal is made, and only when one is open
 * (src/open-withdrawal.ts). The same goes for the headline that named the card service when the account held nothing
 * but the chain's own coin, which a card payment delivers too.
 *
 * It is everything that is the person's and that they can take out now (the founder, 4 Oct 2026, `useMoneyHeld`): the
 * account, what their gifts have already paid them, and the chain's own coin at the exchange's quote, which a card
 * payment can deliver. The same figure heads the way out. Nothing stands before it and nothing under it: no "about",
 * and no line when the quote does not answer, which is asked again instead.
 *
 * At the display size the amount is the symbol and the number, on one line, and the size gives way before the line
 * does (the art direction brief of 17 Sep 2026, section 8). When it has changed since this device last saw it, it
 * counts to its value once, last in the screen's arrival.
 *
 * **It keeps one shape whether it knows the figure or not** (D147): the heading, the amount and the line under it,
 * and while the balance is still being read the amount is a quiet placeholder of the same size. The block used to be
 * two lines with a one character figure at the display size and then three lines with a five character one, so the
 * whole page moved twice before it had said anything.
 */
const AMOUNT = `money-display ${AMOUNT_IN_TITLE} tracking-[-0.02em]`;

export function MoneyHero({
  address,
  holdings,
  gifts,
  giftsUnread = false,
}: Readonly<{
  address: string | undefined;
  holdings: Holdings | null;
  /** The account's gifts, for what they have already paid it; null while they are being read. */
  gifts: ReadonlyArray<Readonly<{ takeable?: string }>> | null;
  /** The gifts could not be read: the figure is shown without them, and the list under it says so. */
  giftsUnread?: boolean;
}>) {
  const money = useDisplayCurrency(address);
  const dollars = useMoneyHeld(holdings, gifts, giftsUnread);
  const figure = dollars === undefined ? undefined : money.figure(dollars);
  // What this device last saw of this account's money, so a change counts to its value once (brief, section 6).
  const seen = useLastSeen(`viky.seen.money.${address}.${money.currency}`, figure?.value);

  if (figure === undefined) {
    return (
      <section className="money-display-box flex flex-col gap-[var(--space-xs)]">
        <h1 className={CARD_LABEL}>{W.yours}</h1>
        {/* The room the figure will take, at the size it will take, so nothing moves when it lands: five characters
            is what an amount takes here, and the line is the figure's own line whatever stands in it. */}
        <p aria-hidden className={`${AMOUNT} text-[var(--on-surface-faint)]`} style={chars(5)}>
          …
        </p>
      </section>
    );
  }

  return (
    <section className="money-display-box flex flex-col gap-[var(--space-xs)]">
      <h1 className={CARD_LABEL}>{W.yours}</h1>
      <p data-amount className={AMOUNT} style={chars(figure.text.length)}>
        <ArrivalAmount from={seen ?? figure.value} to={figure.value} symbol={figure.symbol} decimals={figure.decimals} after={figure.after} thousands={figure.thousands} />
      </p>
      {!figure.rateDate && money.unavailable ? <p className={HELP}>{money.unavailable}</p> : null}
    </section>
  );
}

/** How many characters the amount has, which is what lets its size give way before its line does (globals.css). */
const chars = (count: number) => ({ "--amount-chars": count }) as CSSProperties;
