"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "@/src/account/provider";
import { getJson } from "@/src/client/api";
import { useDisplayCurrency } from "@/src/client/display-currency";
import { readAusdBalance } from "@/src/client/onchain";
import { whereTheRailsServe } from "@/src/client/rails";
import { conditionById } from "@/src/conditions";
import { certificateById, milestoneById } from "@/src/milestone-conditions";
import { settlingTimeInWords } from "@/src/pass-schedule";
import { draftToTerms, draftUnits, isComplete, type GiftDraft } from "@/src/gift-draft";
import { chainMarginEur, serviceChargeDollars, serviceChargeIsCeiling, wayInFor, type WayInOffer } from "@/src/gift-amount";
import { tidyGiftName } from "@/src/gift-names";
import { judgeLineIsTrue } from "@/src/judge-line";
import { formatAusd } from "@/src/gift-reader";
import { ExactLine, LedFigure } from "../LedAmount";
import { savePendingGift } from "@/src/pending-gift";
import { rateDateInWords, spokenAmount } from "@/src/display-currency";
import type { RailReach } from "@/src/rail-country";
import { feeSentence, wayInFillsIn, wayInPage, waysIn, WAY_IN_USDC } from "@/src/rails";
import { CASH_OUT, FUND, MILESTONE_FUND, PAY as W } from "@/src/sentences";
import { BODY, CARD_AMOUNT, CARD_LABEL, HELP, INLINE_BUTTON, PRIMARY_BUTTON } from "../../components/ui";
import { AccountPanel } from "../../components/AccountPanel";
import { Field } from "../Field";
import { CardNotOffered, CardTermsLine } from "./CardTerms";
import { JudgeCode } from "./JudgeCode";
import { FieldRefusal } from "../FieldRefusal";
import { Sheet } from "../Sheet";

/**
 * Paying for the gift on the card (the rendered mockup pay.html, 19 Sep 2026, which is the specification for this
 * surface and replaces the check screen of the old assistant).
 *
 * What it says, and nothing else: what the gift is worth in the recipient's name, what the card service charges,
 * that Viky takes nothing, what the person actually pays in their own currency and at what rate, and that their face
 * or their fingerprint makes the account at the moment they press pay. Then one action in the sun.
 *
 * What it does not do: ask for an account first, ask them to choose between two card services, or read anything back
 * that the card above it already says.
 *
 * One way in, chosen for the person (D239, the founder's decision of 25 Sep 2026): the rail that sells what a gift
 * holds, from 6 EUR, unless it refuses them, by its own answer about their country, its own asset list, or its
 * published floor; then the rail that sells the chain's coin, from 25 EUR, and one sentence in our words says which
 * refused, why, and which this goes through instead. That sentence is the only place the sheet names a company: on
 * its lines and its button the person is paying by card, and the service is named where it is met, on the page that
 * opens. "What the card service charges" is that service's own published figure at this amount (`serviceChargeEur`).
 *
 * With Swapper's id set (the founder, 1 Oct 2026), a third way stands first where it serves the payer: the card is
 * paid inside Viky, with nothing to choose and no code to paste. The press on pay opens it on the screen that waits
 * (`SwapperSheet`, in app/components/PayGift.tsx), not over this sheet: the press is also what makes a first funder's
 * account, and Home is drawn again for somebody signed in, which shuts every sheet standing on it (measured 1 Oct
 * 2026). Without the id, nothing here changes.
 */
function everyMinute(changed: () => void): () => void {
  const timer = setInterval(changed, 60_000);
  return () => clearInterval(timer);
}
const thisMinute = () => Math.floor(Date.now() / 60_000) * 60_000;
const noClock = () => 0;

/** Which way refused, why, and which one stands instead, in our words. */
function insteadSentence(offer: WayInOffer): string {
  const first = offer.insteadOf!.way;
  if (offer.insteadOf!.because === "country") return W.instead.country(first.name, offer.way.name);
  if (offer.insteadOf!.because === "paused") return W.instead.paused(first.name, offer.way.name);
  return W.instead.floor(first.name, first.smallestEur, offer.way.name);
}

export function PaySheet({
  open,
  draft,
  onChange,
  onClose,
}: Readonly<{ open: boolean; draft: GiftDraft; onChange: (draft: GiftDraft) => void; onClose: () => void }>) {
  const { address, ensureSigner, status } = useAccount();
  const router = useRouter();
  const money = useDisplayCurrency(address);
  const [held, setHeld] = useState<bigint | null>(null);
  const [railIn, setRailIn] = useState<Readonly<Record<string, RailReach>>>({});
  /** Whether the card is offered to this payer (src/card-rail.ts); until the server has said, it is. */
  const [card, setCard] = useState<Readonly<{ offered: boolean; country: string | null }> | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyRefused, setCopyRefused] = useState(false);
  const [balanceRead, setBalanceRead] = useState(0);
  // The judge credit this account received from the judge code, while nothing has left the account since (D295): asked
  // of the server, and read again once the code has given it, null until the server says so. The code itself is
  // `JudgeCode`'s (D297, D299).
  const [untouchedCredit, setUntouchedCredit] = useState<bigint | null>(null);
  useEffect(() => {
    if (!open) return;
    let live = true;
    getJson<{ open?: boolean; credited?: boolean; untouchedCredit?: string | null }>("/api/judge/credit").then(
      (answer) => {
        if (!live) return;
        setUntouchedCredit(typeof answer.untouchedCredit === "string" && /^\d+$/.test(answer.untouchedCredit) ? BigInt(answer.untouchedCredit) : null);
      },
      () => {
        if (live) setUntouchedCredit(null);
      },
    );
    return () => {
      live = false;
    };
  }, [open, address, balanceRead]);
  /** The reader's own clock, read once a minute: the hour the settling pass runs is said in it. */
  const nowMs = useSyncExternalStore(everyMinute, thisMinute, noClock);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    // The device's language goes with the call itself; nothing here is an answer from the person.
    whereTheRailsServe()
      .then((answer) => {
        if (!live) return;
        setRailIn(answer.waysIn);
        setCard(answer.card ?? null);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !address) return;
    let live = true;
    void Promise.resolve()
      .then(() => readAusdBalance(address))
      .then((balance) => {
        if (live) setHeld(balance);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [open, address, balanceRead]);

  const units = draftUnits(draft);
  const condition = conditionById(draft.conditionId);
  const recipient = tidyGiftName(draft.recipientName);
  const funder = tidyGiftName(draft.funderName);
  const milestone = milestoneById(draft.conditionId);
  const certificate = certificateById(draft.conditionId);
  const target = Number(draft.target);
  const ready = isComplete(draft) && units !== undefined && condition !== undefined;
  const inAccount = held ?? 0n;
  const enough = units !== undefined && inAccount >= units;
  const short = units === undefined ? 0n : units - inAccount;
  const offer = wayInFor(short, waysIn(), money.rates?.usdPerEur, railIn);
  const way = offer.way;
  /** Paying by card is not offered in the payer's country (the founder, 29 Sep 2026): the account is the way left. */
  const cardClosed = card?.offered === false;
  const byCard = !enough && !cardClosed;
  const euros = units === undefined || !byCard ? 0 : offer.euros;
  /** What the service keeps, in dollars: its own published share or minimum at this amount, at the day's rate. */
  const charge = euros === undefined || euros === 0 ? undefined : serviceChargeDollars(euros, way, money.rates?.usdPerEur);
  // In the reader's own money, like the gift above it and the total under it: the dollars led as every figure is.
  const chargeRead = charge === undefined ? undefined : money.led(BigInt(Math.round(charge * 1_000_000))).lead;
  /** A figure in euros, as the dollars it is worth at the day's rate, so it can be read in the payer's own money. */
  const usdPerEur = money.rates?.usdPerEur;
  const eurosAsUnits = (value: number) => BigInt(Math.round(value * (usdPerEur ?? 0) * 1_000_000));
  // The total in the payer's own money when that is not the euro (the founder, 29 Sep 2026: F CFA in Senegal).
  const totalRead = byCard && euros && usdPerEur && money.currency !== "EUR" ? money.led(eurosAsUnits(euros)).lead : undefined;
  // What a card buying the chain's coin asks beyond the gift and the charge: the margin on the coin's price, the coin
  // that stays in the account and the whole euro. Real money paid, and what is not used stays in the account.
  const margin = byCard && euros ? chainMarginEur(euros, short, way, usdPerEur) : 0;
  const marginRead = margin >= 0.5 ? money.led(eurosAsUnits(margin)).lead : undefined;
  const chargeLine = chargeRead === undefined ? W.about : euros && serviceChargeIsCeiling(euros, way.fee) ? W.upTo(chargeRead) : W.aboutAmount(chargeRead);

  /**
   * The passkey makes the account at the moment pay is pressed, which is what the sheet says it will do. After that
   * the terms are written to the device, the service's page opens inside the same press, and the wait takes over.
   */
  const pay = async () => {
    if (!ready || units === undefined) return;
    setProblem(null);
    setBusy(true);
    try {
      const account = address ?? (await ensureSigner()).address;
      savePendingGift({ ...draftToTerms(draft, account), wayIn: way.name });
      // A card paid inside Viky opens on the wait, in a sheet of its own, by this same press.
      if (!enough && way.embedded) return router.push("/fund?step=paying&card=1");
      // The partner's page opens in this press only when it arrives filled in (D289). Otherwise the person has not seen
      // their code yet, a first funder has only just made it: the waiting screen shows it, with its copy, and opens the
      // page when they press (D296).
      if (!enough && wayInFillsIn(way)) {
        window.open(wayInPage(way, { account, euros }), "_blank", "noopener,noreferrer");
        router.push("/fund?step=paying&opened=1");
      } else router.push("/fund?step=paying");
    } catch {
      setProblem(W.notMade);
    } finally {
      setBusy(false);
    }
  };

  const line = (label: string, value: string) => (
    <div className="flex items-baseline justify-between gap-[var(--space-md)] border-b border-[var(--divider)] py-[var(--space-sm)] last:border-b-0">
      <span className={`${BODY} text-[var(--on-surface-body)]`}>{label}</span>
      {/* A figure is read whole: the label wraps, never the amount ("about F CFA 646" split in two, 29 Sep 2026). */}
      <span className={`${BODY} whitespace-nowrap font-medium tabular-nums`}>{value}</span>
    </div>
  );

  return (
    <Sheet
      open={open}
      title={W.title(recipient)}
      onClose={onClose}
      tall
      footer={
        <>
          {/* Only when the gift is paid from a balance no larger than the judge credit, with nothing gone out of the
              account since it arrived (D295): the balance is then the credit alone. */}
          {judgeLineIsTrue({ gift: units, held, untouchedCredit }) ? <p className={HELP}>{W.fromJudgeCredit}</p> : null}
          {!enough && cardClosed ? (
            <CardNotOffered country={card?.country ?? null} />
          ) : (
            <>
              <button type="button" className={PRIMARY_BUTTON} disabled={!ready || busy || status === "busy"} onClick={() => void pay()}>
                {busy ? W.paying : enough ? W.payFromAccount(formatAusd(units ?? 0n)) : euros ? W.payEuros(euros) : W.pay}
              </button>
              {byCard ? <CardTermsLine way={way} /> : null}
            </>
          )}
          {problem ? <FieldRefusal id="pay-refused">{problem}</FieldRefusal> : null}
          {/* The passkey is how an account is made here. When the device cannot, or the person waved the sheet away,
              the panel that creates one or signs an old one in appears in place, rather than on a screen of its own. */}
          {problem && !address ? <AccountPanel /> : null}
        </>
      }
    >
      {line(W.rows.gift(recipient), spokenAmount(money.led(units ?? 0n)))}
      {enough || cardClosed ? line(W.rows.fromAccount, spokenAmount(money.led(inAccount))) : line(W.rows.service, chargeLine)}
      {line(W.rows.viky, W.nothing)}

      <div className="pt-[var(--space-sm)]">
        <p className={CARD_LABEL}>{byCard ? W.youPay : W.rows.fromAccount}</p>
        {/* From the account, the person's currency leads and the dollars that leave are under it (the founder, 29 Sep
            2026); by card, the euros the service charges are exact, so they lead alone. */}
        {!byCard || euros === undefined || euros === 0 ? (
          <>
            <LedFigure amount={money.led(units ?? 0n)} className={`${CARD_AMOUNT} whitespace-nowrap`} />
            <ExactLine amount={money.led(units ?? 0n)} />
          </>
        ) : (
          <>
            <p className={`${CARD_AMOUNT} whitespace-nowrap`}>{W.euros(euros)}</p>
            {totalRead ? <p className={HELP}>{W.inYourMoney(totalRead)}</p> : null}
          </>
        )}
      </div>
      {/* The rate, its source and why its day may be a Friday: one line, in full, rather than a label in a corner. */}
      {money.rates && byCard ? <p className={HELP}>{W.atTheRate(rateDateInWords(money.rates.date))}</p> : null}
      {marginRead ? <p className={HELP}>{W.chainMargin(marginRead)}</p> : null}
      {offer.atFloor && byCard && euros ? <p className={HELP}>{W.floor(euros)}</p> : null}
      {/* The first way refused this person, and the sheet says which, why and which this goes through instead (D239). */}
      {offer.insteadOf && byCard ? <p className={HELP}>{insteadSentence(offer)}</p> : null}
      {/* What the partner's page will be, before it opens (D289), said only where it is true: the page arrives filled in. */}
      {/* What the partner's page will ask, just before it opens (D289, D294): filled in with Ramp's key, and without it
          what to choose there and where the code goes, with the code one press away once the account exists. */}
      {byCard ? (
        <p className={BODY}>
          {way.embedded
            ? W.partnerEmbedded(way.name, euros)
            : way === WAY_IN_USDC
              ? W.partnerLocked(way.name)
              : wayInFillsIn(way)
                ? W.partnerFilledIn
                : W.partnerPaste(way.name, way.delivers.coin, way.delivers.network, way.arrives === "gift")}
        </p>
      ) : null}
      {/* A judge's code (D297): only while credits are open, and the gift is not yet covered. */}
      {address ? (
        <JudgeCode
          needed={units ?? null}
          held={held}
          onCredited={() => setBalanceRead((n) => n + 1)}
          onMakeIt={(dollars) => onChange({ ...draft, dollars, typedAmount: dollars, typedIn: "USD" })}
        />
      ) : null}
      {/* Where the card is not offered, an account is what money can be sent to: somebody without one makes it here. */}
      {!enough && cardClosed && !address ? <AccountPanel /> : null}
      {/* No code where the card is paid inside Viky: that sheet is already told whose account it is. */}
      {!enough && (cardClosed || (!wayInFillsIn(way) && !way.embedded)) && address ? (
        <div className="flex flex-col gap-[var(--space-xs)]">
          <p className={CARD_LABEL}>{W.yourCode}</p>
          <p className={`${HELP} select-all break-all tabular-nums`}>{address}</p>
          <button
            type="button"
            // A small key and not a second action (D239): the sheet's one action stays "Pay".
            className={`${INLINE_BUTTON} self-start`}
            onClick={() =>
              void navigator.clipboard.writeText(address).then(
                () => {
                  setCopied(true);
                  setCopyRefused(false);
                },
                () => setCopyRefused(true),
              )
            }
          >
            {copied ? FUND.waiting.copied : FUND.waiting.copy}
          </button>
          {copyRefused ? <FieldRefusal id="code-copy-refused">{FUND.waiting.copyRefused}</FieldRefusal> : null}
        </div>
      ) : null}

      {/* Who this is from, said here because this is where a person becomes somebody to the recipient. It is the one
          thing on the card the image did not draw, and at the card's label size it would be under a thumb and under
          the 16 pixels a phone zooms in on. Optional: a gift from nobody is one this product has always made. */}
      <Field
        id="funder-name"
        label={FUND.who.funderLabel}
        value={draft.funderName}
        onChange={(value) => onChange({ ...draft, funderName: value })}
        autoComplete="off"
      />

      <p className={HELP}>{address ? W.signedIn : W.passkeyMakesTheAccount}</p>

      {/* The one sentence that changes what a person does next stays in front of everybody: a link opens the gift
          for whoever opens it first. Everything else only some readers need, and it is one press away (GOV.UK). */}
      <p className="font-medium">{FUND.check.linkRisk(recipient)}</p>
      <details>
        <summary className="cursor-pointer font-medium">{W.whatHappens}</summary>
        {milestone ? (
          <>
            {/* The hour is the reader's own, and the server has no idea which clock that is (D151): it is printed
                once the browser has said, never before, or the page the server sent and the page the browser draws
                say two different hours and React throws the whole thing away and builds it again. */}
            {nowMs === 0 ? null : <p className={BODY}>{MILESTONE_FUND.check.howItWorks(condition?.source ?? "", target, settlingTimeInWords(nowMs))}</p>}
            <p className={BODY}>{MILESTONE_FUND.check.whyCeiling(target)}</p>
          </>
        ) : certificate ? (
          <>
            <p className={BODY}>{certificate.words.mustShow(draft.subject.trim(), target, draft.scale)}</p>
            <p className={BODY}>{certificate.words.ifNot}</p>
          </>
        ) : (
          nowMs === 0 ? null : <p className={BODY}>{FUND.check.missed(settlingTimeInWords(nowMs))}</p>
        )}
        <p className={BODY}>{FUND.check.namesSeen(recipient, funder)}</p>
        <p className={BODY}>{milestone ? MILESTONE_FUND.check.fourteenDays : FUND.check.fourteenDays}</p>
        {cardClosed ? null : (
          <>
            <p className={HELP}>{feeSentence(way)}.</p>
            <p className={HELP}>{CASH_OUT.sourceLine(way.source, way.read)}</p>
          </>
        )}
      </details>
    </Sheet>
  );
}
