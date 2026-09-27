"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "@/src/account/provider";
import { ApiError, getJson, postJson } from "@/src/client/api";
import { useDisplayCurrency } from "@/src/client/display-currency";
import { readAusdBalance } from "@/src/client/onchain";
import { whereTheRailsServe } from "@/src/client/rails";
import { conditionById } from "@/src/conditions";
import { certificateById, milestoneById } from "@/src/milestone-conditions";
import { settlingTimeInWords } from "@/src/pass-schedule";
import { draftToTerms, draftUnits, isComplete, type GiftDraft } from "@/src/gift-draft";
import { serviceChargeDollars, serviceChargeIsCeiling, wayInFor, type WayInOffer } from "@/src/gift-amount";
import { tidyGiftName } from "@/src/gift-names";
import { formatAusd } from "@/src/gift-reader";
import { savePendingGift } from "@/src/pending-gift";
import { rateDateInWords } from "@/src/display-currency";
import type { RailReach } from "@/src/rail-country";
import { feeSentence, wayInFillsIn, wayInPage, WAYS_IN } from "@/src/rails";
import { CASH_OUT, FUND, MILESTONE_FUND, PAY as W } from "@/src/sentences";
import { BODY, CARD_AMOUNT, CARD_LABEL, HELP, INLINE_BUTTON, PRIMARY_BUTTON } from "../../components/ui";
import { AccountPanel } from "../../components/AccountPanel";
import { Field } from "../Field";
import { FieldRefusal } from "../FieldRefusal";
import { HeadCharacter } from "../HeadCharacter";
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

/** A balance as whole cents, rounded down, as the card's amount field takes it: 25.004999 is "25.00". */
function centsDown(units: bigint): string {
  const cents = units / 10_000n;
  return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
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
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyRefused, setCopyRefused] = useState(false);
  // Whether this account is a judge's, credited by the judge code (D295), and whether a code can be used now (D297):
  // asked of the server, false until it says so.
  const [judge, setJudge] = useState(false);
  const [codesOpen, setCodesOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    let live = true;
    getJson<{ open?: boolean; credited?: boolean }>("/api/judge/credit").then(
      (answer) => {
        if (!live) return;
        setJudge(answer.credited === true);
        setCodesOpen(answer.open === true);
      },
      () => {
        if (live) setJudge(false);
      },
    );
    return () => {
      live = false;
    };
  }, [open, address]);
  // The code, asked as a checkout asks one (D297): folded behind a small key, for an account already signed in (the
  // server credits the session's account and no other), the balance read again once the treasury has sent the credit.
  const [codeShown, setCodeShown] = useState(false);
  const [code, setCode] = useState("");
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeProblem, setCodeProblem] = useState<string | null>(null);
  const [codeGiven, setCodeGiven] = useState<bigint | null>(null);
  const [balanceRead, setBalanceRead] = useState(0);
  const redeemCode = async () => {
    setCodeBusy(true);
    setCodeProblem(null);
    try {
      const given = await postJson<{ units: string }>("/api/judge/credit", { code });
      setCodeGiven(BigInt(given.units));
      setJudge(true);
      setBalanceRead((n) => n + 1);
    } catch (error) {
      setCodeProblem(error instanceof ApiError ? error.message : W.code.failed);
    } finally {
      setCodeBusy(false);
    }
  };
  /** The reader's own clock, read once a minute: the hour the settling pass runs is said in it. */
  const nowMs = useSyncExternalStore(everyMinute, thisMinute, noClock);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    // The device's language goes with the call itself; nothing here is an answer from the person.
    whereTheRailsServe()
      .then((answer) => {
        if (live) setRailIn(answer.waysIn);
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
  const offer = wayInFor(short, WAYS_IN, money.rates?.usdPerEur, railIn);
  const way = offer.way;
  const euros = units === undefined || enough ? 0 : offer.euros;
  /** What the service keeps, in dollars: its own published share or minimum at this amount, at the day's rate. */
  const charge = euros === undefined || euros === 0 ? undefined : serviceChargeDollars(euros, way, money.rates?.usdPerEur);
  const chargeLine = charge === undefined ? W.about : euros && serviceChargeIsCeiling(euros, way.fee) ? W.upToDollars(charge) : W.aboutDollars(charge);

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
      <span className={`${BODY} font-medium tabular-nums`}>{value}</span>
    </div>
  );

  return (
    <Sheet
      open={open}
      title={W.title(recipient)}
      beside={<HeadCharacter />}
      onClose={onClose}
      tall
      footer={
        <>
          {/* Only for an account the judge code credited, read from the server's journal (D295). */}
          {enough && judge ? <p className={HELP}>{W.fromJudgeCredit}</p> : null}
          <button type="button" className={PRIMARY_BUTTON} disabled={!ready || busy || status === "busy"} onClick={() => void pay()}>
            {busy ? W.paying : enough ? W.payFromAccount(formatAusd(units ?? 0n)) : euros ? W.payEuros(euros) : W.pay}
          </button>
          {problem ? <FieldRefusal id="pay-refused">{problem}</FieldRefusal> : null}
          {/* The passkey is how an account is made here. When the device cannot, or the person waved the sheet away,
              the panel that creates one or signs an old one in appears in place, rather than on a screen of its own. */}
          {problem && !address ? <AccountPanel /> : null}
        </>
      }
    >
      {line(W.rows.gift(recipient), formatAusd(units ?? 0n))}
      {enough ? line(W.rows.fromAccount, formatAusd(inAccount)) : line(W.rows.service, chargeLine)}
      {line(W.rows.viky, W.nothing)}

      <div className="pt-[var(--space-sm)]">
        <p className={CARD_LABEL}>{enough ? W.rows.fromAccount : W.youPay}</p>
        <p className={`${CARD_AMOUNT} whitespace-nowrap`}>{enough || euros === undefined || euros === 0 ? formatAusd(units ?? 0n) : W.euros(euros)}</p>
      </div>
      {/* The rate, its source and why its day may be a Friday: one line, in full, rather than a label in a corner. */}
      {money.rates && !enough ? <p className={HELP}>{W.atTheRate(rateDateInWords(money.rates.date))}</p> : null}
      {offer.atFloor && !enough && euros ? <p className={HELP}>{W.floor(euros)}</p> : null}
      {/* The first way refused this person, and the sheet says which, why and which this goes through instead (D239). */}
      {offer.insteadOf && !enough ? <p className={HELP}>{insteadSentence(offer)}</p> : null}
      {/* What the partner's page will be, before it opens (D289), said only where it is true: the page arrives filled in. */}
      {/* What the partner's page will ask, just before it opens (D289, D294): filled in with Ramp's key, and without it
          what to choose there and where the code goes, with the code one press away once the account exists. */}
      {!enough ? <p className={BODY}>{wayInFillsIn(way) ? W.partnerFilledIn : W.partnerPaste(way.name, way.delivers.coin, way.delivers.network, way.arrives === "gift")}</p> : null}
      {/* A judge's code (D297): only while credits are open, and the gift is not yet covered. */}
      {codeGiven !== null ? <p className={HELP} role="status">{W.code.given(formatAusd(codeGiven))}</p> : null}
      {codeGiven !== null && !enough && held !== null && held > 0n ? (
        <div className="flex flex-col gap-[var(--space-xs)]">
          <p className={HELP}>{W.code.short(formatAusd(held))}</p>
          <button type="button" className={`${INLINE_BUTTON} self-start`} onClick={() => onChange({ ...draft, dollars: centsDown(held), typedAmount: centsDown(held), typedIn: "USD" })}>
            {W.code.makeIt(formatAusd(BigInt(centsDown(held).replace(".", "")) * 10_000n))}
          </button>
        </div>
      ) : null}
      {!enough && codesOpen && address && codeGiven === null && !judge ? (
        codeShown ? (
          <div className="flex flex-col gap-[var(--space-xs)]">
            <Field id="gift-code" label={W.code.label} value={code} onChange={setCode} autoComplete="off" spellCheck={false} />
            {codeProblem ? <FieldRefusal id="gift-code-refused">{codeProblem}</FieldRefusal> : null}
            <button type="button" className={`${INLINE_BUTTON} self-start`} disabled={codeBusy || code.trim().length === 0} onClick={() => void redeemCode()}>
              {codeBusy ? W.code.using : W.code.use}
            </button>
          </div>
        ) : (
          <button type="button" className={`${INLINE_BUTTON} self-start`} onClick={() => setCodeShown(true)}>
            {W.code.have}
          </button>
        )
      ) : null}
      {!enough && !wayInFillsIn(way) && address ? (
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
            <p className={BODY}>{certificate.words.mustShow(draft.subject.trim(), target)}</p>
            <p className={BODY}>{certificate.words.ifNot}</p>
          </>
        ) : (
          nowMs === 0 ? null : <p className={BODY}>{FUND.check.missed(settlingTimeInWords(nowMs))}</p>
        )}
        <p className={BODY}>{FUND.check.namesSeen(recipient, funder)}</p>
        <p className={BODY}>{milestone ? MILESTONE_FUND.check.fourteenDays : FUND.check.fourteenDays}</p>
        <p className={HELP}>{feeSentence(way)}.</p>
        <p className={HELP}>{CASH_OUT.sourceLine(way.source, way.read)}</p>
      </details>
    </Sheet>
  );
}
