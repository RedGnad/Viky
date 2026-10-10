"use client";
import { useEffect, useState } from "react";
import type { Rates } from "@/src/rates";
import type { SpendMoney } from "@/src/display-currency";
import type { Hex, LocalAccount } from "viem";
import { ApiError } from "@/src/client/api";
import { giftCardCodes, listGiftCards, priceGiftCard, type GiftCardCode, type GiftCardKept, type GiftCardListed } from "@/src/client/giftcards";
import { followPhone, payPhone, type PhonePrice, type PhoneStatus } from "@/src/client/phone";
import { faceValue, namedInPlural } from "@/src/currencies";
import { GIFT_CARD_OUT as W, WAITS } from "@/src/sentences";
import { ChoiceList } from "../kit/ChoiceList";
import { CopyLine } from "../kit/CopyLine";
import { Sheet } from "../kit/Sheet";
import { BODY, CARD, CARD_LABEL, HELP, PRIMARY_BUTTON, SMALL_BUTTON, TITLE } from "./ui";
import { Said } from "../kit/Said";
import { SpendChoice } from "../kit/SpendChoice";
import { WaitLine } from "../kit/Waiting";

/**
 * A gift card, the Bitrefill way's second use (D271): the card chosen in a sheet, as "Which university?" is, from the
 * cards Bitrefill lists for the number's country, each with Bitrefill's own line on where it works; an amount; done.
 * The person's money moves once, on "Buy the card", after Bitrefill has priced it; the code is shown here and in the
 * history under it, and nowhere else.
 *
 * The amount, its price and the one button are the spending screens' own (app/kit/SpendChoice.tsx, 10 Oct 2026): the
 * account's money in the currency the person reads in, the card's face value in the card's.
 */

/** A face value Bitrefill names, in its own currency: "€20", "5 000 FCFA"; as it came when it is no number. */
function face(amount: string, currency: string): string {
  const figure = Number(amount);
  return Number.isFinite(figure) ? faceValue(figure, currency) : `${amount} ${currency}`;
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
        <a href={code.link} target="_blank" rel="noopener noreferrer" className={`${SMALL_BUTTON} self-start no-underline`}>
          {W.link}
        </a>
      ) : null}
      {code.instructions ? <p className={HELP}>{code.instructions}</p> : null}
      {code.expires ? <p className={HELP}>{W.expires(code.expires)}</p> : null}
    </div>
  );
}

export function GiftCardOut(props: Readonly<{ rates?: Rates; country: string | null; countryName: string | null; ausd: bigint; money: SpendMoney; ensureSigner: () => Promise<LocalAccount>; onSessionClosed: () => void; onChanged: () => Promise<unknown>; onBack: () => void }>) {
  const [cards, setCards] = useState<readonly GiftCardListed[] | null | "unreadable">(null);
  const [sheetOpen, setSheetOpen] = useState(true);
  const [card, setCard] = useState<GiftCardListed | null>(null);
  /** The card that was bought, as it is named once the choice has left the screen. */
  const [bought, setBought] = useState<string | null>(null);
  const [status, setStatus] = useState<PhoneStatus | null>(null);
  const [kept, setKept] = useState<readonly GiftCardKept[]>([]);
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

  /** The sentence for a refusal, or nothing when it closed the session and the screen is leaving. */
  const refused = (error: unknown): string | null => {
    if (error instanceof ApiError && error.code === "SIGN_IN_REQUIRED") {
      props.onSessionClosed();
      return null;
    }
    return error instanceof ApiError ? error.message : W.failed;
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

  /** The person's one signature and the payment: it returns once the screen has moved on, and throws a refusal. */
  const buy = async (chosen: GiftCardListed, price: PhonePrice) => {
    let account: LocalAccount;
    try {
      account = await props.ensureSigner();
    } catch {
      props.onSessionClosed();
      return;
    }
    const next = await payPhone({ account, price, nonce: randomNonce() });
    setBought(W.card(face(price.localAmount, price.localCurrency), chosen.name));
    setStatus(next);
    await props.onChanged();
    if (next.state === "delivered") void giftCardCodes().then(setKept, () => undefined);
  };

  const history =
    kept.length > 0 ? (
      <section className={CARD}>
        <h2 className={TITLE}>{W.history}</h2>
        {kept.map((one) => (
          <div key={one.orderId} className="flex flex-col gap-[var(--space-xs)] border-t border-[var(--divider)] pt-[var(--space-sm)]">
            <p className={BODY}>{W.historyLine(one.name, face(one.localAmount, one.localCurrency), new Date(one.at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }))}</p>
            {one.code ? <GiftCardCodeLines code={one.code} /> : <Said className={HELP} text={W.onItsWay} />}
          </div>
        ))}
      </section>
    ) : null;

  if (status) {
    const title = status.state === "delivered" ? W.doneTitle : status.state === "on_its_way" ? W.onItsWayTitle : W.refundedTitle;
    // What the order took, in the currency the person reads in; in dollars, as the server says it, where it gave no figure.
    const took = status.units ? props.money.say(BigInt(status.units)) : status.amount;
    return (
      <div className="flex flex-col gap-[var(--space-xl)]">
        <section className={CARD}>
          <h2 className={TITLE}>{title}</h2>
          {bought && status.state !== "refunded" && status.state !== "refund_pending" ? <p className={HELP}>{bought}.</p> : null}
          {status.state === "delivered" && status.code ? <GiftCardCodeLines code={status.code} /> : null}
          {status.state === "delivered" && status.code ? <p className={HELP}>{W.stays}</p> : null}
          {status.state === "on_its_way" ? <Said text={W.onItsWay} /> : null}
          {status.state === "refunded" ? <p className={BODY}>{W.refunded(took)}</p> : null}
          {status.state === "refund_pending" ? <p className={BODY}>{W.refundPending(took)}</p> : null}
          {problem ? (
            <p role="alert" className={`${HELP} font-medium`}>
              {problem}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-[var(--tap-gap)]">
            {waiting ? (
              <button type="button" onClick={() => void followPhone(status.orderId).then(setStatus, (error) => setProblem(refused(error)))} className={SMALL_BUTTON}>
                {W.checkAgain}
              </button>
            ) : null}
            <button type="button" onClick={props.onBack} className={SMALL_BUTTON}>
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
  const small = (paying: boolean) => (
    <>
      {props.country ? (
        <button type="button" onClick={() => setSheetOpen(true)} disabled={paying} className={card ? SMALL_BUTTON : PRIMARY_BUTTON}>
          {card ? W.change : W.choose}
        </button>
      ) : null}
      <button type="button" onClick={props.onBack} disabled={paying} className={SMALL_BUTTON}>
        {W.back}
      </button>
    </>
  );
  return (
    <div className="flex flex-col gap-[var(--space-xl)]">
      <section className={CARD}>
        <h2 className={TITLE}>{card ? card.name : W.title}</h2>
        {card ? <p className={CARD_LABEL}>{card.worksIn}</p> : null}
        {!props.country ? <p className={BODY}>{W.noCountry}</p> : null}
        {card ? (
          // Another card is another choice from nothing: its amounts, no price, no refusal left from the one before.
          <SpendChoice
            key={card.id}
            packages={card.packages}
            range={card.range}
            currency={card.currency}
            held={props.ausd}
            rates={props.rates}
            money={props.money}
            ask={(chosen) => priceGiftCard({ productId: card.id, ...chosen })}
            total={(price, stays, fees) => W.total(face(price.localAmount, price.localCurrency), card.name, stays, fees)}
            pay={(price) => buy(card, price)}
            refused={refused}
            words={{ another: W.another, howMuch: W.howMuch(namedInPlural(card.currency)), range: W.range, outOfReach: W.outOfReach, asking: W.pricing, askingStep: WAITS.price("Bitrefill"), confirm: W.confirm, confirming: W.confirming }}
          >
            {small}
          </SpendChoice>
        ) : (
          <div className="flex flex-wrap gap-[var(--tap-gap)]">{small(false)}</div>
        )}
      </section>
      {history}
      {props.country ? (
        <Sheet open={sheetOpen} title={W.chooseTitle} help={W.chooseHelp(countryName)} onClose={() => setSheetOpen(false)} tall>
          {cards === null ? <WaitLine>{W.reading}</WaitLine> : null}
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
                setCard(listed.find((candidate) => candidate.id === value) ?? null);
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
