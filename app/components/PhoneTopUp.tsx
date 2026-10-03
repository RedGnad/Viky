"use client";
import { useEffect, useState } from "react";
import { surelyOutOfReach } from "@/src/out-of-reach";
import type { Rates } from "@/src/rates";
import type { Hex, LocalAccount } from "viem";
import { ApiError } from "@/src/client/api";
import { lastNumber, rememberNumber } from "@/src/client/account-country";
import { findPhoneOperators, followPhone, payPhone, phoneKindOf, pricePhone, type PhoneKind, type PhoneOperator, type PhonePrice, type PhoneStatus } from "@/src/client/phone";
import { AUSD } from "@/src/coins";
import { twoDecimalsDown } from "@/src/exit-steps";
import { PHONE_OUT as W } from "@/src/sentences";
import { BODY, CARD, CARD_AMOUNT, FIELD, HELP, PRIMARY_BUTTON, SECONDARY_BUTTON, SMALL_BUTTON, TITLE } from "./ui";
import { Said } from "../kit/Said";
import { ButtonWords, StepInProgress } from "../kit/Waiting";
import { WAITS } from "@/src/sentences";

/**
 * Your phone, the third way out (D238), in three screens at most: where (the number and its phone company), how much
 * (in the phone's own currency, with the dollars it takes and what stays), done. The person's money moves once, on
 * "Top it up", after Bitrefill has priced the top-up; every refusal is the server's own sentence, under what caused it.
 */

type Screen = "where" | "howMuch" | "done";

function dollars(units: bigint): string {
  return `$${twoDecimalsDown(units, AUSD.decimals)}`;
}

function local(amount: string, currency: string): string {
  const figure = Number(amount);
  return `${Number.isFinite(figure) ? new Intl.NumberFormat("en-US").format(figure) : amount} ${currency}`;
}

function randomNonce(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}` as Hex;
}

export function PhoneTopUp(props: Readonly<{ rates?: Rates; ausd: bigint; ensureSigner: () => Promise<LocalAccount>; onSessionClosed: () => void; onChanged: () => Promise<unknown>; onBack: () => void }>) {
  const [screen, setScreen] = useState<Screen>("where");
  // The number is only ever the top-up's destination (D274): the last one topped up on this device fills the field,
  // and it decides nothing else, not the country and not the ways out.
  const [phone, setPhone] = useState(() => (typeof window === "undefined" ? "" : (lastNumber() ?? "")));
  const [operators, setOperators] = useState<readonly PhoneOperator[] | null>(null);
  // Credit or data (the founder, 26 Sep 2026): the same order, the same treasury, the same ceilings, another product.
  const [kind, setKind] = useState<PhoneKind>("credit");
  const [operator, setOperator] = useState<PhoneOperator | null>(null);
  const [packageId, setPackageId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [price, setPrice] = useState<PhonePrice | null>(null);
  const [status, setStatus] = useState<PhoneStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const refusal = (error: unknown): boolean => {
    if (error instanceof ApiError && error.code === "SIGN_IN_REQUIRED") {
      props.onSessionClosed();
      return true;
    }
    setProblem(error instanceof ApiError ? error.message : W.failed);
    return false;
  };

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
    setPackageId(null);
    setAmount("");
    setPrice(null);
    setProblem(null);
    setScreen("howMuch");
  };

  const ofKind = (operators ?? []).filter((one) => phoneKindOf(one) === kind);
  const typed = Number(amount.replace(/[\s,]/g, ""));
  const range = operator?.range ?? null;
  const typedFits = range !== null && Number.isFinite(typed) && typed >= range.min && typed <= range.max;
  const typedFar = typedFits && operator !== null && surelyOutOfReach(typed, operator.currency, props.ausd, props.rates);
  const chosenPackage = operator?.packages.find((one) => one.id === packageId) ?? null;

  const askPrice = async () => {
    if (!operator) return;
    setBusy(true);
    setProblem(null);
    setPrice(null);
    try {
      setPrice(await pricePhone({ phone, operatorId: operator.id, ...(chosenPackage ? { packageId: chosenPackage.id } : { value: typed }) }));
    } catch (error) {
      refusal(error);
    } finally {
      setBusy(false);
    }
  };

  const topUp = async () => {
    if (!price) return;
    let account: LocalAccount;
    try {
      account = await props.ensureSigner();
    } catch {
      props.onSessionClosed();
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      setStatus(await payPhone({ account, price, nonce: randomNonce() }));
      rememberNumber(phone);
      setScreen("done");
      await props.onChanged();
    } catch (error) {
      refusal(error);
    } finally {
      setBusy(false);
    }
  };

  const alert = problem ? (
    <p role="alert" className={`${HELP} font-medium`}>
      {problem}
    </p>
  ) : null;

  if (screen === "done" && status && price) {
    const title = status.state === "delivered" ? W.doneTitle : status.state === "on_its_way" ? W.onItsWayTitle : W.refundedTitle;
    return (
      <section className={CARD}>
        <h2 className={TITLE}>{title}</h2>
        {status.state === "delivered" ? <p className={BODY}>{W.delivered(local(price.localAmount, price.localCurrency), price.operatorName)}</p> : null}
        {status.state === "on_its_way" ? <Said text={W.onItsWay} /> : null}
        {status.state === "refunded" ? <p className={BODY}>{W.refunded(status.amount)}</p> : null}
        {status.state === "refund_pending" ? <p className={BODY}>{W.refundPending(status.amount)}</p> : null}
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
        <h2 className={TITLE}>{W.howMuchTitle}</h2>
        {operator.packages.length > 0 ? (
          <div className="flex flex-col gap-[var(--tap-gap)]">
            {operator.packages.map((one) => {
              // Its face value alone is more than they hold: shown, never hidden, and said why it cannot be chosen.
              const far = surelyOutOfReach(Number(one.value), operator.currency, props.ausd, props.rates);
              return (
                <button key={one.id} type="button" aria-pressed={one.id === packageId} onClick={() => { setPackageId(one.id); setAmount(""); setPrice(null); setProblem(null); }} disabled={busy || far} className={one.id === packageId ? PRIMARY_BUTTON : SECONDARY_BUTTON}>
                  {local(one.value, operator.currency)}
                  {far ? <span className="block text-[length:var(--type-help)]">{W.outOfReach}</span> : null}
                </button>
              );
            })}
          </div>
        ) : null}
        {range ? (
          <label className="flex flex-col gap-[var(--space-xs)]">
            <span className={BODY}>{W.howMuch(operator.currency)}</span>
            <input value={amount} onChange={(event) => { setAmount(event.target.value); setPackageId(null); setPrice(null); setProblem(null); }} inputMode="numeric" className={FIELD} disabled={busy} />
            <span className={HELP}>{W.range(local(String(range.min), "").trim(), local(String(range.max), "").trim(), operator.currency)}</span>
            {typedFar ? <span className={HELP}>{W.outOfReach}</span> : null}
          </label>
        ) : null}
        {price ? (
          <div>
            {/* A sentence, so it is said in the help voice and not in small capitals (the founder's rule 5 of 1 Oct 2026). */}
            <p className={HELP}>{W.priced(local(price.localAmount, price.localCurrency), price.operatorName)}</p>
            <p className={CARD_AMOUNT}>{dollars(price.ausdUnits)}</p>
            <p className={HELP}>{W.costs(dollars(price.ausdUnits), dollars(props.ausd > price.ausdUnits ? props.ausd - price.ausdUnits : 0n), price.feeUnits > 0n ? dollars(price.feeUnits) : undefined)}</p>
          </div>
        ) : null}
        {alert}
        <div className="flex flex-wrap gap-[var(--tap-gap)]">
          {price ? (
            <button type="button" onClick={() => void topUp()} disabled={busy} className={PRIMARY_BUTTON}>
              {busy ? W.confirming : W.confirm}
            </button>
          ) : (
            <>
              <button type="button" onClick={() => void askPrice()} disabled={busy || (!chosenPackage && (!typedFits || typedFar))} className={PRIMARY_BUTTON}>
                <ButtonWords busy={busy} doing={W.pricing}>
                  {W.getPrice}
                </ButtonWords>
              </button>
              <StepInProgress busy={busy} step={WAITS.price("Bitrefill")} />
            </>
          )}
          <button type="button" onClick={() => { setScreen("where"); setProblem(null); setPrice(null); }} disabled={busy} className={SMALL_BUTTON}>
            {W.back}
          </button>
        </div>
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
        <button type="button" onClick={() => void find()} disabled={busy || phone.trim().length < 8} className={PRIMARY_BUTTON}>
          <ButtonWords busy={busy} doing={W.finding}>
            {W.find}
          </ButtonWords>
        </button>
        <StepInProgress busy={busy} step={WAITS.operator} />
        <button type="button" onClick={props.onBack} disabled={busy} className={SMALL_BUTTON}>
          {W.back}
        </button>
      </div>
    </section>
  );
}
