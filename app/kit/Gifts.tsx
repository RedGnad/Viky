"use client";
import { useAccount } from "@/src/account/provider";
import { GIFTS as W, HOME } from "@/src/sentences";
import { AccountPanel } from "../components/AccountPanel";
import { BODY, HELP, TITLE } from "../components/ui";
import { EmptyState } from "./EmptyState";
import { useMinute } from "./clock";
import { charactersOf } from "./DayStrip";
import { GiftCard } from "./GiftCard";
import { Arrival, Reveal, type ArrivalGift } from "./Motion";
import { Shell } from "./Shell";
import { useMyGifts } from "./my-gifts";

/** Gifts: everything given and received, in two groups, each card opening its gift (structure, section 4). */
export function Gifts() {
  const { address } = useAccount();
  const { gifts, problem } = useMyGifts(address);
  const nowMs = useMinute();

  if (!address) {
    return (
      <Shell kind="destination" active="gifts" title={W.title}>
        <p className={BODY}>{W.signInFirst}</p>
        <AccountPanel />
      </Shell>
    );
  }
  const given = gifts?.filter((gift) => gift.role === "funder") ?? [];
  const received = gifts?.filter((gift) => gift.role === "recipient") ?? [];
  // Arriving here replays what changed since the last visit, per gift, once (the brief of 17 Sep 2026, section 6).
  const arriving: ArrivalGift[] = (gifts ?? []).map((gift) => {
    const days = gift.milestone ? [] : charactersOf(gift, gift.catchUpSeconds, nowMs, gift.days);
    return { id: gift.giftId, days, lastSeen: days.filter((day) => day === "earned" || day === "returned").length };
  });
  return (
    <Arrival storageKey="viky.seen.days" gifts={arriving}>
    <Shell kind="destination" active="gifts" title={W.title}>
      {problem ? <p className={BODY}>{problem}</p> : null}
      {!problem && gifts === null ? <p className={HELP}>{HOME.loading}</p> : null}
      {gifts !== null ? (
        <>
          <section className="flex flex-col gap-[var(--space-md)]">
            <h2 className={TITLE}>{W.given}</h2>
            {given.length === 0 ? <EmptyState>{W.emptyGiven}</EmptyState> : given.map((gift) => <Reveal key={gift.giftId}><GiftCard gift={gift} /></Reveal>)}
          </section>
          <section className="flex flex-col gap-[var(--space-md)]">
            <h2 className={TITLE}>{W.received}</h2>
            {received.length === 0 ? <EmptyState>{W.emptyReceived}</EmptyState> : received.map((gift) => <Reveal key={gift.giftId}><GiftCard gift={gift} /></Reveal>)}
          </section>
        </>
      ) : null}
    </Shell>
    </Arrival>
  );
}
