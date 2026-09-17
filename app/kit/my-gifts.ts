"use client";
import { useEffect, useState } from "react";
import { loadMyGifts, type GiftSummary } from "@/src/client/gift";
import { HOME } from "@/src/sentences";

/** The account's gifts, read once for a screen, with the two states a list can be in besides full. */
export function useMyGifts(address: string | undefined): { gifts: GiftSummary[] | null; problem: string | null } {
  const [gifts, setGifts] = useState<GiftSummary[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (!address) return;
    let live = true;
    loadMyGifts().then(
      (result) => {
        if (live) setGifts(result.gifts);
      },
      () => {
        if (live) setProblem(HOME.failed);
      },
    );
    return () => {
      live = false;
    };
  }, [address]);
  return { gifts: address ? gifts : null, problem };
}
