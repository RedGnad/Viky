"use client";
import { useEffect, useState } from "react";
import { surelyOutOfReach } from "@/src/out-of-reach";
import type { Rates } from "@/src/rates";
import type { Hex, LocalAccount } from "viem";
import { ApiError } from "@/src/client/api";
import { giftCardCodes, listGiftCards, priceGiftCard, type GiftCardCode, type GiftCardKept, type GiftCardListed } from "@/src/client/giftcards";
import { followPhone, payPhone, type PhonePrice, type PhoneStatus } from "@/src/client/phone";
import { AUSD } from "@/src/coins";
import { twoDecimalsDown } from "@/src/exit-steps";
import { GIFT_CARD_OUT as W } from "@/src/sentences";
import { ChoiceList } from "../kit/ChoiceList";
import { CopyLine } from "../kit/CopyLine";
import { Sheet } from "../kit/Sheet";
import { BODY, CARD, CARD_AMOUNT, CARD_LABEL, FIELD, HELP, INLINE_BUTTON, PRIMARY_BUTTON, SECONDARY_BUTTON, TITLE } from "./ui";

/**
 * A gift card, the Bitrefill way's second use (D271): the card chosen in a sheet, as "Which university?" is, from the
 * cards Bitrefill lists for the number's country, each with Bitrefill's own line on where it works; an amount; done.
 * The person's money moves once, on "Buy the card", after Bitrefill has priced it; the code is shown here and in the
 * history under it, and nowhere else.
 */

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

/** A code as Bitrefill gave it, each part on its own line, the code and the PIN copyable. */
export function GiftCardCodeLines({ code }: Readonly<{ code: GiftCardCode }>) {
  return (
    <div className="flex flex-col gap-[var(--space-sm)]">
      {code.code ? <CopyLine command={code.code} label={W.code} /> : null}
      {code.pin ? <CopyLine command={code.pin} label={W.pin} /> : null}
      {code.link ? (
        <p className={HELP}>
          {W.link}:{" "}
          <a href={code.link} target="_blank" rel="noopener noreferrer" className="underline [overflow-wrap:anywhere]">
            {code.link}
          </a>
        </p>
      ) : null}
      {code.instructions ? <p className={HELP}>{code.instructions}</p> : null}
      {code.expires ? <p className={HELP}>{W.expires(code.expires)}</p> : null}
    </div>
  );
}

export function GiftCardOut(props: Readonly<{ rates?: Rates; country: string | null; countryName: string | null; ausd: bigint; ensureSigner: () => Promise<LocalAccount>; onSessionClosed: () => void; onChanged: () => Promise<unknown>; onBack: () => void }>) {
  const [cards, setCards] = useState<readonly GiftCardListed[] | null | "unreadable">(null);
  const [sheetOpen, setSheetOpen] = useState(true);
  const [card, setCard] = useState<GiftCardListed | null>(null);
  const [packageId, setPackageId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [price, setPrice] = useState<PhonePrice | null>(null);
  const [status, setStatus] = useState<PhoneStatus | null>(null);
  const [kept, setKept] = useState<readonly GiftCardKept[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    if (props.country) {
      listGiftCards(props.country).then(
        (found) => {
          if (live) setCards(found);
        },
        (error) => {
          if (live) setCards(error instanceof ApiError && error.code === "COUNTRY_NOT_SERVED" ? [] : "unreadable");
        },
      );
    }
    giftCardCodes().then(
      (found) => {
        if (live) setKept(found);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [props.country]);

  const refusal = (error: unknown) => {
    if (error instanceof ApiError && error.code === "SIGN_IN_REQUIRED") {
      props.onSessionClosed();
      return;
    }
    setProblem(error instanceof ApiError ? error.message : W.failed);
  };

  // A card on its way is asked again every few seconds for a minute, then left to the person's "Check again".
  const waiting = status?.state === "on_its_way" || status?.state === "refund_pending";
  useEffect(() => {
    if (!waiting || !status) return;
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (tries > 12) {
        clearInterval(timer);
        return;
      }
      followPhone(status.orderId).then((next) => {
        setStatus(next);
        if (next.state === "delivered" || next.state === "refunded") {
          void props.onChanged();
          void giftCardCodes().then(setKept, () => undefined);
        }
      }, () => undefined);
    }, 5_000);
    return () => clearInterval(timer);
  }, [waiting, status, props]);

  const typed = Number(amount.replace(/[\s,]/g, ""));
  const range = card?.range ?? null;
  const typedFits = range !== null && Number.isFinite(typed) && typed >= range.min && typed <= range.max;
  const typedFar = typedFits && card !== null && surelyOutOfReach(typed, card.currency, props.ausd, props.rates);
  const chosenPackage = card?.packages.find((one) => one.id === packageId) ?? null;

  const askPrice = async () => {
    if (!card) return;
    setBusy(true);
    setProblem(null);
    setPrice(null);
    try {
      setPrice(await priceGiftCard({ productId: card.id, ...(chosenPackage ? { packageId: chosenPackage.id } : { value: typed }) }));
    } catch (error) {
      refusal(error);
    } finally {
      setBusy(false);
    }
  };

  const buy = async () => {
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
      const next = await payPhone({ account, price, nonce: randomNonce() });
      setStatus(next);
      await props.onChanged();
      if (next.state === "delivered") void giftCardCodes().then(setKept, () => undefined);
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

  const history =
    kept.length > 0 ? (
      <section className={CARD}>
        <h2 className={TITLE}>{W.history}</h2>
        {kept.map((one) => (
          <div key={one.orderId} className="flex flex-col gap-[var(--space-xs)] border-t border-[var(--divider)] pt-[var(--space-sm)]">
            <p className={BODY}>{W.historyLine(one.name, local(one.localAmount, one.localCurrency), new Date(one.at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }))}</p>
            {one.code ? <GiftCardCodeLines code={one.code} /> : <p className={HELP}>{W.onItsWay}</p>}
          </div>
        ))}
      </section>
    ) : null;

  if (status) {
    const title = status.state === "delivered" ? W.doneTitle : status.state === "on_its_way" ? W.onItsWayTitle : W.refundedTitle;
    return (
      <div className="flex flex-col gap-[var(--space-xl)]">
        <section className={CARD}>
          <h2 className={TITLE}>{title}</h2>
          {status.state === "delivered" && status.code ? <GiftCardCodeLines code={status.code} /> : null}
          {status.state === "on_its_way" ? <p className={BODY}>{W.onItsWay}</p> : null}
          {status.state === "refunded" ? <p className={BODY}>{W.refunded(status.amount)}</p> : null}
          {status.state === "refund_pending" ? <p className={BODY}>{W.refundPending(status.amount)}</p> : null}
          <div className="flex flex-wrap gap-[var(--tap-gap)]">
            {waiting ? (
              <button type="button" onClick={() => void followPhone(status.orderId).then(setStatus, (error) => refusal(error))} className={INLINE_BUTTON}>
                {W.checkAgain}
              </button>
            ) : null}
            <button type="button" onClick={props.onBack} className={INLINE_BUTTON}>
              {W.back}
            </button>
          </div>
        </section>
        {history}
      </div>
    );
  }

  const countryName = props.countryName ?? props.country ?? "";
  const listed = Array.isArray(cards) ? cards : [];
  return (
    <div className="flex flex-col gap-[var(--space-xl)]">
      <section className={CARD}>
        <h2 className={TITLE}>{card ? card.name : W.title}</h2>
        {card ? <p className={CARD_LABEL}>{card.worksIn}</p> : null}
        {!props.country ? <p className={BODY}>{W.noCountry}</p> : null}
        {card && card.packages.length > 0 ? (
          <div className="flex flex-col gap-[var(--tap-gap)]">
            {card.packages.map((one) => {
              // Its face value alone is more than they hold: shown, never hidden, and said why it cannot be chosen.
              const far = surelyOutOfReach(Number(one.value), card.currency, props.ausd, props.rates);
              return (
                <button key={one.id} type="button" aria-pressed={one.id === packageId} onClick={() => { setPackageId(one.id); setAmount(""); setPrice(null); setProblem(null); }} disabled={busy || far} className={one.id === packageId ? PRIMARY_BUTTON : SECONDARY_BUTTON}>
                  {local(one.value, card.currency)}
                  {far ? <span className="block text-[length:var(--type-help)]">{W.outOfReach}</span> : null}
                </button>
              );
            })}
          </div>
        ) : null}
        {card && range ? (
          <label className="flex flex-col gap-[var(--space-xs)]">
            <span className={BODY}>{W.howMuch(card.currency)}</span>
            <input value={amount} onChange={(event) => { setAmount(event.target.value); setPackageId(null); setPrice(null); setProblem(null); }} inputMode="decimal" className={FIELD} disabled={busy} />
            <span className={HELP}>{W.range(String(range.min), String(range.max), card.currency)}</span>
            {typedFar ? <span className={HELP}>{W.outOfReach}</span> : null}
          </label>
        ) : null}
        {price && card ? (
          <div>
            <p className={CARD_LABEL}>{W.priced(local(price.localAmount, price.localCurrency), card.name)}</p>
            <p className={CARD_AMOUNT}>{dollars(price.ausdUnits)}</p>
            <p className={HELP}>{W.costs(dollars(price.ausdUnits), dollars(props.ausd > price.ausdUnits ? props.ausd - price.ausdUnits : 0n), price.feeUnits > 0n ? dollars(price.feeUnits) : undefined)}</p>
          </div>
        ) : null}
        {alert}
        <div className="flex flex-wrap gap-[var(--tap-gap)]">
          {card ? (
            price ? (
              <button type="button" onClick={() => void buy()} disabled={busy} className={PRIMARY_BUTTON}>
                {busy ? W.confirming : W.confirm}
              </button>
            ) : (
              <button type="button" onClick={() => void askPrice()} disabled={busy || (!chosenPackage && (!typedFits || typedFar))} className={PRIMARY_BUTTON}>
                {busy ? W.pricing : W.getPrice}
              </button>
            )
          ) : null}
          {props.country ? (
            <button type="button" onClick={() => setSheetOpen(true)} disabled={busy} className={card ? INLINE_BUTTON : PRIMARY_BUTTON}>
              {card ? W.change : W.choose}
            </button>
          ) : null}
          <button type="button" onClick={props.onBack} disabled={busy} className={INLINE_BUTTON}>
            {W.back}
          </button>
        </div>
      </section>
      {history}
      {props.country ? (
        <Sheet open={sheetOpen} title={W.chooseTitle} help={W.chooseHelp(countryName)} onClose={() => setSheetOpen(false)} tall>
          {cards === null ? <p className={HELP}>{W.reading}</p> : null}
          {cards === "unreadable" ? <p className={HELP}>{W.failed}</p> : null}
          {Array.isArray(cards) && cards.length === 0 ? <p className={HELP}>{W.none(countryName)}</p> : null}
          {listed.length > 0 ? (
            <ChoiceList
              name="gift-card"
              legend={W.chooseTitle}
              legendHidden
              shape="lines"
              value={card?.id ?? null}
              onChange={(value) => {
                const one = listed.find((candidate) => candidate.id === value) ?? null;
                setCard(one);
                setPackageId(null);
                setAmount("");
                setPrice(null);
                setProblem(null);
                setSheetOpen(false);
              }}
              // On every line, chosen or not: where each card works is what the person weighs them by (Bitrefill's own words).
              options={listed.map((one) => ({ value: one.id, label: one.name, tag: one.worksIn ? <span className={HELP}>{one.worksIn}</span> : undefined }))}
            />
          ) : null}
        </Sheet>
      ) : null}
    </div>
  );
}
