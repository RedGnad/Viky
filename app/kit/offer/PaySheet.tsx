"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMadeHere } from "@/src/account/door";
import { useAccount } from "@/src/account/provider";
import { getJson } from "@/src/client/api";
import { useDisplayCurrency } from "@/src/client/display-currency";
import { loadMyGifts } from "@/src/client/gift";
import { readAusdBalance } from "@/src/client/onchain";
import { whereTheRailsServe } from "@/src/client/rails";
import { conditionById } from "@/src/conditions";
import { certificateById, milestoneById } from "@/src/milestone-conditions";
import { draftToTerms, draftUnits, isComplete, type GiftDraft } from "@/src/gift-draft";
import { serviceChargeEur, serviceChargeIsCeiling, wayInFor } from "@/src/gift-amount";
import { lastNameGiven, tidyGiftName } from "@/src/gift-names";
import { judgeLineIsTrue } from "@/src/judge-line";
import { formatAusd } from "@/src/gift-reader";
import { savePendingGift } from "@/src/pending-gift";
import { cardSum, giftTyped, heldIn, moneyIn, perEuro } from "@/src/pay-sum";
import type { RailReach } from "@/src/rail-country";
import { feeInALine, wayInFillsIn, wayInPage, waysIn, WAY_IN_USDC } from "@/src/rails";
import { frameKeepsSignIn, rampnowFrameOn } from "@/src/rampnow-frame";
import { noteInRampnowJournal } from "@/src/client/rampnow-journal";
import { payAtRampnowBeside } from "@/src/client/rampnow-pending";
import { ACCOUNT_DOOR, FUND, PAY as W, WAITS } from "@/src/sentences";
import { BODY, CARD_AMOUNT, CARD_LABEL, HELP, PRIMARY_BUTTON, SMALL_BUTTON } from "../../components/ui";
import { AccountPanel } from "../../components/AccountPanel";
import { Field } from "../Field";
import { Lines } from "../Lines";
import { heldInGifts } from "../money";
import { CardLine, CardNotOffered } from "./CardTerms";
import { JudgeCode } from "./JudgeCode";
import { FieldRefusal } from "../FieldRefusal";
import { FoldChevron } from "../GiftLive";
import { Sheet } from "../Sheet";
import { ButtonWords, StepInProgress } from "../Waiting";

/**
 * Paying for the gift (the founder's mockup pay-sheet-2026-10-03, validated 3 Oct 2026, which follows pay.html of
 * 19 Sep 2026 and adds the two things a payer needs since: their name, and the account's share).
 *
 * In this order and nothing else in the open: the name, the one thing to fill in; lines that add up, in the one money
 * the gift was typed in (the gift, what the account puts in, the card's fee, what stays, and that Viky takes nothing);
 * the total; one action; one line under it saying who takes the card and its terms. Then one fold for a careful reader,
 * "What happens to my money", and the judge's code, last and folded. The link's warning lives on the link's screen,
 * the rate in the fold, and the passkey's line only where the press makes an account.
 *
 * One way in, chosen for the person (D239, the founder's decision of 25 Sep 2026): the first card service unless it
 * refuses them, by its own answer about their country, its own asset list, or its published floor; then the next, and
 * the fold says which refused, why, and which this goes through instead. On the lines and the button the person pays by
 * card; the service is named under the button, where the card goes to it.
 *
 * With Swapper's id set (the founder, 1 Oct 2026), a third way stands first where it serves the payer: the card is
 * paid inside Viky, with nothing to choose and no code to paste. The press on pay opens it on the screen that waits
 * (`SwapperSheet`, in app/components/PayGift.tsx), not over this sheet. Without the id, nothing here changes.
 *
 * The press on pay makes a first funder's account (the audit of 1 Oct 2026). It used to open a passkey that did not
 * exist yet, which could only fail, and making the account from the panel that followed shut the sheet: Home draws
 * one page for nobody and another for an account. So the press tells Home an account is being made (`onMaking`), Home
 * keeps the page it is drawing, and the terms are kept and the wait opened by this same press. Whether the sheet is
 * open is Home's to know as well, so signing in from it, by its small "Sign in", leaves it open.
 */
export function PaySheet({
  open,
  draft,
  onChange,
  onClose,
  onMaking,
}: Readonly<{ open: boolean; draft: GiftDraft; onChange: (draft: GiftDraft) => void; onClose: () => void; /** A press on pay is making its account, or stopped making it. */ onMaking: (making: boolean) => void }>) {
  const { address, hasCredential, ensureAccount, status } = useAccount();
  const madeHere = useMadeHere();
  const router = useRouter();
  const money = useDisplayCurrency(address);
  const [held, setHeld] = useState<bigint | null>(null);
  /**
   * What the person's gifts have already paid them and still hold (D208). It is theirs to pay with, as Home counts it
   * (the founder, 4 Oct 2026): somebody who had earned $10 read $10 on Home and "Pay by card" here for a $5 gift. The
   * screen that makes the gift takes it into the account first, by the way out's own gesture (src/client/gift.ts).
   */
  const [inGifts, setInGifts] = useState(0n);
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

  // The name this account gave on its last gift, put in an empty field once per opening (the founder, 3 Oct 2026). Read
  // through refs, so a name typed while the list was being read is never written over.
  const latest = useRef({ draft, onChange });
  useEffect(() => {
    latest.current = { draft, onChange };
  });
  const named = useRef(false);
  useEffect(() => {
    if (!open) named.current = false;
    if (!open || !address || named.current) return;
    named.current = true;
    let live = true;
    loadMyGifts().then(
      ({ gifts }) => {
        if (!live) return;
        // The same reading says what those gifts hold for this account.
        setInGifts(heldInGifts(gifts));
        const last = lastNameGiven(gifts);
        const now = latest.current;
        if (last && now.draft.funderName.trim() === "") now.onChange({ ...now.draft, funderName: last });
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [open, address]);

  const units = draftUnits(draft);
  const condition = conditionById(draft.conditionId);
  const recipient = tidyGiftName(draft.recipientName);
  const milestone = milestoneById(draft.conditionId);
  const certificate = certificateById(draft.conditionId);
  const ready = isComplete(draft) && units !== undefined && condition !== undefined;
  // "From your Viky money": the account and what the person's gifts hold for them, one figure.
  const inAccount = (held ?? 0n) + inGifts;
  const enough = units !== undefined && inAccount >= units;
  const short = units === undefined ? 0n : units - inAccount;
  const offer = wayInFor(short, waysIn(), money.rates?.usdPerEur, railIn);
  const way = offer.way;
  /** Paying by card is not offered in the payer's country (the founder, 29 Sep 2026): the account is the way left. */
  const cardClosed = card?.offered === false;
  const byCard = !enough && !cardClosed;
  const euros = units === undefined || !byCard ? 0 : offer.euros;
  // One money on the whole sheet, the one the gift was typed in (the mockup of 3 Oct 2026); dollars when no rate is read.
  const code = money.rates && perEuro(money.currency, money.rates) !== undefined ? money.currency : "USD";
  const say = (amount: number) => moneyIn(amount, code);
  const gift = units === undefined ? undefined : giftTyped({ typedAmount: draft.typedAmount, typedIn: draft.typedIn, units, code, rates: money.rates });
  // The card pays whole euros and the account the rest, so the lines add up to the card's figure (src/pay-sum.ts).
  const sum = byCard && euros && gift !== undefined ? cardSum({ code, gift, cardEuros: euros, feeEuros: serviceChargeEur(euros, way.fee), rates: money.rates }) : undefined;
  const feeCeiling = Boolean(euros) && serviceChargeIsCeiling(euros ?? 0, way.fee);
  const heldRead = heldIn(inAccount, code, money.rates);
  const giftRead = gift === undefined ? formatAusd(units ?? 0n) : say(gift);

  /**
   * The passkey makes the account at the moment pay is pressed, which is what the sheet says it will do: a new one on
   * a device that remembers none, the remembered one otherwise (`ensureAccount`). After that the terms are written to
   * the device, the service's page opens inside the same press, and the wait takes over.
   */
  const pay = async () => {
    if (!ready || units === undefined) return;
    setProblem(null);
    setBusy(true);
    if (!address) onMaking(true);
    try {
      const account = address ?? (await ensureAccount()).address;
      // What this sheet said the gift is, in its one money, is what every screen after it says (src/pay-sum.ts): it
      // is kept with the gift, on the card and with the payment started.
      const said: GiftDraft = gift === undefined ? draft : { ...draft, typedAmount: String(gift), typedIn: code };
      onChange(said);
      savePendingGift({ ...draftToTerms(said, account), wayIn: way.name });
      // A card paid inside Viky opens on the wait, in a sheet of its own, by this same press.
      if (!enough && way.embedded) return router.push("/fund?step=paying&card=1");
      // Rampnow in a frame of our own, when it is switched on (src/rampnow-frame.ts): opened on the wait, by this press.
      if (!enough && way === WAY_IN_USDC && rampnowFrameOn()) {
        if (frameKeepsSignIn(navigator.userAgent)) return router.push("/fund?step=paying&rampnow=1");
        // Where the frame cannot keep the person signed in at Rampnow, they never see it (the founder, 4 Oct 2026):
        // its page opens beside by this same press, and the payment is followed as one started from a tab. A tab the
        // browser refused leaves nothing waited for: the wait then offers the page by a link of its own.
        const beside = payAtRampnowBeside(account, wayInPage(way, { account, euros }));
        noteInRampnowJournal(beside ? "Viky: the pay press opened the card page beside" : "Viky: the browser refused the card page beside the pay press", { carried: { browser: navigator.userAgent } });
        return router.push("/fund?step=paying");
      }
      // The partner's page opens in this press only when it arrives filled in (D289). Otherwise the person has not seen
      // their code yet, a first funder has only just made it: the waiting screen shows it, with its copy, and opens the
      // page when they press (D296).
      if (!enough && wayInFillsIn(way)) {
        window.open(wayInPage(way, { account, euros }), "_blank", "noopener,noreferrer");
        router.push("/fund?step=paying&opened=1");
      } else router.push("/fund?step=paying");
      // Still busy on purpose: the sheet stands as it is until the wait has replaced the page.
    } catch {
      onMaking(false);
      setProblem(W.notMade);
      setBusy(false);
    }
  };

  /**
   * How a funder pays by card here, for the line a judge reads above "Put … in their name": the same test the pay press
   * makes. Read when the line is drawn, which is in a browser.
   */
  const cardPaidHow = (): "frame" | "sheet" | "tab" => (way.embedded ? "sheet" : way === WAY_IN_USDC && rampnowFrameOn() && frameKeepsSignIn(navigator.userAgent) ? "frame" : "tab");

  /** Somebody whose account was made on another device: their passkey is asked for, and none is made. The sheet stays. */
  const signInFirst = async () => {
    setProblem(null);
    try {
      await ensureAccount({ existing: true });
    } catch {
      setProblem(W.notMade);
    }
  };

  const line = (label: string, value: string) => (
    <div className="flex items-baseline justify-between gap-[var(--space-md)] border-b border-[var(--divider)] py-[var(--space-sm)] last:border-b-0">
      <span className={`${BODY} text-[var(--on-surface-body)]`}>{label}</span>
      {/* A figure is read whole: the label wraps, never the amount ("about F CFA 646" split in two, 29 Sep 2026). */}
      <span className={`${BODY} whitespace-nowrap font-medium tabular-nums`}>{value}</span>
    </div>
  );
  /** What the account puts in, said as the part taken from the gift: "\u2212 €8.24". */
  const less = (amount: number) => `\u2212\u2009${say(amount)}`;
  // The figure the sheet adds up to, and the action that pays it: the card's, the account's, or none to show.
  const total = enough ? { label: W.rows.fromAccount, amount: giftRead } : sum ? { label: W.youPay, amount: say(sum.card) } : undefined;

  return (
    <Sheet open={open} title={W.title(recipient)} onClose={onClose} tall>
      {/* The one thing to fill in, so it comes first (the mockup of 3 Oct 2026). Optional: empty, the gift is from
          nobody, which this product has always made, and no sentence breaks. */}
      <Field
        id="funder-name"
        label={W.nameLabel(recipient)}
        placeholder={W.namePlaceholder}
        value={draft.funderName}
        onChange={(value) => onChange({ ...draft, funderName: value })}
        autoComplete="off"
      />

      {/* Lines that add up (src/pay-sum.ts): the gift, less what the account puts in, plus the card's fee, plus what stays. */}
      <div data-pay-lines="">
        {line(W.rows.gift(recipient), giftRead)}
        {enough ? null : cardClosed ? (
          heldRead !== undefined && inAccount > 0n ? line(W.rows.fromAccount, less(heldRead)) : null
        ) : sum ? (
          <>
            {sum.fromAccount > 0 ? line(W.rows.fromAccount, less(sum.fromAccount)) : null}
            {line(W.rows.fee, feeCeiling ? W.upTo(say(sum.fee)) : say(sum.fee))}
            {sum.stays > 0 ? line(W.rows.stays, say(sum.stays)) : null}
          </>
        ) : null}
        {line(W.rows.viky, W.nothing)}
      </div>

      {total ? (
        <div>
          <p className={CARD_LABEL}>{total.label}</p>
          <p className={`${CARD_AMOUNT} whitespace-nowrap tabular-nums`} data-pay-total="">
            {total.amount}
          </p>
        </div>
      ) : null}

      {/* Only when the gift is paid from a balance no larger than the judge credit, with nothing gone out of the
          account since it arrived (D295): the balance is then the credit alone. */}
      {judgeLineIsTrue({ gift: units, held, untouchedCredit }) ? <p className={HELP}>{W.fromJudgeCredit(cardPaidHow(), way.name)}</p> : null}
      {!enough && cardClosed ? (
        <CardNotOffered country={card?.country ?? null} whole />
      ) : (
        <>
          <button type="button" className={PRIMARY_BUTTON} disabled={!ready || busy || status === "busy"} onClick={() => void pay()}>
            <ButtonWords busy={busy} doing={W.paying}>
              {enough ? W.payFromAccount(giftRead, recipient) : sum ? W.payByCard(say(sum.card)) : W.pay}
            </ButtonWords>
          </button>
          <StepInProgress busy={busy} step={WAITS.account} />
          {/* One line: who takes the card, its ID the first time, and its terms (the mockup of 3 Oct 2026). */}
          {byCard ? <CardLine way={way} /> : null}
        </>
      )}
      {/* What the press does where it makes something: an account, the first time. Signed in, the phone's own prompt
          says it, and the sheet says nothing more. */}
      {address || hasCredential ? null : <p className={HELP}>{madeHere ? W.passkeyMakesTheAccount : ACCOUNT_DOOR.madeOnTheMainSite}</p>}
      {/* The press makes an account: 18 or older, as wherever one is made. The card's own line says it when a card pays. */}
      {address || hasCredential || !madeHere || byCard ? null : (
        <p className={HELP} data-adult="">
          {ACCOUNT_DOOR.adult}
        </p>
      )}
      {/* A passkey kept by another device is not known to this one, and pay would make a second account (1 Oct 2026). */}
      {!address && !hasCredential ? (
        <button type="button" className={`${SMALL_BUTTON} self-start`} disabled={busy || status === "busy"} onClick={() => void signInFirst()}>
          {W.alreadyHaveAccount}
        </button>
      ) : null}
      {problem ? <FieldRefusal id="pay-refused">{problem}</FieldRefusal> : null}
      {/* The passkey is how an account is made here. When the device cannot, or the person waved the sheet away,
          the panel that creates one or signs an old one in appears in place, rather than on a screen of its own. */}
      {problem && !address ? <AccountPanel /> : null}
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
            className={`${SMALL_BUTTON} self-start`}
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

      {/* One fold, and in it short lines, a label and its value, never a paragraph and four at most (the founder,
          4 Oct 2026): what comes back and when, and the card's fee. It held up to eight sentences. What it no longer
          says is said where it serves: the line under the button says who takes the card and its ID, and the screen
          of the link says whom to send it to. */}
      <details className="said-fold" data-what-happens="">
        <summary className="said-fold-name">
          {W.whatHappens}
          <FoldChevron />
        </summary>
        <div className="said-fold-body">
          <Lines quiet rows={[milestone ? W.fold.notReached : certificate ? W.fold.notShown : W.fold.missedDay, W.fold.notOpened, ...(byCard ? [[W.rows.fee, feeInALine(way, euros)] as const] : [])]} />
        </div>
      </details>

      {/* A judge's code (D297): only while credits are open and the gift is not yet covered, last and folded, so a
          payer is not told they should have one (the mockup of 3 Oct 2026). */}
      {address ? (
        <JudgeCode
          folded
          needed={units ?? null}
          held={held}
          onCredited={() => setBalanceRead((n) => n + 1)}
          onMakeIt={(dollars) => onChange({ ...draft, dollars, typedAmount: dollars, typedIn: "USD" })}
        />
      ) : null}
    </Sheet>
  );
}
