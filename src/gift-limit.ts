import { limitsNow } from "./attested-calls";

/**
 * What a gift's page is told when the month's limit is reached (the founder, 3 Oct 2026): which of the two limits, the
 * readings' or the proofs' of people, and until when the day still to count can be counted. Nothing while neither is
 * reached, and nothing for a gift that is over: no reading would go for it anyway. The type is read by the screens;
 * the function is the server's.
 */
export type GiftLimit = Readonly<{ readings: boolean; proofs: boolean; countableUntil: number | null }>;

export async function giftLimitFor(live: boolean, until: () => number | null, limits: () => Promise<{ readings: boolean; proofs: boolean }> = () => limitsNow()): Promise<GiftLimit | null> {
  if (!live) return null;
  const reached = await limits();
  if (!reached.readings && !reached.proofs) return null;
  return { ...reached, countableUntil: reached.readings ? until() : null };
}
