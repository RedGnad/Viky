"use client";
import { useRef, useState, type RefObject } from "react";
import { useAccount } from "@/src/account/provider";
import { GIFTS as W, HOME } from "@/src/sentences";
import { AccountPanel } from "../components/AccountPanel";
import { BODY, TITLE } from "../components/ui";
import { EmptyState } from "./EmptyState";
import { FinishTheGift } from "./FinishTheGift";
import { useMinute } from "./clock";
import { charactersOf } from "./DayStrip";
import { conditionNameOf } from "./GiftCard";
import { GiftRows, listMemory, useListPlaces } from "./GiftRows";
import { MarkNotice, namesTheMark } from "./MarkNotice";
import { HeadCharacter } from "./HeadCharacter";
import { Arrival, type ArrivalGift } from "./Motion";
import { Place, PlacesOf } from "./Place";
import { Shell } from "./Shell";
import { useMyGifts } from "./my-gifts";
import type { GiftSummary } from "@/src/client/gift";
import { WaitLine } from "./Waiting";

/** What this device last saw of each of the two lists: what holds their places while they are read (app/kit/GiftRows.tsx). */
const GIVEN = listMemory("gifts.given");
const RECEIVED = listMemory("gifts.received");

/**
 * One of the two lists: its title, then the sentence that says it is empty or one place for each gift. While the list
 * is read, the places are the ones this device saw last time, and the sentence's own place where it saw none.
 */
function GiftList({
  list,
  title,
  empty,
  gifts,
  saw,
  landed,
}: Readonly<{
  list: RefObject<HTMLElement | null>;
  title: string;
  empty: string;
  /** This list's gifts, or null while they are read. */
  gifts: readonly GiftSummary[] | null;
  saw: Readonly<{ saw: number | undefined; heights: readonly (number | undefined)[] }>;
  landed: boolean;
}>) {
  return (
    <section ref={list} className="arrives-in-turn flex flex-col gap-[var(--space-md)]">
      <h2 className={TITLE}>{title}</h2>
      <Place open={gifts === null ? saw.saw === 0 : gifts.length === 0}>
        <div className={gifts === null ? "invisible" : landed ? "comes-up" : undefined} aria-hidden={gifts === null}>
          <EmptyState>{empty}</EmptyState>
        </div>
      </Place>
      <GiftRows gifts={gifts} held={saw.saw ?? 0} heights={saw.heights} landed={landed} />
    </section>
  );
}

/** Gifts: everything given and received, in two groups, each card opening its gift (structure, section 4). */
export function Gifts({ initialGifts }: Readonly<{ initialGifts?: GiftSummary[] | null }> = {}) {
  const { address, hasCredential } = useAccount();
  const { gifts, problem } = useMyGifts(address, initialGifts);
  const nowMs = useMinute();
  const given = gifts?.filter((gift) => gift.role === "funder") ?? [];
  const received = gifts?.filter((gift) => gift.role === "recipient") ?? [];
  /**
   * The same pieces as Home (the founder, 9 Oct 2026, app/kit/Place.tsx): each list's places are held from what this
   * device saw last time, and its cards come up in them. A device that remembers neither list shows the line that
   * says they are read, as before, and the two lists then open by their height.
   */
  const givenList = useRef<HTMLElement>(null);
  const receivedList = useRef<HTMLElement>(null);
  const sawGiven = useListPlaces(GIVEN, givenList, gifts === null ? null : given.length);
  const sawReceived = useListPlaces(RECEIVED, receivedList, gifts === null ? null : received.length);
  const [listLands] = useState(gifts === null);

  if (!address) {
    return (
      <Shell kind="destination" active="gifts" title={W.title} character={<HeadCharacter scene="gifts" />}>
        <FinishTheGift />
        <p className={BODY}>{W.signInFirst}</p>
        <AccountPanel returning={hasCredential} />
      </Shell>
    );
  }
  const remembered = sawGiven.saw !== undefined || sawReceived.saw !== undefined;
  /** Whether the two lists are drawn: once they are read, and while they are read where this device remembers them. */
  const lists = gifts !== null || (remembered && !problem);
  // Arriving here replays what changed since the last visit, per gift, once (the brief of 17 Sep 2026, section 6).
  const arriving: ArrivalGift[] = (gifts ?? []).map((gift) => {
    const days = gift.milestone ? [] : charactersOf(gift, gift.catchUpSeconds, nowMs, gift.days);
    return { id: gift.giftId, days, lastSeen: days.filter((day) => day === "earned" || day === "returned").length };
  });
  return (
    <PlacesOf>
    <Arrival storageKey="viky.seen.days" gifts={arriving}>
    <Shell kind="destination" active="gifts" title={W.title} character={<HeadCharacter scene="gifts" />}>
      {/* A gift whose payment was started and which is not made yet is no line of either list: it is said above them. */}
      <FinishTheGift />
      <Place open={problem !== null}>
        <p className={BODY}>{problem}</p>
      </Place>
      {/* Said only where this device remembers neither list: where it does, their places are held. */}
      <Place open={!problem && gifts === null && !remembered}>
        <WaitLine>{HOME.loading}</WaitLine>
      </Place>
      <Place open={lists} turns>
        <GiftList list={givenList} title={W.given} empty={W.emptyGiven} gifts={gifts === null ? null : given} saw={sawGiven} landed={listLands} />
      </Place>
      <Place open={lists} turns>
        <GiftList list={receivedList} title={W.received} empty={W.emptyReceived} gifts={gifts === null ? null : received} saw={sawReceived} landed={listLands} />
      </Place>
      {/* A card that names the TOEFL: what its owner asks at the bottom of a page that names it. */}
      <Place open={namesTheMark([...given, ...received].map(conditionNameOf))}>
        <MarkNotice />
      </Place>
    </Shell>
    </Arrival>
    </PlacesOf>
  );
}
