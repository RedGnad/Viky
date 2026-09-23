"use client";
import { figureWithMark } from "@/src/amount-in-currency";
import { currencyOf, figureIn, perDollar } from "@/src/currencies";
import { proposedDisplayCurrency, rateDateInWords } from "@/src/display-currency";
import type { Rates } from "@/src/rates";
import { MONEY as W } from "@/src/sentences";
import { CARD_LABEL, HELP, MONEY_SIGN } from "../components/ui";
import { Sheet } from "./Sheet";

/**
 * Which currency everything is read in (D152), chosen from a sheet rather than by pressing through them.
 *
 * Every line carries the sign, the code, the name, and on the right the amount on the screen converted into that
 * currency: the choice is useful rather than administrative, because "8.84 EUR" beside "9.99 CHF" beside
 * "880 INR" is what somebody is actually choosing between. Several currencies share a sign, so the code and the
 * name always stand beside it.
 *
 * The one this device suggests comes first, under its own title; the rest follow by name. "About" and the rate's
 * day are said once, at the foot, rather than on every line, and when no rate could be read the sheet says that
 * instead and shows no converted figure at all.
 */
export function CurrencySheet({
  open,
  currency,
  offered,
  units,
  rates,
  ratesAsked,
  language,
  onChoose,
  onClose,
}: Readonly<{
  open: boolean;
  currency: string;
  offered: readonly string[];
  /** What the screen is showing, in the dollars the chain holds, so each line can say what it is worth. */
  units: bigint;
  rates: Rates | undefined;
  /** Whether the rate has been asked for and answered: until then the sheet says nothing about it (D152). */
  ratesAsked: boolean;
  language: string | undefined;
  onChoose: (currency: string) => void;
  onClose: () => void;
}>) {
  const proposed = proposedDisplayCurrency(language);
  const here = offered.includes(proposed) ? [proposed] : [];
  const rest = offered.filter((code) => !here.includes(code));
  /** What the screen's own amount is worth in that currency, and nothing at all where there is no amount to show. */
  const worth = (code: string) => {
    const rate = perDollar(code, rates);
    if (rate === undefined || units === 0n) return null;
    return figureWithMark(figureIn((Number(units) / 1_000_000) * rate, code), code);
  };

  const line = (code: string) => {
    const money = currencyOf(code);
    const chosen = code === currency;
    return (
      <li key={code}>
        <button
          type="button"
          onClick={() => onChoose(code)}
          aria-pressed={chosen}
          className={`flex w-full items-center gap-[var(--space-md)] rounded-[var(--radius-control)] px-[var(--space-md)] py-[var(--space-sm)] text-left min-h-[var(--tap-target)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-text)] ${chosen ? "bg-[var(--chosen)]" : ""}`}
        >
          {/* The mark of the choice, drawn as the condition picker draws its radio (D209, the spec of D152): a ring of
              ink on the surface, filled with ink and a ring of surface on the currency being read. */}
          <span
            aria-hidden
            data-choice={chosen ? "chosen" : "open"}
            className={`h-[22px] w-[22px] shrink-0 rounded-full border-2 border-[var(--control-border)] ${chosen ? "bg-[var(--text)] [box-shadow:inset_0_0_0_4px_var(--surface)]" : "bg-[var(--surface)]"}`}
          />
          <span aria-hidden className={MONEY_SIGN}>
            {money.sign}
          </span>
          {/* Left to right as the spec reads: the sign, the code, the name, and the amount on the right. */}
          <span className="flex min-w-0 flex-col">
            <span className={CARD_LABEL}>{code}</span>
            <span className="truncate">{money.name}</span>
          </span>
          <span className="ml-auto shrink-0 tabular-nums">{worth(code)}</span>
        </button>
      </li>
    );
  };

  return (
    <Sheet open={open} title={W.title} onClose={onClose} tall>
      {here.length > 0 ? (
        <>
          <p className={CARD_LABEL}>{W.whereYouAre}</p>
          <ul className="flex flex-col">{here.map(line)}</ul>
        </>
      ) : null}
      <p className={CARD_LABEL}>{W.everything}</p>
      <ul className="flex flex-col">{rest.map(line)}</ul>
      {/* One sentence, at the foot, about every figure above it; and nothing at all while the rate is still coming. */}
      {rates ? <p className={HELP}>{W.atTheRate(rateDateInWords(rates.date))}</p> : ratesAsked ? <p className={HELP}>{W.noRate}</p> : null}
    </Sheet>
  );
}
