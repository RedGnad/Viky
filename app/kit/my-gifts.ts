"use client";
import { useEffect, useState } from "react";
import { loadMyGifts, type GiftSummary } from "@/src/client/gift";
import { HOME } from "@/src/sentences";
import { ApiError } from "@/src/client/api";
import { useAccount } from "@/src/account/provider";

/** The account's gifts, read once for a screen, with the two states a list can be in besides full. */
export function useMyGifts(address: string | undefined, start?: GiftSummary[] | null): { gifts: GiftSummary[] | null; problem: string | null } {
  const { serverForgot } = useAccount();
  const [gifts, setGifts] = useState<GiftSummary[] | null>(start ?? null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (!address) return;
    let live = true;
    loadMyGifts().then(
      (result) => {
        if (live) setGifts(result.gifts);
      },
      (error) => {
        if (!live) return;
        // The server no longer knows this browser: that is a sign-out, and the screen shows the signed-out one rather
        // than gifts that "could not be loaded" (the founder, 28 Sep 2026).
        if (error instanceof ApiError && error.status === 401) return serverForgot();
        setProblem(HOME.failed);
      },
    );
    return () => {
      live = false;
    };
  }, [address, serverForgot]);
  return { gifts: address ? gifts : null, problem };
}
