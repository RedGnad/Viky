"use client";
import { useEffect, useState } from "react";
import type { Rates } from "@/src/rates";
import type { Hex, LocalAccount } from "viem";
import { ApiError } from "@/src/client/api";
import { lastNumber, rememberNumber } from "@/src/client/account-country";
import { findPhoneOperators, followPhone, payPhone, phoneKindOf, pricePhone, type PhoneKind, type PhoneOperator, type PhonePrice, type PhoneStatus } from "@/src/client/phone";
import { faceValue, namedInPlural } from "@/src/currencies";
import { PHONE_OUT as W } from "@/src/sentences";
import { BODY, CARD, CARD_LABEL, FIELD, HELP, PRIMARY_BUTTON, SECONDARY_BUTTON, SMALL_BUTTON, TITLE } from "./ui";
import { Said } from "../kit/Said";
import { WAITS } from "@/src/sentences";
import { Button } from "../kit/Button";
import { SpendChoice } from "../kit/SpendChoice";

/**
 * Your phone, the third way out (D238), in three screens at most: where (the number and its phone company), how much
 * (the top-up at its face value in the phone's own currency, what it takes and what stays in the currency the person
 * reads in), done. The person's money moves once, on "Top it up", after Bitrefill has priced the top-up; every refusal
 * is the server's own sentence, under what caused it. The amount, its price and the one button are the spending
 * screens' own (app/kit/SpendChoice.tsx, 10 Oct 2026).
 */

type Screen = "where" | "howMuch" | "done";

/** A face value Bitrefill names, in the phone's own currency: "€10", "5 000 FCFA"; as it came when it is no number. */
function face(amount: string, currency: string): string {
  const figure = Number(amount);
  return Number.isFinite(figure) ? faceValue(figure, currency) : `${amount} ${currency}`;
}

/**
 * The number as the card names whose phone it is: its start and its last two figures, the middle left out. It is the
 * person's own number on their own screen; left whole it is also what a glance over a shoulder takes.
 */
export function numberInShort(phone: string): string {
  const figures = phone.replace(/[^\d+]/g, "");
  if (figures.length < 9) return figures;
  const middle = figures.length - 6;
  return `${figures.slice(0, 4)} ${Array.from({ length: Math.ceil(middle / 2) }, () => "••").join(" ")} ${figures.slice(-2)}`;
}

function randomNonce(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}` as Hex;
}

export function PhoneTopUp(props: Readonly<{ rates?: Rates; ausd: bigint; say: (units: bigint) => string; ensureSigner: () => Promise<LocalAccount>; onSessionClosed: () => void; onChanged: () => Promise<unknown>; onBack: () => void }>) {
  const [screen, setScreen] = useState<Screen>("where");
  // The number is only ever the top-up's destination (D274): the last one topped up on this device fills the field,
  // and it decides nothing else, not the country and not the ways out.
  const [phone, setPhone] = useState(() => (typeof window === "undefined" ? "" : (lastNumber() ?? "")));
  const [operators, setOperators] = useState<readonly PhoneOperator[] | null>(null);
  // Credit or data (the founder, 26 Sep 2026): the same order, the same treasury, the same ceilings, another product.
  const [kind, setKind] = useState<PhoneKind>("credit");
  const [operator, setOperator] = useState<PhoneOperator | null>(null);
  /** What was bought, as the last screen says it once the choice has left this one. */
  const [bought, setBought] = useState<Readonly<{ face: string; operator: string }> | null>(null);
  const [status, setStatus] = useState<PhoneStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  /** The sentence for a refusal, or nothing when it closed the session and the screen is leaving. */
  const refused = (error: unknown): string | null => {
    if (error instanceof ApiError && error.code === "SIGN_IN_REQUIRED") {
      props.onSessionClosed();
      return null;
    }
    return error instanceof ApiError ? error.message : W.failed;
  };
  const refusal = (error: unknown) => setProblem(refused(error));

  // A top-up on its way is asked again every few seconds for a minute, then left to the person's "Check again".
  const onItsWay = status?.state === "on_its_way" || status?.state === "refund_pending";
  useEffect(() => {
    if (!onItsWay || !status) return;
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (tries > 12) {
        clearInterval(timer);
        return;
      }
      followPhone(status.orderId).then((next) => {
        setStatus(next);
        if (next.state === "delivered" || next.state === "refunded") void props.onChanged();
      }, () => undefined);
    }, 5_000);
    return () => clearInterval(timer);
  }, [onItsWay, status, props]);

  const find = async () => {
    setBusy(true);
    setProblem(null);
    setOperators(null);
    try {
      const found = await findPhoneOperators(phone);
      setOperators(found);
      const ofKind = found.filter((one) => phoneKindOf(one) === kind);
      if (ofKind.length === 1) choose(ofKind[0]);
    } catch (error) {
      refusal(error);
    } finally {
      setBusy(false);
    }
  };

  const choose = (chosen: PhoneOperator) => {
    setOperator(chosen);
    setProblem(null);
    setScreen("howMuch");
  };

  const ofKind = (operators ?? []).filter((one) => phoneKindOf(one) === kind);
  /** The person's one signature and the payment: it returns once the screen has moved on, and throws a refusal. */
  const topUp = async (price: PhonePrice) => {
    let account: LocalAccount;
    try {
      account = await props.ensureSigner();
    } catch {
      props.onSessionClosed();
      return;
    }
    const next = await payPhone({ account, price, nonce: randomNonce() });
    setBought({ face: face(price.localAmount, price.localCurrency), operator: price.operatorName });
    setStatus(next);
    rememberNumber(phone);
    setScreen("done");
    await props.onChanged();
  };

  const alert = problem ? (
    <p role="alert" className={`${HELP} font-medium`}>
      {problem}
    </p>
  ) : null;

  if (screen === "done" && status && bought) {
    const title = status.state === "delivered" ? W.doneTitle : status.state === "on_its_way" ? W.onItsWayTitle : W.refundedTitle;
    // What the order took, in the currency the person reads in; in dollars, as the server says it, where it gave no figure.
    const took = status.units ? props.say(BigInt(status.units)) : status.amount;
    return (
      <section className={CARD}>
        <h2 className={TITLE}>{title}</h2>
        {status.state === "delivered" ? <p className={BODY}>{W.delivered(bought.face, bought.operator)}</p> : null}
        {status.state === "on_its_way" ? <Said text={W.onItsWay} /> : null}
        {status.state === "refunded" ? <p className={BODY}>{W.refunded(took)}</p> : null}
        {status.state === "refund_pending" ? <p className={BODY}>{W.refundPending(took)}</p> : null}
        {alert}
        <div className="flex flex-wrap gap-[var(--tap-gap)]">
          {onItsWay ? (
            <button type="button" onClick={() => void followPhone(status.orderId).then(setStatus, (error) => refusal(error))} className={SMALL_BUTTON}>
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

  if (screen === "howMuch" && operator) {
    return (
      <section className={CARD}>
        <h2 className={TITLE}>{W.cardTitle}</h2>
        <p className={CARD_LABEL}>{W.forWhom(numberInShort(phone), operator.name)}</p>
        <SpendChoice
          key={operator.id}
          packages={operator.packages}
          range={operator.range}
          currency={operator.currency}
          held={props.ausd}
          rates={props.rates}
          say={props.say}
          numeric
          ask={(chosen) => pricePhone({ phone, operatorId: operator.id, ...chosen })}
          total={(price, stays, fees) => W.total(face(price.localAmount, price.localCurrency), W.kindsInASentence[kind], price.operatorName, stays, fees)}
          pay={topUp}
          refused={refused}
          words={{ another: W.another, howMuch: W.howMuch(namedInPlural(operator.currency)), range: W.range, outOfReach: W.outOfReach, asking: W.pricing, askingStep: WAITS.price("Bitrefill"), confirm: W.confirm, confirming: W.confirming }}
        >
          {(paying) => (
            <button type="button" onClick={() => { setScreen("where"); setProblem(null); }} disabled={paying} className={SMALL_BUTTON}>
              {W.back}
            </button>
          )}
        </SpendChoice>
      </section>
    );
  }

  return (
    <section className={CARD}>
      <h2 className={TITLE}>{W.whereTitle}</h2>
      <div className="flex flex-col gap-[var(--tap-gap)]">
        <p className={BODY}>{W.whatFor}</p>
        <div className="grid grid-cols-2 gap-[var(--tap-gap)]">
          {(["credit", "data"] as const).map((one) => (
            <button key={one} type="button" aria-pressed={one === kind} onClick={() => { setKind(one); setProblem(null); if (operators && operators.filter((op) => phoneKindOf(op) === one).length === 1) choose(operators.find((op) => phoneKindOf(op) === one)!); }} disabled={busy} className={one === kind ? PRIMARY_BUTTON : SECONDARY_BUTTON}>
              {W.kinds[one]}
            </button>
          ))}
        </div>
      </div>
      <label className="flex flex-col gap-[var(--space-xs)]">
        <span className={BODY}>{W.number}</span>
        <input value={phone} onChange={(event) => { setPhone(event.target.value); setOperators(null); setProblem(null); }} inputMode="tel" autoComplete="tel" className={FIELD} disabled={busy} />
      </label>
      {/* One line under the field, the rest folded (the founder's rule 4 of 1 Oct 2026). */}
      <Said under className={HELP} text={W.numberHelp} />
      {operators && ofKind.length > 1 ? (
        <div className="flex flex-col gap-[var(--tap-gap)]">
          <p className={BODY}>{W.whichCompany}</p>
          {ofKind.map((one) => (
            <button key={one.id} type="button" onClick={() => choose(one)} disabled={busy} className={SECONDARY_BUTTON}>
              {one.name}
            </button>
          ))}
        </div>
      ) : null}
      {operators && operators.length > 0 && ofKind.length === 0 ? <p className={HELP}>{W.noneOfKind(W.kinds[kind])}</p> : null}
      {alert}
      <div className="flex flex-wrap gap-[var(--tap-gap)]">
        <Button doing={busy ? W.finding : null} step={WAITS.operator} waiting={phone.trim().length < 8} onPress={() => void find()}>
          {W.find}
        </Button>
        <button type="button" onClick={props.onBack} disabled={busy} className={SMALL_BUTTON}>
          {W.back}
        </button>
      </div>
    </section>
  );
}
