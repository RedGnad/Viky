"use client";
import { useEffect, useState, type RefObject } from "react";
import type { GiftSummary } from "@/src/client/gift";
import { MOTION } from "@/src/design-tokens";
import { GiftCard, GiftPlace } from "./GiftCard";
import { Reveal } from "./Motion";
import { Place } from "./Place";
import { forgetOnThisScreen, useSeen, useSeenMany, writeSeen } from "./seen";

/**
 * A list of gifts whose places are held while it is read (the founder, 9 Oct 2026; app/kit/Place.tsx): Home's three,
 * and the two lists of Gifts. What this device last saw of a list is how many gifts it had and how tall the first
 * cards stood, kept with what else it saw (app/kit/seen.tsx), where the server reads it while it draws the page.
 * Numbers only, for the device and not per account, as the memory of the way out is.
 */
export type ListMemory = Readonly<{ count: string; heights: readonly string[] }>;

/** The first cards of a list are the ones whose height is kept: the ones a screen shows as it opens. */
const HEIGHTS_KEPT = 3;
/** No more places are held than this, however long the list was: a memory gone stale never draws a page of them. */
export const MOST_HELD = 8;

export function listMemory(name: string): ListMemory {
  return { count: `viky.seen.${name}`, heights: Array.from({ length: HEIGHTS_KEPT }, (_, at) => `viky.seen.${name}.${at}`) };
}

/**
 * What this device saw of a list last time, and what it sees now written for the next visit: how many, at once, and
 * how tall each of the first cards stands, once the arrival has settled. `length` is null while the list is read.
 */
export function useListPlaces(memory: ListMemory, list: RefObject<HTMLElement | null>, length: number | null): Readonly<{ saw: number | undefined; heights: readonly (number | undefined)[] }> {
  const saw = useSeen(memory.count);
  const heights = useSeenMany(memory.heights);
  useEffect(() => {
    if (length === null) return;
    writeSeen(memory.count, length);
    const settled = window.setTimeout(() => {
      list.current?.querySelectorAll<HTMLElement>("[data-gift-row] a").forEach((card, at) => {
        if (memory.heights[at]) writeSeen(memory.heights[at], Math.round(card.getBoundingClientRect().height));
      });
    }, MOTION.arrival.budgetMs);
    return () => {
      window.clearTimeout(settled);
      [memory.count, ...memory.heights].forEach((key) => forgetOnThisScreen(key));
    };
  }, [memory, list, length]);
  return { saw, heights };
}

/**
 * One place for each gift, the same element from the first image to the last: while the list is read, as many places
 * as this device saw gifts, each at the height its card had; then each card comes up in the place held for it, a
 * place held for nothing closes, and a gift that had none opens its own.
 */
export function GiftRows({
  gifts,
  held,
  heights,
  landed,
}: Readonly<{
  /** The gifts to show, or null while they are read. */
  gifts: readonly GiftSummary[] | null;
  /** How many places are held while they are read. */
  held: number;
  heights: readonly (number | undefined)[];
  /** Whether the list was still to be read in this screen's first image: its cards then come up in place. */
  landed: boolean;
}>) {
  const count = gifts === null ? Math.min(MOST_HELD, held) : gifts.length;
  // A place that closes is still there while it closes: the rows are never fewer than they have been on this screen.
  const [most, setMost] = useState(count);
  if (count > most) setMost(count);
  return Array.from({ length: most }, (_, at) => (
    <Place key={at} open={at < count}>
      <div data-gift-row="">
        <Reveal>{gifts?.[at] ? <GiftCard gift={gifts[at]} landed={landed} /> : <GiftPlace height={heights[at]} />}</Reveal>
      </div>
    </Place>
  ));
}
