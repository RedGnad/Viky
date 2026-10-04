"use client";
import { useEffect, useState } from "react";
import type { LocalAccount } from "viem";
import { ApiError } from "@/src/client/api";
import { followMobileMoney, priceMobileMoney, sendToMobileMoney, type AccountOffer, type FollowedPayout, type MobilePrice } from "@/src/client/mobile-money";
import { AUSD } from "@/src/coins";
import { twoDecimalsDown } from "@/src/exit-steps";
import { delayInWords, localInWords, localOfUnits, MOBILE_REFUSALS } from "@/src/mobile-money";
import { MOBILE_OUT as W, USE_MONEY } from "@/src/sentences";
import { ChoiceList } from "../kit/ChoiceList";
import { FieldRefusal } from "../kit/FieldRefusal";
import { BODY, CARD, CARD_AMOUNT, CARD_LABEL, FIELD, HELP, PRIMARY_BUTTON, SMALL_BUTTON, TITLE } from "./ui";
import { ButtonWords, WaitLine } from "../kit/Waiting";

/**
 * Your mobile money, the third way out (the founder, 2 Oct 2026), on one card: the operator, the number, the name on the
 * account, how much, the figure it gives on the number with the moment it was priced, one button. Then the wait, said
 * with the time Switch publishes for the country, and then arrived, or that it failed and the money comes back.
 *
 * The operators, the rules of the number and of the name, the smallest and largest payout and the time are Switch's
 * own for the country (`offer`, read while the person looks). The amount is typed in the country's own money, francs in
 * Senegal, and the dollars it takes from the balance come second (the founder, 3 Oct 2026): the figure is Switch's quote
 * for exactly the amount typed, asked again whenever it changes. The field's bounds are said in that money at Switch's
 * published rate; the two ceilings, per payout and per day, are the account's own. Nothing moves before the button.
 */

type Offered = Extract<AccountOffer, { offered: true; mostUnits: string }>;
type Step = "changing" | "placing" | "sending";

function dollarsOf(units: bigint): string {
  return `$${twoDecimalsDown(units, AUSD.decimals)}`;
}

/** An amount typed in local money, spaces and a trailing F allowed, or nothing when it is not one. */
function localTyped(typed: string): number | null {
  const clean = typed.replace(/[\s\u202f]/g, "").replace(/F$/i, "").replace(",", ".");
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) return null;
  const amount = Number(clean);
  return amount > 0 ? amount : null;
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
  // The bounds of one payout now, in dollars: the corridor's, the ceilings', and what the balance holds.
  const least = BigInt(offer.minimumUnits);
  const mostUnits = [BigInt(offer.mostUnits), BigInt(offer.maximumUnits), props.ausd].reduce((low, value) => (value < low ? value : low));
  const leastLocal = localOfUnits(least, offer.rate, "up");
  const mostLocal = localOfUnits(mostUnits, offer.rate, "down");
  const dayReached = BigInt(offer.mostUnits) < least;
  // What it starts at: the most one payout may be now, in the country's money, at Switch's published rate.
  const [typed, setTyped] = useState(() => (mostLocal >= leastLocal ? String(mostLocal) : ""));
  const [price, setPrice] = useState<MobilePrice | "unpriced" | null>(null);
  const [step, setStep] = useState<Step | null>(null);
  const [payout, setPayout] = useState<FollowedPayout | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  /** The button was pressed: from then on each field says what it is missing, until it is right. */
  const [pressed, setPressed] = useState(false);

  const operatorName = offer.operators.find((operator) => operator.code === network)?.name ?? "";
  const local = localTyped(typed);
  const within = local !== null && local >= leastLocal && local <= mostLocal && !dayReached;
  const digits = number.replace(/\D/g, "");
  const numberFits = new RegExp(offer.numberRule).test(digits);
  const holderFits = new RegExp(offer.nameRule).test(holder.trim());

  // The figure, priced again a moment after the amount stops changing: the exchange's floor, then Switch's quote for it.
  useEffect(() => {
    if (!within || local === null || payout || step) return;
    let current = true;
    const timer = setTimeout(() => {
      setPrice(null);
      priceMobileMoney({ local, country: offer.country }).then(
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
  }, [within, local, offer.country, payout, step]);

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
    // The button answers every press (the founder, 4 Oct 2026: it was only grey, and said nothing): a field that is
    // missing or wrong says so under itself, and nothing is asked of the passkey until all of them are right.
    setPressed(true);
    if (!network || !numberFits || !holderFits || !within) return;
    if (!price || price === "unpriced") return;
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

  // The day's ceiling met: said in place of the form, and nothing to fill in.
  if (dayReached) {
    return (
      <section className={CARD}>
        <h2 className={TITLE}>{W.title}</h2>
        <p className={BODY} data-mobile-ceiling>
          {MOBILE_REFUSALS.dayReached()}
        </p>
        <button type="button" onClick={props.onBack} className={`${SMALL_BUTTON} self-start`}>
          {W.back}
        </button>
      </section>
    );
  }

  // The balance is under the country's smallest payout: said in place of the form, as the day's ceiling is, with the
  // minimum in the country's money and what the person has. The field used to open empty, between two bounds the
  // wrong way round ("From 590 F to 294 F at a time."), over a button that did nothing.
  if (mostLocal < leastLocal) {
    return (
      <section className={CARD}>
        <h2 className={TITLE}>{W.title}</h2>
        <p className={BODY} data-mobile-under-minimum>
          {W.underMinimum(localInWords(leastLocal, offer.currency), localInWords(localOfUnits(props.ausd, offer.rate, "down"), offer.currency))}
        </p>
        <button type="button" onClick={props.onBack} className={`${SMALL_BUTTON} self-start`}>
          {W.back}
        </button>
      </section>
    );
  }

  const busy = step !== null;
  const missing = {
    operator: pressed && !network ? MOBILE_REFUSALS.chooseOperator : null,
    number: pressed && !numberFits ? MOBILE_REFUSALS.numberNotTaken : null,
    holder: pressed && !holderFits ? MOBILE_REFUSALS.writeTheName : null,
    amount:
      pressed && !within
        ? local === null
          ? W.amountMissing
          : local < leastLocal
            ? W.amountUnder(localInWords(leastLocal, offer.currency))
            : W.amountOver(localInWords(mostLocal, offer.currency))
        : null,
  };
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
      <FieldRefusal id="mobile-operator-refusal">{missing.operator}</FieldRefusal>
      {/* Each field: its help while nothing is wrong with it, and what it is missing in its place after a press. */}
      <label className="flex flex-col gap-[var(--space-xs)]">
        <span className={CARD_LABEL}>{W.number}</span>
        <input value={number} onChange={(event) => setNumber(event.target.value)} inputMode="tel" autoComplete="tel" className={FIELD} disabled={busy} aria-invalid={missing.number ? true : undefined} aria-describedby={missing.number ? "mobile-number-refusal" : undefined} />
        {missing.number ? <FieldRefusal id="mobile-number-refusal">{missing.number}</FieldRefusal> : <span className={HELP}>{W.numberHelp}</span>}
      </label>
      <label className="flex flex-col gap-[var(--space-xs)]">
        <span className={CARD_LABEL}>{W.holder}</span>
        <input value={holder} onChange={(event) => setHolder(event.target.value)} autoComplete="name" className={FIELD} disabled={busy} aria-invalid={missing.holder ? true : undefined} aria-describedby={missing.holder ? "mobile-holder-refusal" : undefined} />
        {missing.holder ? <FieldRefusal id="mobile-holder-refusal">{missing.holder}</FieldRefusal> : <span className={HELP}>{W.holderHelp}</span>}
      </label>
      <label className="flex flex-col gap-[var(--space-xs)]">
        <span className={CARD_LABEL}>{W.amount}</span>
        <input value={typed} onChange={(event) => setTyped(event.target.value)} inputMode="numeric" className={FIELD} disabled={busy} aria-invalid={missing.amount ? true : undefined} aria-describedby={missing.amount ? "mobile-amount-refusal" : undefined} />
        {missing.amount ? <FieldRefusal id="mobile-amount-refusal">{missing.amount}</FieldRefusal> : <span className={HELP}>{W.amountHelp(localInWords(leastLocal, offer.currency), localInWords(mostLocal, offer.currency))}</span>}
      </label>
      {/* The figure on the number, and when it was priced: Switch's quote, never a rate of ours. */}
      <div aria-live="polite" className="flex flex-col gap-[var(--space-xs)]" data-mobile-figure>
        {within && price === null ? <WaitLine>{W.pricing}</WaitLine> : null}
        {price === "unpriced" ? <p className={HELP}>{W.unpriced}</p> : null}
        {price && price !== "unpriced" ? (
          <>
            <p className={CARD_AMOUNT}>{W.about(localInWords(price.local, price.currency))}</p>
            <p className={HELP}>{W.fromBalance(dollarsOf(price.dollars), momentOf(price.at))}</p>
          </>
        ) : null}
      </div>
      {problem ? (
        <p role="alert" className={`${HELP} font-medium`}>
          {problem}
        </p>
      ) : null}
      {/* Pressable while nothing is under way, as the giver's sheet is: a press says what is missing. */}
      <button type="button" onClick={() => void send()} disabled={busy} className={PRIMARY_BUTTON}>
        <ButtonWords busy={step !== null} doing={step ? W.steps[step] : ""}>
          {operatorName ? W.send(operatorName) : USE_MONEY.mobile.action}
        </ButtonWords>
      </button>
      <button type="button" onClick={props.onBack} disabled={busy} className={`${SMALL_BUTTON} self-start`}>
        {W.back}
      </button>
    </section>
  );
}
