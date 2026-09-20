"use client";
import Link from "next/link";
import { useAccount } from "@/src/account/provider";
import { CATALOGUE, HOME as W, ME } from "@/src/sentences";
import { BODY, HELP, HERO, LEAD, SECONDARY_BUTTON, TITLE } from "../components/ui";
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
      <Shell kind="destination" active="home" action={<SignInDoor />} bare wide>
        {/* Home without an account (D129): one column at every width, and the same order from the phone to the desk,
            the character, the title, the sentence, the card. The text is never under the card. The two columns of
            D128 lasted an evening; what they had put under the card on a phone was a regression on the page of the
            morning. What a wide screen gets instead is the title at its full size on one line, and air on the right. */}
        <div className="flex w-full flex-col items-start gap-[var(--space-md)] [@media(min-width:1024px)]:gap-[var(--space-sm)]">
          <Gaze>
            <Character state="gift" tone="sun" className="h-auto w-[88px] shrink-0 [@media(min-width:1024px)]:w-[72px]" />
          </Gaze>
          <h1 className={HERO}>{W.promise}</h1>
          <p className={`${LEAD} max-w-[460px] [@media(min-width:1024px)]:max-w-none`}>{W.promiseUnder}</p>
          <OfferCard />
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
      {/* With an account the column is exactly the card's width plus its margins (D128): the money, the button and
          every gift under the card then share its two edges, and the column centres itself in the room beside the rail. */}
      <Shell kind="destination" active="home" width="card">
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
