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
        {/* Home without an account (D128, the founder on the advisor's preview of 20 Sep 2026): under 1024 one column,
            the character, the card, then the promise, as on a phone; from 1024 two columns, the character over the
            promise and its sentence on the left, the card on the right, the row centred in its height. The left block
            is `contents` under 1024 so the card can stand between the character and the promise there, and a flex
            column from 1024; the orders put the card second on a phone and second in the row on a wide screen. */}
        <div className="flex flex-col items-start gap-[var(--space-lg)] [@media(min-width:1024px)]:min-h-[560px] [@media(min-width:1024px)]:flex-row [@media(min-width:1024px)]:items-center [@media(min-width:1024px)]:gap-[80px]">
          <div className="contents [@media(min-width:1024px)]:flex [@media(min-width:1024px)]:max-w-[620px] [@media(min-width:1024px)]:flex-1 [@media(min-width:1024px)]:flex-col [@media(min-width:1024px)]:items-start [@media(min-width:1024px)]:gap-[18px]">
            <Gaze>
              <Character state="gift" tone="sun" className="h-auto w-[88px] shrink-0" />
            </Gaze>
            <div className="order-2 mt-[var(--space-sm)] flex flex-col gap-[6px] [@media(min-width:1024px)]:order-none [@media(min-width:1024px)]:mt-0 [@media(min-width:1024px)]:gap-[20px]">
              <h1 className={HERO}>{W.promise}</h1>
              {/* The sentence at most 460 wide; the title takes the column (620 from 1024), which is what holds it on two lines. */}
              <p className={`${LEAD} max-w-[460px]`}>{W.promiseUnder}</p>
            </div>
          </div>
          <div className="order-1 w-full [@media(min-width:1024px)]:order-none [@media(min-width:1024px)]:w-auto [@media(min-width:1024px)]:flex-none">
            <OfferCard />
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
