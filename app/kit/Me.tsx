"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import * as mera from "@/src/account/mera";
import { useAccount } from "@/src/account/provider";
import { useDisplayCurrency } from "@/src/client/display-currency";
import { currencyOf } from "@/src/currencies";
import { PRODUCT_LOCALE } from "@/src/moments";
import { CATALOGUE, ME as W } from "@/src/sentences";
import { CARD, HELP, INLINE_BUTTON, SECONDARY_BUTTON } from "../components/ui";
import { CurrencySheet } from "./CurrencySheet";
import { HeadCharacter } from "./HeadCharacter";
import { Install } from "./Install";
import { MoneyKey } from "./MoneyKey";
import { PrivateSpace } from "./PrivateSpace";
import { SignInDoor } from "./SignInDoor";
import { Shell } from "./Shell";

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
  const { address, reach, signOut, useAnotherAccount } = useAccount();
  const router = useRouter();
  /** What every screen reads in, and the list it may be changed from, both from one place (D152). */
  const money = useDisplayCurrency(address);
  const [reading, setReading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [until, setUntil] = useState<string | null>(null);
  const [copied, setCopied] = useState<"no" | "yes" | "refused">("no");

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
        <p className="font-medium">{reach === "signing" && until ? W.signedInUntil(until) : reach === "signed-out" ? W.signedOut : W.signedIn}</p>
        {reach === "reading" ? <p className={HELP}>{W.passkeyWhenMoneyMoves}</p> : null}
        <div className="flex flex-wrap gap-[var(--tap-gap)]">
          {/* Signing out on the page that needs an account left a screen with nothing on it (D139): it lands on the
              page anybody can read, which is the one with the card. */}
          <button
            type="button"
            onClick={() => {
              signOut();
              router.push("/");
            }}
            className={INLINE_BUTTON}
          >
            {W.signOut}
          </button>
          <button type="button" onClick={useAnotherAccount} className={INLINE_BUTTON}>
            {W.anotherAccount}
          </button>
        </div>
      </section>

      <PrivateSpace address={address} />

      <Install />

      <details className={CARD}>
        <summary className="cursor-pointer font-medium">{W.codeQuestion}</summary>
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
