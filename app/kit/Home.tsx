"use client";
import Link from "next/link";
import { useAccount } from "@/src/account/provider";
import { loadPendingGift } from "@/src/pending-gift";
import { CATALOGUE, HOME as W, ME } from "@/src/sentences";
import { BODY, DISPLAY, HELP, PRIMARY_BUTTON, PROSE, SECONDARY_BUTTON, TITLE } from "../components/ui";
import { Character } from "./Character";
import { exampleGift } from "./example-gift";
import { Arrival, Gaze, Reveal, type ArrivalGift } from "./Motion";
import { SignInDoor } from "./SignInDoor";
import { EmptyState } from "./EmptyState";
import { GiftCard } from "./GiftCard";
import { MoneyHero } from "./MoneyHero";
import { Shell } from "./Shell";
import { useMyGifts } from "./my-gifts";
import { useMinute } from "./clock";
import { charactersOf } from "./DayStrip";
import { holdsAnything, useHoldings } from "./money";

/**
 * Home, in this order and nothing else (structure of 17 Sep 2026, section 4): the money, "Offer a gift", "Take it
 * out" as soon as the account holds anything, and what is moving, up to three gift cards then the way to all of
 * them. Home has no display title: the money is its title.
 *
 * Without an account it is the gift character, the promise, one action, an example of a gift card and how it works; the
 * way into an account is the one door in the header (SignInDoor, brief section 7). The two documents the law asks to be
 * reachable from the door are text links, which is not a footer and lives nowhere else; the public catalogue is beside
 * them, because a reader deciding whether to offer anything asks what Viky can check before anything else.
 */
export function Home() {
  const { address } = useAccount();
  const holdings = useHoldings(address);
  const { gifts, problem } = useMyGifts(address);
  const nowMs = useMinute();

  if (!address) {
    return (
      <Shell kind="destination" active="home" action={<SignInDoor />}>
        <section className="flex flex-col gap-[var(--space-lg)]">
          <Gaze>
            <Character state="gift" className="h-auto w-[104px] [@media(min-width:840px)]:w-[136px]" />
          </Gaze>
          <h1 className={DISPLAY}>{W.promise}</h1>
          <p className={PROSE}>{W.promiseBody}</p>
          {/* One action in the body, and the door in the header: the two gestures of section 7, and no third. */}
          <div className="flex w-full max-w-[420px] flex-col pt-[var(--space-sm)]">
            <Link href="/fund" className={PRIMARY_BUTTON}>
              {W.offer}
            </Link>
          </div>
        </section>
        <Reveal>
          <GiftCard gift={exampleGift(nowMs)} example />
        </Reveal>
        <Reveal className="flex flex-col gap-[var(--space-md)]">
          <h2 className={TITLE}>{W.howItWorks}</h2>
          <ol className="flex list-decimal flex-col gap-[var(--space-sm)] pl-[var(--space-lg)]">
            {W.steps.map((step) => (
              <li key={step} className={BODY}>
                {step}
              </li>
            ))}
          </ol>
        </Reveal>
        <p className={`${HELP} flex flex-wrap gap-x-[var(--space-lg)]`}>
          {/* What the chooser does not offer, and why, since the chooser itself only ever shows what is proved. */}
          <Link href="/what-viky-can-check" className="inline-flex min-h-[var(--tap-target)] min-w-[var(--tap-target)] items-center underline">
            {CATALOGUE.title}
          </Link>
          <Link href="/privacy" className="inline-flex min-h-[var(--tap-target)] min-w-[var(--tap-target)] items-center underline">
            {ME.privacy}
          </Link>
          <Link href="/legal" className="inline-flex min-h-[var(--tap-target)] min-w-[var(--tap-target)] items-center underline">
            {ME.legal}
          </Link>
        </p>
      </Shell>
    );
  }

  const moving = gifts?.slice(0, 3) ?? [];
  // What changed since the last visit, per gift, which the arrival replays once and in order (brief, section 6).
  const arriving: ArrivalGift[] = moving.map((gift) => {
    const days = gift.milestone ? [] : charactersOf(gift, gift.catchUpSeconds, nowMs, gift.days);
    return { id: gift.giftId, days, lastSeen: days.filter((day) => day === "earned" || day === "returned").length };
  });
  return (
    <Arrival storageKey="viky.seen.days" gifts={arriving} amount>
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
          <Reveal key={gift.giftId}>
            <GiftCard gift={gift} />
          </Reveal>
        ))}
        {gifts !== null && gifts.length > 0 ? (
          <Link href="/gifts" className={`${BODY} inline-flex min-h-[var(--tap-target)] items-center self-start text-[var(--accent-text)] underline`}>
            {W.seeAll}
          </Link>
        ) : null}
      </section>
    </Shell>
    </Arrival>
  );
}
