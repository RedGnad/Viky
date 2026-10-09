"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import * as mera from "@/src/account/mera";
import { useAccount } from "@/src/account/provider";
import { useDisplayCurrency } from "@/src/client/display-currency";
import { currencyOf } from "@/src/currencies";
import { PRODUCT_LOCALE } from "@/src/moments";
import { CATALOGUE, HOME as H, ME as W } from "@/src/sentences";
import { AMOUNT_IN_TITLE, CARD, CARD_LABEL, HELP, SECONDARY_BUTTON } from "../components/ui";
import { useReaderZone } from "@/src/client/reader-zone";
import { conditionOfGoal } from "@/src/conditions";
import { CONSENT } from "@/src/sentences";
import { WhatVikyReads, type ReadForYou } from "./Consent";
import { CurrencySheet } from "./CurrencySheet";
import { milestoneBy } from "./GiftCard";
import { HeadCharacter } from "./HeadCharacter";
import { FoldChevron } from "./GiftLive";
import { InstallAct } from "./Install";
import { MoneyKey } from "./MoneyKey";
import { Act, RoundControls } from "./RoundControls";
import { holdsAnything, useHoldings, useMoneyHeld } from "./money";
import { useMyGifts } from "./my-gifts";
import { KeyKeptLine } from "./KeyKept";
import { SignInDoor } from "./SignInDoor";
import { SpendOrWithdraw } from "./SpendOrWithdraw";
import { Shell } from "./Shell";
import { WhereYouLive } from "./WhereYouLive";

/**
 * Me, in the order the structure gives it (section 4): the display currency, the session in one sentence and sign out,
 * installing Viky, then, folded, the account's code for a payout service, then Help, What Viky can check, Privacy,
 * Legal notice, For judges as text links. The countdown is gone: the session is one sentence.
 *
 * Two sentences, one session each (D98). "Signed in on this device." is what a page load leaves: the account is here
 * for twelve hours and the key that signs is not, so nothing is promised about signing. "Signed in on this device
 * until 14:20." is said only while that signing session is actually open, and it names how long money can move
 * without asking again.
 *
 * The appearance control is back, in the header of every screen rather than here (D97). Without an account, this page
 * carries the same one door as the page without an account, and nothing else to do.
 */
export function Me() {
  // Named without "use" here: it is called from a press, and a name that starts so is read as a hook.
  const { address: signedIn, reach, leave, useAnotherAccount: toAnotherAccount } = useAccount();
  /**
   * Set while the session closes, by "Sign out" or by "Other account": the page stays as it is, and the key says what
   * is happening (D258). Which of the two was pressed, so that key alone shows the wheel.
   */
  const [leaving, setLeaving] = useState<"out" | "other" | null>(null);
  /**
   * The account this page was drawn for, kept while the session closes: the page for nobody ("You, not signed in on
   * this device") showed for a moment between the press and the landing, and "Other account" left the person on it
   * (the founder, 4 Oct 2026). Both lead straight to the account's door, and this page is never drawn for nobody on
   * the way.
   */
  const [drawnFor, setDrawnFor] = useState(signedIn);
  if (signedIn && signedIn !== drawnFor) setDrawnFor(signedIn);
  const address = signedIn ?? (leaving ? drawnFor : undefined);
  /** What every screen reads in, and the list it may be changed from, both from one place (D152). */
  const money = useDisplayCurrency(address);
  const holdings = useHoldings(address);
  const { gifts, problem: giftsUnread } = useMyGifts(address);
  /** Home's own figure (app/kit/money.ts): everything that is the person's and that they can take out now. */
  const held = useMoneyHeld(holdings, gifts, giftsUnread !== null);
  const figure = held === undefined ? undefined : money.figure(held);
  const [reading, setReading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [until, setUntil] = useState<string | null>(null);
  const [copied, setCopied] = useState<"no" | "yes" | "refused">("no");
  const zone = useReaderZone();
  /** The gifts this account is the person of, still running: what Viky reads for them, each with its stop. */
  const readForYou: ReadForYou[] = (gifts ?? []).flatMap((gift) => {
    if (gift.role !== "recipient" || !gift.opened || gift.finished || gift.cancelled) return [];
    const conditionId = gift.milestone?.conditionId ?? conditionOfGoal(gift.goalType)?.id ?? "";
    const funder = gift.funderName ?? CONSENT.theFunder;
    const status = gift.milestone;
    return [
      {
        giftId: gift.giftId,
        conditionId,
        funderName: gift.funderName,
        cost: status
          ? { kind: "milestone" as const, target: status.targetWords ?? (status.shape === "certificate" || status.target === null ? null : String(status.target)), by: milestoneBy(status, zone), amount: gift.amountDisplay, funder }
          : { kind: "daily" as const, funder },
      },
    ];
  });

  // The moment the session closes by itself, read again every half minute: a signature elsewhere pushes it back.
  useEffect(() => {
    const tick = () => {
      const at = mera.sessionExpiresAtMs();
      setUntil(at === undefined ? null : new Date(at).toLocaleTimeString(PRODUCT_LOCALE, { hour: "numeric", minute: "2-digit" }));
    };
    tick();
    const timer = setInterval(tick, 30_000);
    return () => clearInterval(timer);
  }, [address]);

  const chooseCurrency = (value: string) => {
    money.readIn(value);
    setReading(false);
    setSaved(true);
  };

  if (!address) {
    return (
      <Shell kind="destination" active="me" title={W.title} action={<SignInDoor />}>
        <p className={HELP}>{W.signedOut}</p>
        <Links signedIn={false} />
      </Shell>
    );
  }

  return (
    <Shell kind="destination" active="me" title={W.title} character={<HeadCharacter scene="me" />}>
      {/* The money at the top, with the same action as under Home's balance (the founder, 29 Sep 2026; Venmo's Me tab
          sets its wallet and "Transfer" there). The figure is Home's, in the account's own currency (D147). */}
      <section className={CARD}>
        <p className={CARD_LABEL}>{H.yours}</p>
        <div className="flex flex-wrap items-center justify-between gap-[var(--space-md)]">
          <p className={`${AMOUNT_IN_TITLE} text-[length:var(--type-card-amount)] leading-[1] tracking-[-0.02em]`}>{figure ? figure.text : "…"}</p>
          {holdings !== null && holdsAnything(holdings, gifts) ? <SpendOrWithdraw /> : null}
        </div>
      </section>

      {/* Where the person lives, a fact of the account (D274): asked once, then one line with "change". */}
      <WhereYouLive address={address} />

      <section className={CARD}>
        {/* The same key and the same list as the card (D152): one way to change what money is read in, and the
            list is what the rails and the rate file answer today, not three names written here. */}
        <div className="flex flex-wrap items-center justify-between gap-[var(--space-md)]">
          <span className="font-medium">{W.currency}</span>
          <span className="flex items-center gap-[var(--space-sm)]">
            <span>{currencyOf(money.currency).name}</span>
            <MoneyKey currency={money.currency} onOpen={() => setReading(true)} />
          </span>
        </div>
        {saved ? <p className={HELP} role="status">{W.currencySaved}</p> : null}
        <CurrencySheet
          open={reading}
          currency={money.currency}
          offered={money.offered}
          units={0n}
          rates={money.rates}
          ratesAsked={money.ratesAsked}
          language={money.language}
          onChoose={chooseCurrency}
          onClose={() => setReading(false)}
        />
      </section>

      <section className={CARD}>
        {/* While the session closes the page stays as it was: this line does not turn to "Not signed in" on the way. */}
        <p className="font-medium">{reach === "signing" && until ? W.signedInUntil(until) : reach === "signed-out" && !leaving ? W.signedOut : W.signedIn}</p>
        {reach === "reading" ? <p className={HELP}>{W.passkeyWhenMoneyMoves}</p> : null}
        {/* Where this account's key is kept, on a computer whose browser said it (src/account/key-kept.ts). */}
        <KeyKeptLine />
      </section>

      {/* What Viky reads, and the stop, for every gift this account is the person of (the founder, 29 Sep 2026). */}
      <WhatVikyReads gifts={readForYou} zone={zone} />

      <details className={`${CARD} me-code`}>
        <summary className="gift-fold-name font-medium">
          {W.codeQuestion}
          <FoldChevron />
        </summary>
        <p className={HELP}>{W.codeUse}</p>
        <p className="break-all rounded-[var(--radius-control)] border-[length:var(--card-border-width)] border-[var(--card-border)] bg-[var(--background)] p-[var(--space-md)] text-[length:var(--type-help)] tabular-nums">{address}</p>
        <button
          type="button"
          onClick={() => void navigator.clipboard.writeText(address).then(() => setCopied("yes")).catch(() => setCopied("refused"))}
          className={SECONDARY_BUTTON}
        >
          {copied === "yes" ? W.copied : W.copyCode}
        </button>
        {copied === "refused" ? <p className={HELP}>Your browser would not let us copy it. Press and hold the code, then choose Copy.</p> : null}
      </details>

      {/* The standing controls of the account, round, with two words each (the founder's rule 6 of 1 Oct 2026):
          signing out, another account, and installing. They were two small buttons in a card and a wide one. No
          label is printed above them (the founder, 2 Oct 2026): "You decide" is a gift's, and this page is titled. */}
      <RoundControls label={W.controls} untitled>
        {/* Signing out on the page that needs an account left a screen with nothing on it (D139): it lands on the
            page anybody can read, which is the one with the card, and nothing for nobody is drawn on the way
            (D258: this page stays until the landing is ready to be painted). */}
        <Act
          name={leaving === "out" ? W.leaving : W.signOut}
          disabled={leaving !== null}
          onPress={() => {
            setLeaving("out");
            void leave();
          }}
          data-decide="sign-out"
        >
          {/* The wheel takes the drawing's place while the session closes (the founder, 3 Oct 2026). */}
          {leaving === "out" ? <span className="working-ring working-ring-inline text-[26px]" aria-hidden="true" /> : null}
          <svg aria-hidden focusable="false" className={leaving === "out" ? "hidden" : undefined} width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h4" />
            <path d="M14 8l4 4-4 4" />
            <path d="M18 12H10" />
          </svg>
        </Act>
        {/* The same way out, and then the door: this account's session closes, the passkey this device remembered is
            let go of, and the landing opens the door, where another account is signed in to or made. */}
        <Act
          name={W.otherAccount}
          disabled={leaving !== null}
          onPress={() => {
            setLeaving("other");
            void toAnotherAccount();
          }}
          data-decide="other-account"
        >
          {leaving === "other" ? <span className="working-ring working-ring-inline text-[26px]" aria-hidden="true" /> : null}
          <svg aria-hidden focusable="false" className={leaving === "other" ? "hidden" : undefined} width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="9" r="3.5" />
            <path d="M5 20a7 7 0 0 1 14 0" />
          </svg>
        </Act>
        <InstallAct />
      </RoundControls>

      <Links signedIn />
    </Shell>
  );
}

/**
 * The text links, and only here (structure, section 3: no footer anywhere). The catalogue joined them on 19 Sep 2026:
 * Home carries it for a reader without an account, and a person who has one has nowhere else to look.
 */
function Links({ signedIn }: { signedIn: boolean }) {
  const link = "inline-flex min-h-[var(--tap-target)] items-center underline";
  return (
    <nav aria-label="More" className="flex flex-col">
      <Link href="/help" className={link}>
        {W.help}
      </Link>
      <Link href="/what-viky-can-check" className={link}>
        {CATALOGUE.title}
      </Link>
      <Link href="/privacy" className={link}>
        {W.privacy}
      </Link>
      <Link href="/legal" className={link}>
        {W.legal}
      </Link>
      {signedIn ? (
        <Link href="/judges" className={link}>
          {W.judges}
        </Link>
      ) : null}
    </nav>
  );
}
