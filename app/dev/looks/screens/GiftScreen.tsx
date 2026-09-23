"use client";
import { GiftPage } from "@/app/components/GiftPage";
import { exampleById } from "../gift-moments/examples";

/**
 * A gift's page, read by the person it is for: the production page itself (V4), drawn from the board's example of a
 * daily gift that runs, with a day earned, a day gone back and today. It was a hand-built copy of the page until V4,
 * which drew the old page long after the real one had changed; the copy is gone and the looks boards show what ships.
 */
export function GiftScreen() {
  const example = exampleById("days-running-recipient");
  if (!example) return null;
  return <GiftPage giftId={example.status.giftId} linkKey={null} initialStatus={example.status} />;
}
