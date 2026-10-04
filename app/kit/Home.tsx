"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAccount } from "@/src/account/provider";
import { CATALOGUE, HOME as W, ME, NAV } from "@/src/sentences";
import { BODY, HELP, HERO, LEAD, PRIMARY_BUTTON, SMALL_BUTTON, TITLE } from "../components/ui";
import { Arrival, Reveal, type ArrivalGift } from "./Motion";
import { SignInDoor } from "./SignInDoor";
import { EmptyState } from "./EmptyState";
import { GiftCard } from "./GiftCard";
import { HeadCharacter } from "./HeadCharacter";
import { dropStaleCardFragment, goToTheCard } from "./WayToTheCard";
import { topAfterLongAbsence } from "@/src/launch-top";
import { HeroMoment } from "./HeroMoment";
import { isStandalone } from "./Install";
import { LandingStory } from "./LandingStory";
import { SideCrowd } from "./SideCrowd";
import { GoalsGoingBy } from "./GoalsGoingBy";
import type { LandingGoals } from "@/src/landing-goals";
import { MoneyHero } from "./MoneyHero";
import { SpendOrWithdraw } from "./SpendOrWithdraw";
import { ReachedMoments, reachedOfSummary, type ReachedGift } from "./ReachedMoment";
import { DoorNotice } from "./AccountDoor";
import { FinishTheGift } from "./FinishTheGift";
import { OfferCard } from "./offer/OfferCard";
import { Shell } from "./Shell";
import { useMyGifts } from "./my-gifts";
import { useMinute } from "./clock";
import { charactersOf } from "./DayStrip";
import { holdsAnything, useHoldings, useSawMoney, type Holdings } from "./money";
import type { HeldAmounts } from "@/src/reader-holdings";
import type { GiftSummary } from "@/src/client/gift";
import { WaitLine } from "./Waiting";

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
/**
 * How the landing's first screen shares the room it has left over (D248, D250): above the words, before the action,
 * before the character. Weights of flex spacers; the column's own gaps and the action's 24 pixel minimum come on top.
 */
export const ROOM = { aboveWords: 1, beforeAction: 0.9, beforeCharacter: 1.1 } as const;

export function Home({
  initialHoldings,
  initialGifts,
  heroPlayed = false,
  goals,
}: Readonly<{ initialHoldings?: HeldAmounts | null; initialGifts?: GiftSummary[] | null; heroPlayed?: boolean; goals?: LandingGoals }> = {}) {
  /**
   * What the server read for this account while it drew the page (D160). Amounts cross as strings, because a
   * balance has more digits than a browser number holds, and become amounts here.
   */
  const fromTheServer = useMemo(
    () => (initialHoldings ? (Object.fromEntries(Object.entries(initialHoldings).map(([coin, held]) => [coin, BigInt(held)])) as Holdings) : null),
    [initialHoldings],
  );
  /**
   * Whose page this is, and only a session answers that (D149, correcting D147). For half a day this page asked the
   * device whether it held a passkey instead, to draw the right Home before the session cookie came back over the
   * network. A passkey on the device is not a session: somebody who signed out still has one, and they were shown
   * the signed-in page with three dots where their money would be, no promise, no character and no way in. The page
   * waits for the answer to the question it is actually asking.
   */
  const { address: account } = useAccount();
  /**
   * The pay sheet, open or shut, kept here and not on the card (the audit of 1 Oct 2026). This page has two trees, one
   * for nobody and one for an account, and the card is drawn anew when one gives way to the other: an account made or
   * signed in from the sheet shut the sheet, and the person had to find the card's action and press it again.
   */
  const [paying, setPaying] = useState(false);
  /**
   * A press on pay is making its account: the page for nobody stays, under its sheet, until the wait has replaced it.
   * Without this the page for an account showed between the passkey and the wait, with the sheet gone.
   */
  const [making, setMaking] = useState(false);
  const address = making ? undefined : account;
  const holdings = useHoldings(address, fromTheServer);
  const { gifts, problem } = useMyGifts(address, initialGifts);
  const nowMs = useMinute();
  /** Whether the room the way out takes is held while the balance is read (app/kit/money.ts). */
  const sawMoney = useSawMoney(holdings);

  // A "#offer" an earlier press left in the address is dropped on arrival, so the next launch starts at the top (D240).
  useEffect(() => {
    dropStaleCardFragment();
  }, []);

  // The installed app brought back after a long absence opens on its landing's top, as Android does (D250).
  useEffect(() => topAfterLongAbsence(isStandalone), []);

  if (!address) {
    return (
      <Shell kind="destination" active="home" action={<SignInDoor />} bare wide>
        {/* The day characters beside the top, on a screen with room beside the column (the founder, 28 Sep 2026). */}
        <SideCrowd />
        {/* Inside another app's page no account can be made: said here, before anything is filled in (1 Oct 2026). */}
        <DoorNotice />
        {/* A payment started on this device for a gift never made: the way back to it, before anything else (D74). */}
        <FinishTheGift />
        {/* Home without an account, in the order of the founder's sketch of 24 Sep 2026 (D214, D221): the promise,
            its sentence, the way to the card, the hero moment, then the card. The first four are the first screen, as
            tall as the viewport less what of the card it shows, so the card's top is cut by the fold on every phone
            and the page says there is more (NN/g on the fold). One column, centred at every width. */}
        <div className="arrives-in-turn flex w-full flex-col items-center">
          <div className="hero-first-screen flex w-full flex-col items-center gap-[var(--space-md)] [@media(min-width:1024px)]:gap-[var(--space-sm)]">
            {/* The room the first screen has left over goes in three shares (D248): above the words, between the words and
                the action, between the action and the character, so the action reads as its own step and the words
                rise from the middle. Not rigidly equal (the founder, D250): the action's share is a little smaller and
                the character's a little larger, 1 : 0.9 : 1.1, which lifts the action a touch. The card does not move. */}
            <div aria-hidden className="basis-0" style={{ flexGrow: ROOM.aboveWords }} />
            <div className="w-full text-center">
              <h1 className={HERO}>{W.promise}</h1>
              {/* Bounded at 460 on a phone and at 34em from 1024 (D210, the founder's default): a longer sentence
                  breaks into centred lines rather than running the column's width. */}
              <p className={`${LEAD} mx-auto mt-[var(--space-xs)] max-w-[460px] [@media(min-width:1024px)]:max-w-[34em]`}>{W.promiseUnder}</p>
            </div>
            {/* The one action of the first screen, in the accent: it goes to the card, which is the product, and the
                card's own action is a screen below, so each screen has its one accent (D221; ui.ts). */}
            {/* Its own share of the room (D248), and never less than 24 pixels under the sentence, the column's gap made
                up, on a phone too short to leave any room (D242). */}
            <div aria-hidden className="basis-0" style={{ flexGrow: ROOM.beforeAction }} />
            <div className="[@media(min-width:1024px)]:pt-[calc(var(--space-xl)-2*var(--space-sm))]">
              <a href="#offer" className={`${PRIMARY_BUTTON} w-auto! px-[var(--space-xl)] text-center no-underline`} onClick={goToTheCard}>
                {W.offer}
              </a>
            </div>
            <div aria-hidden className="basis-0" style={{ flexGrow: ROOM.beforeCharacter }} />
            <HeroMoment played={heroPlayed} />
          </div>
          {/* Above the character, so the card's paper hides what of it is still behind. Focusable by the way to it, so
              the keyboard carries on from the card, and without a ring of its own: the card's controls have theirs. */}
          <div id="offer" tabIndex={-1} className="relative z-[1] w-full outline-none [@media(min-width:1024px)]:flex [@media(min-width:1024px)]:justify-center">
            <OfferCard paying={paying} onPaying={setPaying} onMaking={setMaking} />
          </div>
        </div>
        {/* What a gift can wait for, one thing at a time, from the register (D285, over D225's four still names). */}
        {goals ? <GoalsGoingBy first={goals.first} kinds={goals.kinds} /> : null}
        {/* Under the card, what Viky promises, drawn (the founder, 27 Sep 2026, D282). */}
        <LandingStory />
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
          {/* Installing it needs no account, so the way to do it is on the page that needs none (D139): the phone's own
              card above says it now, so the line is not said twice. */}
        </p>
      </Shell>
    );
  }

  const moving = gifts?.slice(0, 3) ?? [];
  // Every reached gift this account has not had the moment of, played over Home once it has loaded (the founder).
  const owed = (gifts ?? []).filter((gift) => gift.reachedSeen === false).map(reachedOfSummary).filter((gift): gift is ReachedGift => gift !== null);
  // What changed since the last visit, per gift, which the arrival replays once and in order (brief, section 6).
  const arriving: ArrivalGift[] = moving.map((gift) => {
    const days = gift.milestone ? [] : charactersOf(gift, gift.catchUpSeconds, nowMs, gift.days);
    return { id: gift.giftId, days, lastSeen: days.filter((day) => day === "earned" || day === "returned").length };
  });
  return (
    <Arrival storageKey="viky.seen.days" gifts={arriving} amount>
      {/* With an account the column is exactly the card's width plus its margins (D128): the money, the button and
          every gift under the card then share its two edges, and the column centres itself in the room beside the rail. */}
      {/* With an account the money leads (D139). Every account app people already use puts the balance at the top,
          Wise, Revolut and Monzo among them, and it is what somebody opens Viky to read; the card is the one action
          under it. Without an account there is no money to read, and the card leads, which is D129's order. */}
      {/* Its title, like Gifts and You: without one the head's row was the character's own height and the character
          stood higher here than on the two other destinations (the founder, 24 Sep 2026, D230). */}
      <Shell kind="destination" active="home" title={NAV.home} character={<HeadCharacter scene="home" />}>
        <ReachedMoments gifts={owed} />
        {/* A payment started for a gift never made: said first, since the money for it may be what stands below (D74). */}
        <FinishTheGift />
        <MoneyHero address={address} holdings={holdings} gifts={gifts} giftsUnread={problem !== null} />
        {/* The balance's own action, small and under it (the founder, 29 Sep 2026). It keeps its place while the
            balance is being read (D147), so the card under it does not jump down when the answer lands. The room is
            held only on a device that saw money here last time: a first visit holds nothing, and an account with
            nothing to take never keeps a hole where a button is not. */}
        {holdings === null ? sawMoney ? <SpendOrWithdraw holding /> : null : holdsAnything(holdings, gifts) ? <SpendOrWithdraw /> : null}
        {/* The gift form under its own title, apart from the money above it: nothing between the two reads as one. */}
        <h2 className={`${TITLE} mt-[var(--space-lg)]`}>{W.offer}</h2>
        {/* The card starts on the account's own money when it holds any (D157). */}
        <OfferCard holdings={holdings} paying={paying} onPaying={setPaying} onMaking={setMaking} />
        {/* The gifts land one after another rather than all at once (D154). */}
        <section className="arrives-in-turn flex flex-col gap-[var(--space-md)]">
          <h2 className={TITLE}>{W.moving}</h2>
          {problem ? <p className={BODY}>{problem}</p> : null}
          {!problem && gifts === null ? <WaitLine>{W.loading}</WaitLine> : null}
          {gifts !== null && gifts.length === 0 ? <EmptyState>{W.empty}</EmptyState> : null}
          {moving.map((gift) => (
            <Reveal key={gift.giftId}>
              <GiftCard gift={gift} />
            </Reveal>
          ))}
          {gifts !== null && gifts.length > 0 ? (
            <Link href="/gifts" className={`${SMALL_BUTTON} self-start no-underline`}>
              {W.seeAll}
            </Link>
          ) : null}
        </section>
      </Shell>
    </Arrival>
  );
}
