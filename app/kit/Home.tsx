"use client";
import Link from "next/link";
import { useAccount } from "@/src/account/provider";
import { loadPendingGift } from "@/src/pending-gift";
import { HOME as W, ME } from "@/src/sentences";
import { BODY, DISPLAY, HELP, PRIMARY_BUTTON, PROSE, SECONDARY_BUTTON, TITLE } from "../components/ui";
import { EmptyState } from "./EmptyState";
import { GiftCard } from "./GiftCard";
import { MoneyHero } from "./MoneyHero";
import { Shell } from "./Shell";
import { useMyGifts } from "./my-gifts";
import { holdsAnything, useHoldings } from "./money";

/**
 * Home, in this order and nothing else (structure of 17 Sep 2026, section 4): the money, "Offer a gift", "Take it
 * out" as soon as the account holds anything, and what is moving, up to three gift cards then the way to all of
 * them. Home has no display title: the money is its title.
 *
 * Without an account it is the promise, the two ways in, and how it works; and the two documents the law asks to
 * be reachable from the door, as text links, which is not a footer and lives nowhere else.
 */
export function Home() {
  const { address } = useAccount();
  const holdings = useHoldings(address);
  const { gifts, problem } = useMyGifts(address);

  if (!address) {
    return (
      <Shell kind="destination" active="home">
        <section className="flex flex-col gap-[var(--space-lg)]">
          <h1 className={DISPLAY}>{W.promise}</h1>
          <p className={PROSE}>{W.promiseBody}</p>
          <div className="flex w-full max-w-[420px] flex-col gap-[var(--tap-gap)] pt-[var(--space-sm)]">
            <Link href="/fund" className={PRIMARY_BUTTON}>
              {W.offer}
            </Link>
            <Link href="/me" className={SECONDARY_BUTTON}>
              {W.signIn}
            </Link>
          </div>
        </section>
        <section className="flex flex-col gap-[var(--space-md)]">
          <h2 className={TITLE}>{W.howItWorks}</h2>
          <ol className="flex list-decimal flex-col gap-[var(--space-sm)] pl-[var(--space-lg)]">
            {W.steps.map((step) => (
              <li key={step} className={BODY}>
                {step}
              </li>
            ))}
          </ol>
        </section>
        <p className={`${HELP} flex flex-wrap gap-[var(--space-lg)]`}>
          <Link href="/privacy" className="underline">
            {ME.privacy}
          </Link>
          <Link href="/legal" className="underline">
            {ME.legal}
          </Link>
        </p>
      </Shell>
    );
  }

  const moving = gifts?.slice(0, 3) ?? [];
  return (
    <Shell kind="destination" active="home">
      <MoneyHero address={address} holdings={holdings} />
      <Link href="/fund" className={PRIMARY_BUTTON}>
        {loadPendingGift(address) ? W.finish : W.offer}
      </Link>
      {holdings !== null && holdsAnything(holdings) ? (
        <Link href="/cash-out" className={SECONDARY_BUTTON}>
          {W.takeItOut}
        </Link>
      ) : null}
      <section className="flex flex-col gap-[var(--space-md)]">
        <h2 className={TITLE}>{W.moving}</h2>
        {problem ? <p className={BODY}>{problem}</p> : null}
        {!problem && gifts === null ? <p className={HELP}>{W.loading}</p> : null}
        {gifts !== null && gifts.length === 0 ? <EmptyState>{W.empty}</EmptyState> : null}
        {moving.map((gift) => (
          <GiftCard key={gift.giftId} gift={gift} />
        ))}
        {gifts !== null && gifts.length > 0 ? (
          <Link href="/gifts" className={`${BODY} inline-flex min-h-[var(--tap-target)] items-center self-start text-[var(--accent-text)] underline`}>
            {W.seeAll}
          </Link>
        ) : null}
      </section>
    </Shell>
  );
}
