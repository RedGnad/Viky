"use client";
import { useEffect, useState } from "react";
import type { LocalAccount } from "viem";
import { ApiError } from "@/src/client/api";
import { followMobileMoney, priceMobileMoney, sendToMobileMoney, type FollowedPayout, type MobileOffer, type MobilePrice } from "@/src/client/mobile-money";
import { AUSD } from "@/src/coins";
import { twoDecimalsDown } from "@/src/exit-steps";
import { delayInWords, localInWords } from "@/src/mobile-money";
import { MOBILE_OUT as W, USE_MONEY } from "@/src/sentences";
import { ChoiceList } from "../kit/ChoiceList";
import { BODY, CARD, CARD_AMOUNT, CARD_LABEL, FIELD, HELP, PRIMARY_BUTTON, SMALL_BUTTON, TITLE } from "./ui";

/**
 * Your mobile money, the third way out (the founder, 2 Oct 2026), on one card: the operator, the number, the name on the
 * account, how much, the figure it gives on the number with the moment it was priced, one button. Then the wait, said
 * with the time Switch publishes for the country, and then arrived, or that it failed and the money comes back.
 *
 * The operators, the rules of the number and of the name, the smallest and largest payout and the time are Switch's
 * own for the country (`offer`, read while the person looks). The figure is Switch's quote for the dollars the exchange
 * would make, asked again whenever the amount changes; nothing moves before the button.
 */

type Offered = Extract<MobileOffer, { offered: true }>;
type Step = "changing" | "placing" | "sending";

function dollarsOf(units: bigint): string {
  return `$${twoDecimalsDown(units, AUSD.decimals)}`;
}

/** Dollars typed, in units of six decimals, or nothing when what is typed is not an amount. */
function unitsTyped(typed: string): bigint | null {
  const clean = typed.trim().replace(/^\$/, "");
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) return null;
  const [whole, part = ""] = clean.split(".");
  return BigInt(whole) * 1_000_000n + BigInt(part.padEnd(2, "0")) * 10_000n;
}

/** "2 Oct, 21:40 UTC": the moment a quote was made, in the time every pass and every date of the product is said in. */
function momentOf(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const month = at.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  return `${at.getUTCDate()} ${month}, ${String(at.getUTCHours()).padStart(2, "0")}:${String(at.getUTCMinutes()).padStart(2, "0")} UTC`;
}

export function MobileMoneyOut(props: Readonly<{ offer: Offered; ausd: bigint; ensureSigner: () => Promise<LocalAccount>; onSessionClosed: () => void; onChanged: () => Promise<unknown>; onBack: () => void }>) {
  const { offer } = props;
  const [network, setNetwork] = useState<string | null>(offer.operators.length === 1 ? offer.operators[0].code : null);
  const [number, setNumber] = useState("");
  const [holder, setHolder] = useState("");
  const [typed, setTyped] = useState(() => twoDecimalsDown(props.ausd, AUSD.decimals));
  const [price, setPrice] = useState<MobilePrice | "unpriced" | null>(null);
  const [step, setStep] = useState<Step | null>(null);
  const [payout, setPayout] = useState<FollowedPayout | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const operatorName = offer.operators.find((operator) => operator.code === network)?.name ?? "";
  const units = unitsTyped(typed);
  const least = BigInt(offer.minimumUnits);
  const within = units !== null && units >= least && units <= BigInt(offer.maximumUnits) && units <= props.ausd;
  const digits = number.replace(/\D/g, "");
  const numberFits = new RegExp(offer.numberRule).test(digits);
  const holderFits = new RegExp(offer.nameRule).test(holder.trim());

  // The figure, priced again a moment after the amount stops changing: the exchange's floor, then Switch's quote for it.
  useEffect(() => {
    if (!within || units === null || payout || step) return;
    let current = true;
    const timer = setTimeout(() => {
      setPrice(null);
      priceMobileMoney({ amount: units, country: offer.country }).then(
        (priced) => current && setPrice(priced),
        (error) => {
          if (!current) return;
          if (error instanceof ApiError && error.code === "SIGN_IN_REQUIRED") props.onSessionClosed();
          setPrice("unpriced");
        },
      );
    }, 600);
    return () => {
      current = false;
      clearTimeout(timer);
    };
    // The amount's units decide it; the callbacks of the parent do not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [within, units?.toString(), offer.country, payout, step]);

  // A payout on its way is asked about every five seconds for a quarter of an hour, then left to "Check again".
  const waiting = payout?.phase === "waiting";
  useEffect(() => {
    if (!waiting || !payout) return;
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (tries > 180) {
        clearInterval(timer);
        return;
      }
      followMobileMoney(payout.reference).then((next) => {
        setPayout(next);
        if (next.phase !== "waiting") void props.onChanged();
      }, () => undefined);
    }, 5_000);
    return () => clearInterval(timer);
  }, [waiting, payout, props]);

  const send = async () => {
    if (!price || price === "unpriced" || !network) return;
    let account: LocalAccount;
    try {
      account = await props.ensureSigner();
    } catch {
      props.onSessionClosed();
      return;
    }
    setProblem(null);
    try {
      const started = await sendToMobileMoney({ account, ticket: price.ticket, country: offer.country, network, number: digits, holderName: holder.trim(), onStep: setStep });
      setPayout(await followMobileMoney(started.reference));
      await props.onChanged();
    } catch (error) {
      if (error instanceof ApiError && error.code === "SIGN_IN_REQUIRED") {
        props.onSessionClosed();
        return;
      }
      // Every refusal is the route's own sentence: each says what was taken, or that nothing was.
      setProblem(error instanceof ApiError ? error.message : W.failedSend);
      await props.onChanged();
    } finally {
      setStep(null);
    }
  };

  if (payout) {
    const figure = localInWords(payout.local, payout.currency);
    const end = payout.numberEnd;
    const name = offer.operators.find((operator) => operator.code === payout.network)?.name ?? payout.network;
    const title = payout.phase === "arrived" ? W.arrivedTitle : payout.phase === "failed" ? W.failedTitle : payout.phase === "expired" ? W.expiredTitle : W.waitingTitle;
    return (
      <section className={CARD} data-payout={payout.phase}>
        <h2 className={TITLE}>{title}</h2>
        {payout.phase === "arrived" ? <p className={CARD_AMOUNT}>{figure}</p> : null}
        <p className={BODY}>
          {payout.phase === "arrived"
            ? W.arrived(name, end)
            : payout.phase === "failed"
              ? W.failed
              : payout.phase === "expired"
                ? W.expired
                : W.waiting(name, end, delayInWords(offer.settlement))}
        </p>
        <div className="flex flex-wrap gap-[var(--tap-gap)]">
          {payout.phase === "waiting" ? (
            <button type="button" onClick={() => void followMobileMoney(payout.reference).then(setPayout, () => undefined)} className={SMALL_BUTTON}>
              {W.checkAgain}
            </button>
          ) : null}
          <button type="button" onClick={props.onBack} className={SMALL_BUTTON}>
            {W.back}
          </button>
        </div>
      </section>
    );
  }

  const busy = step !== null;
  const ready = price !== null && price !== "unpriced" && network !== null && numberFits && holderFits && within && !busy;
  return (
    <section className={CARD}>
      <h2 className={TITLE}>{W.title}</h2>
      <ChoiceList
        name="mobile-operator"
        legend={W.operator}
        shape="lines"
        options={offer.operators.map((operator) => ({ value: operator.code, label: operator.name }))}
        value={network}
        onChange={setNetwork}
        disabled={busy}
      />
      <label className="flex flex-col gap-[var(--space-xs)]">
        <span className={CARD_LABEL}>{W.number}</span>
        <input value={number} onChange={(event) => setNumber(event.target.value)} inputMode="tel" autoComplete="tel" className={FIELD} disabled={busy} />
        <span className={HELP}>{W.numberHelp}</span>
      </label>
      <label className="flex flex-col gap-[var(--space-xs)]">
        <span className={CARD_LABEL}>{W.holder}</span>
        <input value={holder} onChange={(event) => setHolder(event.target.value)} autoComplete="name" className={FIELD} disabled={busy} />
        <span className={HELP}>{W.holderHelp}</span>
      </label>
      <label className="flex flex-col gap-[var(--space-xs)]">
        <span className={CARD_LABEL}>{W.amount}</span>
        <input value={typed} onChange={(event) => setTyped(event.target.value)} inputMode="decimal" className={FIELD} disabled={busy} />
        <span className={HELP}>{W.amountHelp(dollarsOf(least))}</span>
      </label>
      {/* The figure on the number, and when it was priced: Switch's quote, never a rate of ours. */}
      <div aria-live="polite" className="flex flex-col gap-[var(--space-xs)]" data-mobile-figure>
        {within && price === null ? <p className={HELP}>{W.pricing}</p> : null}
        {price === "unpriced" ? <p className={HELP}>{W.unpriced}</p> : null}
        {price && price !== "unpriced" ? (
          <>
            <p className={CARD_AMOUNT}>{W.about(localInWords(price.local, price.currency))}</p>
            <p className={HELP}>{W.pricedAt(momentOf(price.at))}</p>
          </>
        ) : null}
      </div>
      {problem ? (
        <p role="alert" className={`${HELP} font-medium`}>
          {problem}
        </p>
      ) : null}
      <button type="button" onClick={() => void send()} disabled={!ready} className={PRIMARY_BUTTON}>
        {step ? W.steps[step] : operatorName ? W.send(operatorName) : USE_MONEY.mobile.action}
      </button>
      <button type="button" onClick={props.onBack} disabled={busy} className={`${SMALL_BUTTON} self-start`}>
        {W.back}
      </button>
    </section>
  );
}
