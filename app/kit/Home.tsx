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
        {/* Home without an account (D129, D131): one column, and the same order everywhere, the character, the title,
            the sentence, the card. On a phone the character is a diamond floated into the hollow the title's own
            ragged edge leaves at its top right, which is what lets the block start a hundred pixels higher; from 1024
            it stands above the title and the whole composition is centred in the window, the card included. */}
        <div className="flex w-full flex-col items-start gap-[var(--space-md)] [@media(min-width:1024px)]:items-center [@media(min-width:1024px)]:gap-[var(--space-sm)]">
          {/* A plain block, never a flex one: text only flows around a float inside a block. */}
          <div className="w-full [@media(min-width:1024px)]:text-center">
            <Gaze>
              <Character
                state="diamond"
                tone="sun"
                standing={false}
                /* 86 wide is 54 tall in its own box, exactly the title's line, which is the largest the hollow takes
                   before the shape bites into the second line and the title breaks into three (the founder, 21 Sep
                   2026, asking for it bigger while keeping A's two lines). */
                /* No margin under it on a phone: a float's margin box is what the text avoids, and eight pixels of
                   it pushed the second line aside too, which is what broke the title into four ragged lines. */
                className="float-right ml-[var(--space-sm)] h-auto w-[86px] [@media(min-width:1024px)]:float-none [@media(min-width:1024px)]:mx-auto [@media(min-width:1024px)]:mb-[var(--space-md)] [@media(min-width:1024px)]:block [@media(min-width:1024px)]:w-[96px]"
              />
            </Gaze>
            <h1 className={HERO}>{W.promise}</h1>
            {/* One line from 1024, where two would have pushed the card's last line past the fold (measured 914 for 900). */}
            <p className={`${LEAD} mt-[6px] max-w-[460px] [@media(min-width:1024px)]:max-w-none`}>{W.promiseUnder}</p>
          </div>
          <OfferCard />
        </div>
        <p className={`${HELP} flex w-full flex-wrap gap-x-[var(--space-lg)] [@media(min-width:1024px)]:justify-center`}>
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
