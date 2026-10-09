"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMadeHere, useOnAComputer } from "@/src/account/door";
import { useAccount } from "@/src/account/provider";
import { getJson } from "@/src/client/api";
import { forgetJudgeCodeFromTheLink, judgeCodeFromTheLink } from "@/src/client/judge-link";
import { useDisplayCurrency } from "@/src/client/display-currency";
import { readHeldForPaying } from "@/src/client/pay-held";
import { whereTheRailsServe } from "@/src/client/rails";
import { conditionById } from "@/src/conditions";
import { certificateById, milestoneById } from "@/src/milestone-conditions";
import { draftToTerms, draftUnits, isComplete, type GiftDraft } from "@/src/gift-draft";
import { serviceChargeEur, serviceChargeIsCeiling, wayInFor } from "@/src/gift-amount";
import { lastNameGiven, tidyGiftName } from "@/src/gift-names";
import { judgeLineIsTrue } from "@/src/judge-line";
import { formatAusd } from "@/src/gift-reader";
import { savePendingGift } from "@/src/pending-gift";
import { heldForTheLines, payWith, type HeldReading } from "@/src/pay-held";
import { cardSum, giftTyped, heldIn, moneyIn, perEuro } from "@/src/pay-sum";
import type { RailReach } from "@/src/rail-country";
import { feeInALine, wayInFillsIn, wayInPage, waysIn, WAY_IN_USDC } from "@/src/rails";
import { frameKeepsSignIn, rampnowFrameOn } from "@/src/rampnow-frame";
import { noteInRampnowJournal } from "@/src/client/rampnow-journal";
import { payAtRampnowBeside } from "@/src/client/rampnow-pending";
import { ACCOUNT_DOOR, FUND, PAY as W, WAITS } from "@/src/sentences";
import { BODY, CARD_AMOUNT, CARD_LABEL, HELP, SMALL_BUTTON } from "../../components/ui";
import { Button } from "../Button";
import { AccountPanel } from "../../components/AccountPanel";
import { Field } from "../Field";
import { Lines } from "../Lines";
import { CardLine, CardNotOffered } from "./CardTerms";
import { JudgeCode } from "./JudgeCode";
import { FieldRefusal } from "../FieldRefusal";
import { FoldChevron } from "../GiftLive";
import { Sheet } from "../Sheet";
import { WaitLine } from "../Waiting";

/**
 * Paying for the gift (the founder's mockup pay-sheet-2026-10-03, validated 3 Oct 2026, which follows pay.html of
 * 19 Sep 2026 and adds the two things a payer needs since: their name, and the account's share).
 *
 * In this order and nothing else in the open: the name, the one thing to fill in; lines that add up, in the one money
 * the gift was typed in (the gift, what the account puts in, the card's fee, what stays, and that Viky takes nothing);
 * the total; one action; one line under it saying who takes the card and its terms. Then one fold for a careful reader,
 * "What happens to my money". The link's warning lives on the link's screen, the rate in the fold, and the passkey's
 * line only where the press makes an account.
 *
 * Three cases, and one of them drawn (the founder, 9 Oct 2026). The account can pay: one button. It cannot, and there
 * is a code, the judges' path: the code's field stands open in place of the card, with what the link carried already
 * in it, and "Use the code" is the one action; it makes the account of somebody who has none, and once the credit is
 * in, the button pays with it, with no card, no fee and no smallest payment. It cannot, and there is no code: the
 * card, with a small "Have a code?" under its button, which opens the code's field in the card's place.
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
  const computer = useOnAComputer();
  const router = useRouter();
  const money = useDisplayCurrency(address);
  /**
   * What the account can pay with, as Home counts it (src/pay-held.ts; the founder, 4 and 5 Oct 2026): both dollar
   * coins, what the person's gifts have already paid them (D208), and the chain's own coin at the exchange's quote.
   * Not known until it has been read, and said as unread when the reading failed: it used to count as nothing in both
   * cases, and somebody who had the money read "Pay … by card" on a button that led there.
   */
  const [held, setHeld] = useState<HeldReading>({ state: "reading" });
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
  // Whether a code can be used now, and whether this account has had its credit: the server's answer, null before it.
  const [credits, setCredits] = useState<Readonly<{ open: boolean; credited: boolean }> | null>(null);
  /**
   * The code in the card's place (9 Oct 2026). A link that carried a code opens the sheet on it: read while the sheet
   * is open, which is in a browser and after the page arrived, so the sheet's first image is already the code's. The
   * person's own press outranks it: the small key under the card's button, or "Pay without a code".
   */
  const linkCode = open ? judgeCodeFromTheLink() : "";
  const [codeChosen, setCodeChosen] = useState<boolean | null>(null);
  const codeWay = codeChosen ?? linkCode !== "";
  /** The code gave its credit on this sheet: its two lines stay, above the button that now pays with it. */
  const [codeGiven, setCodeGiven] = useState(false);
  /** The code's press made the account, and told Home so: taken back when the sheet closes without paying. */
  const madeForTheCode = useRef(false);
  useEffect(() => {
    if (!open) return;
    let live = true;
    getJson<{ open?: boolean; credited?: boolean; untouchedCredit?: string | null }>("/api/judge/credit").then(
      (answer) => {
        if (!live) return;
        setCredits({ open: answer.open === true, credited: answer.credited === true });
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

  // The name this account gave on its last gift, put in an empty field once per opening (the founder, 3 Oct 2026). Read
  // through refs, so a name typed while the list was being read is never written over.
  const latest = useRef({ draft, onChange });
  useEffect(() => {
    latest.current = { draft, onChange };
  });
  const named = useRef(false);
  useEffect(() => {
    if (!open) named.current = false;
    if (!open || !address) return;
    let live = true;
    void Promise.resolve()
      .then(() => {
        // A reading asked again after one that failed is a wait again. One that follows a reading that answered, a
        // judge's credit just given, keeps what was read on the screen until the new answer lands.
        if (live) setHeld((was) => (was.state === "read" ? was : { state: "reading" }));
        return readHeldForPaying(address);
      })
      .then(({ parts, gifts }) => {
        if (!live) return;
        setHeld({ state: "read", parts });
        // The same reading says what name this account gave last.
        if (named.current) return;
        named.current = true;
        const last = lastNameGiven(gifts);
        const now = latest.current;
        if (last && now.draft.funderName.trim() === "") now.onChange({ ...now.draft, funderName: last });
      })
      .catch(() => {
        if (live) setHeld({ state: "unread" });
      });
    return () => {
      live = false;
    };
  }, [open, address, balanceRead]);

  const units = draftUnits(draft);
  const condition = conditionById(draft.conditionId);
  const recipient = tidyGiftName(draft.recipientName);
  const milestone = milestoneById(draft.conditionId);
  const certificate = certificateById(draft.conditionId);
  const ready = isComplete(draft) && units !== undefined && condition !== undefined;
  // What pays: the account, the card, or nothing that can be named while the account is unread (src/pay-held.ts).
  const pays = payWith({ signedIn: Boolean(address), held, wanted: units });
  const settled = pays === "account" || pays === "card";
  // "From your Viky money": everything the account can pay with, one figure, the one Home says.
  const inAccount = heldForTheLines(Boolean(address), held);
  const enough = pays === "account";
  const short = units === undefined || units <= inAccount ? 0n : units - inAccount;
  const offer = wayInFor(short, waysIn(), money.rates?.usdPerEur, railIn);
  const way = offer.way;
  /** Paying by card is not offered in the payer's country (the founder, 29 Sep 2026): the account is the way left. */
  const cardClosed = card?.offered === false;
  // Whether a code can be used: credits are open, and this account, or nobody yet, has not had one. Not known until
  // the server has said.
  const codeOffered = credits === null ? null : credits.open && !credits.credited;
  // The second case: the code stands in the card's place while the account cannot pay. Whatever the account is found
  // to hold while the code is being used, the sheet stays on the code until its credit is in. A code the link carried
  // is shown before the server has said, so the sheet does not open on a card and change its mind.
  const onTheCode = codeWay && codeOffered !== false && !codeGiven && !enough;
  // The credit was given a moment ago and the account, read before it, is being read again: no card is named meanwhile.
  const creditArriving = codeGiven && pays === "card";
  // The card pays, and is drawn, only outside the code's case: no card figure, fee or line stands beside a code.
  const byCard = pays === "card" && !cardClosed && !onTheCode && !creditArriving;
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
  // The gift is paid from a balance no larger than the judge credit, with nothing gone out of the account since it
  // arrived (D295): the balance is then the credit alone, and the sheet may say the credit pays.
  const paidFromCredit = judgeLineIsTrue({ gift: units, held: held.state === "read" ? held.parts.ausd : null, untouchedCredit });

  /**
   * The passkey makes the account at the moment pay is pressed, which is what the sheet says it will do: a new one on
   * a device that remembers none, the remembered one otherwise (`ensureAccount`). After that the terms are written to
   * the device, the service's page opens inside the same press, and the wait takes over.
   */
  const pay = async () => {
    // Nothing leaves while what the account holds is not known: the press would choose the card for it.
    if (!ready || units === undefined || !settled) return;
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

  /**
   * The account of somebody who uses a code and has none: made by that press, as pay makes it. Home is told, so it
   * keeps the page it is drawing under the sheet, and the sheet stays as it is for the press that pays with the credit.
   */
  const accountForTheCode = async (): Promise<boolean> => {
    if (address) return true;
    setProblem(null);
    madeForTheCode.current = true;
    onMaking(true);
    try {
      await ensureAccount();
      return true;
    } catch {
      madeForTheCode.current = false;
      onMaking(false);
      setProblem(W.notMade);
      return false;
    }
  };

  /** Closed without paying, after the code's press made the account: Home draws the page of that account again. */
  const close = () => {
    if (madeForTheCode.current) {
      madeForTheCode.current = false;
      onMaking(false);
    }
    // The next opening starts from what is true then: the link's code if it was not used, the account as it is read.
    setCodeChosen(null);
    setCodeGiven(false);
    onClose();
  };

  // A credit the account's reading does not show yet is read for again, until it does.
  useEffect(() => {
    if (!creditArriving) return;
    const again = setTimeout(() => setBalanceRead((n) => n + 1), 3000);
    return () => clearTimeout(again);
  }, [creditArriving, balanceRead]);

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
    <Sheet open={open} title={W.title(recipient)} onClose={close} tall>
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
        {/* On the code, the gift and what Viky takes, and nothing of an account's part or a card's. */}
        {onTheCode || creditArriving ? null : (
          <>
            {pays !== "card" ? null : cardClosed ? (
              heldRead !== undefined && inAccount > 0n ? line(W.rows.fromAccount, less(heldRead)) : null
            ) : sum ? (
              <>
                {sum.fromAccount > 0 ? line(W.rows.fromAccount, less(sum.fromAccount)) : null}
                {line(W.rows.fee, feeCeiling ? W.upTo(say(sum.fee)) : say(sum.fee))}
                {sum.stays > 0 ? line(W.rows.stays, say(sum.stays)) : null}
              </>
            ) : null}
          </>
        )}
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

      {/* The code, first where the account cannot pay (9 Oct 2026): its field and its button in the card's place. Once
          it has given its credit, its two lines stay here, above the button that pays with it. Kept in this one place
          from the press to the credit, so nothing it holds is lost while the account is made and read. */}
      {codeWay || codeGiven ? (
        <JudgeCode
          first
          offered={onTheCode}
          startWith={linkCode}
          before={accountForTheCode}
          needed={units ?? null}
          held={held.state === "read" ? inAccount : null}
          onCredited={() => {
            setCodeGiven(true);
            forgetJudgeCodeFromTheLink();
            setBalanceRead((n) => n + 1);
          }}
          onMakeIt={(dollars) => onChange({ ...draft, dollars, typedAmount: dollars, typedIn: "USD" })}
        />
      ) : null}
      {/* Only when the credit is all the account holds (D295, `paidFromCredit`). */}
      {paidFromCredit ? <p className={HELP}>{W.fromJudgeCredit(cardPaidHow(), way.name)}</p> : null}
      {onTheCode ? (
        // A small key and not a second action: back to whatever pays without a code, a card or money sent to the account.
        <button type="button" className={`${SMALL_BUTTON} self-start`} onClick={() => setCodeChosen(false)} data-without-a-code="">
          {W.code.without}
        </button>
      ) : creditArriving ? (
        <WaitLine>{W.readingAccount}</WaitLine>
      ) : (
        <>
          {pays === "card" && cardClosed ? (
            <CardNotOffered country={card?.country ?? null} whole />
          ) : (
            <>
              {/* While what the account holds is not known, the button names no way to pay and does not go (the
                  founder, 5 Oct 2026): it said "by card" to somebody who had the money, and a press led there. */}
              <Button waiting={!ready || !settled || status === "busy"} doing={busy ? W.paying : null} step={WAITS.account} onPress={() => void pay()} data-pays={pays}>
                {enough ? (paidFromCredit ? W.code.payWithCredit(giftRead) : W.payFromAccount(giftRead, recipient)) : sum ? W.payByCard(say(sum.card)) : W.pay}
              </Button>
              {pays === "reading" ? <WaitLine>{W.readingAccount}</WaitLine> : null}
              {/* A reading that failed is said, with what reads it again. Never the card in its place. */}
              {pays === "unread" ? (
                <>
                  <FieldRefusal id="account-unread">{W.accountUnread}</FieldRefusal>
                  <button type="button" className={`${SMALL_BUTTON} self-start`} onClick={() => setBalanceRead((n) => n + 1)}>
                    {W.readAgain}
                  </button>
                </>
              ) : null}
              {/* One line: who takes the card, its ID the first time, and its terms (the mockup of 3 Oct 2026). */}
              {byCard ? <CardLine way={way} /> : null}
            </>
          )}
        </>
      )}
      {/* Under the card's button, or the sentence that stands for it: the small key that opens the code in its place. */}
      {pays === "card" && codeOffered === true && !codeWay && !creditArriving ? (
        <button type="button" className={`${SMALL_BUTTON} self-start`} onClick={() => setCodeChosen(true)} data-have-a-code="">
          {W.code.have}
        </button>
      ) : null}
      {/* What the press does where it makes something: an account, the first time. Signed in, the phone's own prompt
          says it, and the sheet says nothing more. */}
      {address || hasCredential ? null : <p className={HELP}>{madeHere ? (onTheCode ? W.passkeyMakesTheAccountOnTheCode : W.passkeyMakesTheAccount) : ACCOUNT_DOOR.madeOnTheMainSite}</p>}
      {/* On a computer, which choice of the system's sheet follows the person, before the press that makes the account. */}
      {address || hasCredential || !madeHere || !computer ? null : (
        <p className={HELP} data-on-a-computer="">
          {ACCOUNT_DOOR.onAComputer}
        </p>
      )}
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
      {!onTheCode && !creditArriving && pays === "card" && cardClosed && !address ? <AccountPanel /> : null}
      {/* No code where the card is paid inside Viky: that sheet is already told whose account it is. */}
      {!onTheCode && !creditArriving && pays === "card" && (cardClosed || (!wayInFillsIn(way) && !way.embedded)) && address ? (
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
    </Sheet>
  );
}
