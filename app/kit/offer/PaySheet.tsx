"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "@/src/account/provider";
import { useDisplayCurrency } from "@/src/client/display-currency";
import { readAusdBalance } from "@/src/client/onchain";
import { whereTheRailsServe } from "@/src/client/rails";
import { conditionById } from "@/src/conditions";
import { certificateById, milestoneById } from "@/src/milestone-conditions";
import { settlingTimeInWords } from "@/src/pass-schedule";
import { draftToTerms, draftUnits, isComplete, type GiftDraft } from "@/src/gift-draft";
import { arrivesInDollars, waysInFor } from "@/src/gift-amount";
import { tidyGiftName } from "@/src/gift-names";
import { formatAusd } from "@/src/gift-reader";
import { savePendingGift } from "@/src/pending-gift";
import { rateDateInWords } from "@/src/display-currency";
import type { RailReach } from "@/src/rail-country";
import { feeSentence, WAYS_IN, type WayIn } from "@/src/rails";
import { CASH_OUT, FUND, MILESTONE_FUND, PAY as W } from "@/src/sentences";
import { BODY, CARD_AMOUNT, CARD_LABEL, HELP, PRIMARY_BUTTON, SECONDARY_BUTTON } from "../../components/ui";
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
 * What it does not do: ask for an account first, ask them to choose between two card services in front of the
 * action, or read anything back that the card above it already says. The second way in is under the action, because
 * D101 says neither is hidden, and the mockup asks for one action rather than two cards of figures.
 *
 * Which way in is in front of the action is decided by what it costs for this gift (D125): a way whose published
 * floor is above what the gift needs is not offered for it, and of the ways left the one that asks the fewest euros
 * goes first. A country only ever sends a way to the back (D96). No company is named on the sheet's lines or its
 * buttons: the person is paying by card, and the service is named where it is met, on the page that opens.
 */
function everyMinute(changed: () => void): () => void {
  const timer = setInterval(changed, 60_000);
  return () => clearInterval(timer);
}
const thisMinute = () => Math.floor(Date.now() / 60_000) * 60_000;
const noClock = () => 0;

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
  const [chosen, setChosen] = useState<WayIn | null>(null);
  const [busy, setBusy] = useState(false);
  /** The reader's own clock, read once a minute: the hour the settling pass runs is said in it. */
  const nowMs = useSyncExternalStore(everyMinute, thisMinute, noClock);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    whereTheRailsServe(typeof navigator === "undefined" ? undefined : navigator.language)
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
  }, [open, address]);

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
  const offers = waysInFor(short, WAYS_IN, money.rates?.usdPerEur, railIn);
  // The one the person asked for, while this gift can still be paid on it; otherwise the one that costs the least.
  const offer = (chosen && offers.find((entry) => entry.way.name === chosen.name)) ?? offers[0];
  const way = offer.way;
  const other = offers.find((entry) => entry.way.name !== way.name)?.way;
  const euros = units === undefined || enough ? 0 : offer.euros;
  const arrives = euros === undefined || euros === 0 ? undefined : arrivesInDollars(euros, way, money.rates?.usdPerEur);
  /** What the service keeps, in dollars: what the euros are worth, less what lands in the account. */
  const charge =
    euros === undefined || euros === 0 || arrives === undefined || money.rates?.usdPerEur === undefined
      ? undefined
      : Math.max(0, euros * money.rates.usdPerEur - arrives);

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
      if (!enough) window.open(way.page, "_blank", "noopener,noreferrer");
      router.push("/fund?step=paying");
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
          <button type="button" className={PRIMARY_BUTTON} disabled={!ready || busy || status === "busy"} onClick={() => void pay()}>
            {busy ? W.paying : enough ? W.payFromAccount(formatAusd(units ?? 0n)) : euros ? W.payEuros(euros) : W.pay}
          </button>
          {problem ? <FieldRefusal id="pay-refused">{problem}</FieldRefusal> : null}
          {/* The passkey is how an account is made here. When the device cannot, or the person waved the sheet away,
              the panel that creates one or signs an old one in appears in place, rather than on a screen of its own. */}
          {problem && !address ? <AccountPanel /> : null}
          {/* The other way in is never hidden (D101); it is simply not in front of the action. */}
          {other && !enough ? (
            <button type="button" className={SECONDARY_BUTTON} onClick={() => setChosen(other)}>
              {W.another}
            </button>
          ) : null}
        </>
      }
    >
      {line(W.rows.gift(recipient), formatAusd(units ?? 0n))}
      {enough ? line(W.rows.fromAccount, formatAusd(inAccount)) : line(W.rows.service, charge === undefined ? W.about : W.aboutDollars(charge))}
      {line(W.rows.viky, W.nothing)}

      <div className="pt-[var(--space-sm)]">
        <p className={CARD_LABEL}>{enough ? W.rows.fromAccount : W.youPay}</p>
        <p className={`${CARD_AMOUNT} whitespace-nowrap`}>{enough || euros === undefined || euros === 0 ? formatAusd(units ?? 0n) : W.euros(euros)}</p>
      </div>
      {/* The rate, its source and why its day may be a Friday: one line, in full, rather than a label in a corner. */}
      {money.rates && !enough ? <p className={HELP}>{W.atTheRate(rateDateInWords(money.rates.date))}</p> : null}
      {offer.atFloor && !enough && euros ? <p className={HELP}>{W.floor(euros)}</p> : null}

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
