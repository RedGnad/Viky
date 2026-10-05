"use client";
import { useEffect, useState } from "react";
import type { LocalAccount } from "viem";
import { ApiError } from "@/src/client/api";
import { followMobileMoney, MoreThanHeld, payableFor, priceMobileMoney, sawMobilePayout, sendChangedDollars, sendToMobileMoney, type AccountOffer, type FollowedPayout, type MobilePrice, type PayableNow } from "@/src/client/mobile-money";
import { useReaderZone } from "@/src/client/reader-zone";
import { AUSD } from "@/src/coins";
import { twoDecimalsDown } from "@/src/exit-steps";
import { delayInWords, localInWords, MOBILE_REFUSALS, momentOf } from "@/src/mobile-money";
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
 * The operators, the rules of the number and of the name and the time are Switch's own for the country (`offer`, read
 * while the person looks). The amount is typed in the country's own money, francs in Senegal, and the dollars it takes
 * from the balance come second (the founder, 3 Oct 2026): the figure is Switch's quote for exactly the amount typed,
 * asked again whenever it changes. Nothing moves before the button.
 *
 * The bounds of the amount are what this account can really send (`payable`, the founder, 5 Oct 2026): the largest is
 * what the balance pays once changed, the cost included, so the amount the field opens on leaves at the first press.
 * An amount over it is said under the field in the country's money, never as an amount without a price.
 *
 * Dollars already changed and not sent, after a cut between two steps, are what the card then sends, and it changes
 * nothing more: money is never changed twice.
 */

type Offered = Extract<AccountOffer, { offered: true; mostUnits: string }>;
type Step = "changing" | "placing" | "sending";
/** A price, or why there is none, in the words of whoever refused it. */
type Priced = MobilePrice | Readonly<{ problem: string }>;

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

/**
 * A payout that money left for: on its way, arrived, or failed, followed to its end. The same card after the press
 * that sent it and when the person comes back to the way out later (the founder, 5 Oct 2026), so it needs nothing of
 * the form: the operator's name and the country's time come with the payout. Once its end has been shown on a screen
 * somebody is looking at, the server is told, and it is not shown again.
 */
export function MobilePayoutCard(props: Readonly<{ payout: FollowedPayout; onChanged: () => Promise<unknown>; onBack: () => void }>) {
  const { onChanged } = props;
  const [payout, setPayout] = useState(props.payout);
  const waiting = payout.phase === "waiting";
  const reference = payout.reference;

  // A payout on its way is asked about every five seconds for a quarter of an hour, then left to "Check again".
  useEffect(() => {
    if (!waiting) return;
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (tries > 180) {
        clearInterval(timer);
        return;
      }
      followMobileMoney(reference).then((next) => {
        setPayout(next);
        if (next.phase !== "waiting") void onChanged();
      }, () => undefined);
    }, 5_000);
    return () => clearInterval(timer);
  }, [waiting, reference, onChanged]);

  // Its end, shown on a screen somebody is looking at: said to the server once, so it does not come back.
  useEffect(() => {
    if (waiting) return;
    let told = false;
    const tell = () => {
      if (told || document.visibilityState !== "visible") return;
      told = true;
      void sawMobilePayout(reference).catch(() => undefined);
    };
    tell();
    document.addEventListener("visibilitychange", tell);
    return () => document.removeEventListener("visibilitychange", tell);
  }, [waiting, reference]);

  const title = payout.phase === "arrived" ? W.arrivedTitle : payout.phase === "failed" ? W.failedTitle : payout.phase === "expired" ? W.expiredTitle : W.waitingTitle;
  return (
    <section className={CARD} data-payout={payout.phase}>
      <h2 className={TITLE}>{title}</h2>
      {payout.phase === "arrived" ? <p className={CARD_AMOUNT}>{localInWords(payout.local, payout.currency)}</p> : null}
      <p className={BODY}>
        {payout.phase === "arrived"
          ? W.arrived(payout.operator, payout.numberEnd)
          : payout.phase === "failed"
            ? W.failed
            : payout.phase === "expired"
              ? W.expired
              : payout.settlement
                ? W.waiting(payout.operator, payout.numberEnd, delayInWords(payout.settlement))
                : W.waitingSent(payout.operator, payout.numberEnd)}
      </p>
      <div className="flex flex-wrap gap-[var(--tap-gap)]">
        {waiting ? (
          <button type="button" onClick={() => void followMobileMoney(reference).then(setPayout, () => undefined)} className={SMALL_BUTTON}>
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

export function MobileMoneyOut(props: Readonly<{ offer: Offered; payable: PayableNow; ensureSigner: () => Promise<LocalAccount>; onSessionClosed: () => void; onChanged: () => Promise<unknown>; onBack: () => void }>) {
  const { offer } = props;
  const zone = useReaderZone();
  const [network, setNetwork] = useState<string | null>(offer.operators.length === 1 ? offer.operators[0].code : null);
  const [number, setNumber] = useState("");
  const [holder, setHolder] = useState("");
  // What this account can send now, read when the card opened and again whenever an answer says it moved.
  const [payable, setPayable] = useState(props.payable);
  const leastLocal = payable.leastLocal;
  const mostLocal = payable.mostLocal;
  const spend = BigInt(payable.spendUnits);
  /** Dollars already changed and not sent on: the card sends those, and the amount is theirs. */
  const changed = payable.changed;
  const dayReached = BigInt(offer.mostUnits) < BigInt(offer.minimumUnits);
  // What it starts at: the most this account can send now, the cost of changing it included.
  const [typed, setTyped] = useState(() => (mostLocal >= leastLocal ? String(mostLocal) : ""));
  const [price, setPrice] = useState<Priced | null>(null);
  const [step, setStep] = useState<Step | "pricing" | null>(null);
  const [payout, setPayout] = useState<FollowedPayout | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  /** The button was pressed: from then on each field says what it is missing, until it is right. */
  const [pressed, setPressed] = useState(false);

  const operatorName = offer.operators.find((operator) => operator.code === network)?.name ?? "";
  const local = localTyped(typed);
  const over = local !== null && local > mostLocal;
  const within = local !== null && local >= leastLocal && !over && !dayReached;
  const digits = number.replace(/\D/g, "");
  const numberFits = new RegExp(offer.numberRule).test(digits);
  const holderFits = new RegExp(offer.nameRule).test(holder.trim());

  /** What can be sent, read again: after an answer that says the balance cannot pay, and after a payout that was cut. */
  const readAgain = async (): Promise<PayableNow | null> => {
    try {
      const fresh = await payableFor(offer.country);
      setPayable(fresh);
      return fresh;
    } catch (error) {
      if (error instanceof ApiError && error.code === "SIGN_IN_REQUIRED") props.onSessionClosed();
      return null;
    }
  };

  /**
   * The price of an amount: Switch's quote for it, then enough of the balance changed to make it. An amount that costs
   * more than the account can change is not a price that failed: what can be sent is read again, and the field says
   * the most in the country's money. Any other refusal is said in its own words.
   */
  const priceOf = async (amount: number, canChange: bigint, wanted: () => boolean = () => true): Promise<Priced | null> => {
    let priced: Priced | null;
    try {
      priced = await priceMobileMoney({ local: amount, country: offer.country, spend: canChange });
    } catch (error) {
      if (error instanceof ApiError && error.code === "SIGN_IN_REQUIRED") {
        props.onSessionClosed();
        return null;
      }
      if (error instanceof MoreThanHeld) {
        const fresh = await readAgain();
        // Read again and still said to be payable: the two answers disagree, and the person is told to try again.
        priced = fresh && amount <= fresh.mostLocal ? { problem: MOBILE_REFUSALS.notNow } : null;
      } else priced = { problem: error instanceof ApiError ? error.message : MOBILE_REFUSALS.notNow };
    }
    // An answer to an amount that has changed since is dropped.
    if (!wanted()) return null;
    setPrice(priced);
    return priced;
  };

  // The figure, priced a moment after the amount stops changing.
  const idle = step === null;
  const fromBalance = changed === null;
  useEffect(() => {
    if (!within || local === null || payout || !idle || !fromBalance) return;
    let current = true;
    const timer = setTimeout(() => {
      setPrice(null);
      void priceOf(local, BigInt(payable.spendUnits), () => current);
    }, 600);
    return () => {
      current = false;
      clearTimeout(timer);
    };
    // The amount and what the account can change decide it; the callbacks of the parent do not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [within, local, offer.country, payout, idle, fromBalance, payable.spendUnits]);

  const send = async () => {
    // The button answers every press (the founder, 4 Oct 2026: it was only grey, and said nothing): a field that is
    // missing or wrong says so under itself, and nothing is asked of the passkey until all of them are right.
    setPressed(true);
    if (!network || !numberFits || !holderFits || (!changed && (!within || local === null))) return;
    setProblem(null);
    // A press with no price yet, or after a price that failed, asks for the price now: it used to do nothing.
    let priced = price;
    if (!changed && (!priced || "problem" in priced) && local !== null) {
      setStep("pricing");
      setPrice(null);
      priced = await priceOf(local, spend);
      if (!priced || "problem" in priced) {
        setStep(null);
        return;
      }
    }
    let account: LocalAccount;
    try {
      account = await props.ensureSigner();
    } catch {
      setStep(null);
      props.onSessionClosed();
      return;
    }
    try {
      const to = { account, country: offer.country, network, number: digits, holderName: holder.trim(), onStep: setStep };
      // Dollars already changed leave as they are; anything else is changed first.
      const started = changed ? await sendChangedDollars({ ...to, exitTx: changed.exitTx }) : await sendToMobileMoney({ ...to, ticket: (priced as MobilePrice).ticket });
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
      // A cut after the money was changed leaves dollars changed in the account: the card reads them and, at the
      // next press, sends those and changes nothing more.
      setPrice(null);
      await readAgain();
    } finally {
      setStep(null);
    }
  };

  if (payout) return <MobilePayoutCard payout={payout} onChanged={props.onChanged} onBack={props.onBack} />;

  // The day's ceiling met: said in place of the form, and nothing to fill in.
  if (dayReached && !changed) {
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
  if (!changed && mostLocal < leastLocal) {
    return (
      <section className={CARD}>
        <h2 className={TITLE}>{W.title}</h2>
        <p className={BODY} data-mobile-under-minimum>
          {W.underMinimum(localInWords(leastLocal, offer.currency), localInWords(mostLocal, offer.currency))}
        </p>
        <button type="button" onClick={props.onBack} className={`${SMALL_BUTTON} self-start`}>
          {W.back}
        </button>
      </section>
    );
  }

  const busy = step !== null;
  /** What the button says while it works: the price being asked after a press, or the step of the payout under way. */
  const doing = step === null ? "" : { ...W.steps, pricing: W.pricing }[step];
  const missing = {
    operator: pressed && !network ? MOBILE_REFUSALS.chooseOperator : null,
    number: pressed && !numberFits ? (number.trim() === "" ? MOBILE_REFUSALS.enterNumber : MOBILE_REFUSALS.numberNotTaken) : null,
    holder: pressed && !holderFits ? (holder.trim() === "" ? MOBILE_REFUSALS.enterName : MOBILE_REFUSALS.writeTheName) : null,
    // More than can be sent is said as soon as it is typed, in the country's money: with what the person has when the
    // balance is what holds it, at a time when a ceiling or the corridor does. The rest waits for a press.
    amount: changed
      ? null
      : over
        ? payable.by === "balance"
          ? W.amountOverHeld(localInWords(mostLocal, offer.currency))
          : W.amountOver(localInWords(mostLocal, offer.currency))
        : pressed && !within
          ? local === null
            ? W.amountMissing
            : W.amountUnder(localInWords(leastLocal, offer.currency))
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
      {changed ? (
        // Dollars already changed and not sent: the amount is theirs, and a press sends them as they are.
        <div className="flex flex-col gap-[var(--space-xs)]" data-mobile-changed>
          <p className={CARD_AMOUNT}>{W.about(localInWords(changed.local, changed.currency))}</p>
          <p className={HELP}>{W.fromChanged(dollarsOf(BigInt(changed.units)))}</p>
        </div>
      ) : (
        <>
          <label className="flex flex-col gap-[var(--space-xs)]">
            <span className={CARD_LABEL}>{W.amount}</span>
            <input value={typed} onChange={(event) => setTyped(event.target.value)} inputMode="numeric" className={FIELD} disabled={busy} aria-invalid={missing.amount ? true : undefined} aria-describedby={missing.amount ? "mobile-amount-refusal" : undefined} />
            {missing.amount ? <FieldRefusal id="mobile-amount-refusal">{missing.amount}</FieldRefusal> : <span className={HELP}>{W.amountHelp(localInWords(leastLocal, offer.currency), localInWords(mostLocal, offer.currency))}</span>}
          </label>
          {/* The figure on the number, and when it was priced: Switch's quote, never a rate of ours. */}
          <div aria-live="polite" className="flex flex-col gap-[var(--space-xs)]" data-mobile-figure>
            {within && price === null ? <WaitLine>{W.pricing}</WaitLine> : null}
            {within && price && "problem" in price ? <p className={HELP}>{price.problem}</p> : null}
            {within && price && !("problem" in price) ? (
              <>
                <p className={CARD_AMOUNT}>{W.about(localInWords(price.local, price.currency))}</p>
                <p className={HELP}>{W.fromBalance(dollarsOf(price.dollars), momentOf(price.at, zone))}</p>
              </>
            ) : null}
          </div>
        </>
      )}
      {problem ? (
        <p role="alert" className={`${HELP} font-medium`}>
          {problem}
        </p>
      ) : null}
      {/* Pressable while nothing is under way, as the giver's sheet is: a press says what is missing. */}
      <button type="button" onClick={() => void send()} disabled={busy} className={PRIMARY_BUTTON}>
        <ButtonWords busy={busy} doing={doing}>
          {operatorName ? W.send(operatorName) : USE_MONEY.mobile.action}
        </ButtonWords>
      </button>
      <button type="button" onClick={props.onBack} disabled={busy} className={`${SMALL_BUTTON} self-start`}>
        {W.back}
      </button>
    </section>
  );
}
