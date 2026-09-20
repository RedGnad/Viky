"use client";
import Link from "next/link";
import { useAccount } from "@/src/account/provider";
import { CATALOGUE, HOME as W, ME } from "@/src/sentences";
import { BODY, HELP, PROMISE, SECONDARY_BUTTON, TITLE } from "../components/ui";
import { Character } from "./Character";
import { Arrival, Gaze, Reveal, type ArrivalGift } from "./Motion";
import { SignInDoor } from "./SignInDoor";
import { EmptyState } from "./EmptyState";
import { GiftCard } from "./GiftCard";
import { MoneyHero } from "./MoneyHero";
import { OfferCard } from "./offer/OfferCard";
import { Shell } from "./Shell";
import { useMyGifts } from "./my-gifts";
import { useMinute } from "./clock";
import { charactersOf } from "./DayStrip";
import { holdsAnything, useHoldings } from "./money";

/**
 * Home: a gift to fill in, and nothing in front of it (the product vision of 19 Sep 2026, sections 1 and 5).
 *
 * The card is the first thing on the page, with an account or without one, and it is a real card: what is filled in
 * here is the gift that gets paid for. Under it, for an account, the money and what is moving; without one, the
 * promise in a line and the one door in the header, which is where the account is asked for and nowhere earlier.
 *
 * What went: the button that opened an eight step assistant, and the example card that showed a gift nobody had
 * made. A page that offers a real object has no use for a picture of one (vision, section 9).
 */
export function Home() {
  const { address } = useAccount();
  const holdings = useHoldings(address);
  const { gifts, problem } = useMyGifts(address);
  const nowMs = useMinute();

  if (!address) {
    return (
      <Shell kind="destination" active="home" action={<SignInDoor />} bare>
        {/* Home without an account (D127, the vision of 19 Sep, section 5): the card to fill at the top, and under it
            one line of promise. The card is the star and carries its rank by its edge and its relief; the promise is
            the second level, in the title voice. One column: on the left edge below 1024, as on a phone; from 1024
            centred in the window, the card and the promise together centred in the height. What fills a wide screen
            is air around one object, not a second column. The character keeps its place above the card. */}
        <div className="flex flex-col items-start gap-[var(--space-lg)] [@media(min-width:1024px)]:min-h-[calc(100dvh-152px)] [@media(min-width:1024px)]:items-center [@media(min-width:1024px)]:justify-center">
          <Gaze>
            <Character state="gift" tone="sun" className="h-auto w-[88px] shrink-0" />
          </Gaze>
          <OfferCard />
          {/* 24 px under the card (the column's 16 and this 8), the title, then the sentence 6 px under it. */}
          <div className="mt-[var(--space-sm)] flex max-w-[460px] flex-col gap-[6px] [@media(min-width:1024px)]:items-center [@media(min-width:1024px)]:text-center">
            <h1 className={PROMISE}>{W.promise}</h1>
            <p className={`${BODY} text-[var(--muted)]`}>{W.promiseUnder}</p>
          </div>
        </div>
        <p className={`${HELP} flex flex-wrap gap-x-[var(--space-lg)]`}>
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
        <OfferCard />
        <MoneyHero address={address} holdings={holdings} />
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
