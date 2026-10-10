"use client";
import { useEffect, useState } from "react";
import { loadMyGifts, type GiftSummary } from "@/src/client/gift";
import { HOME } from "@/src/sentences";
import { ApiError } from "@/src/client/api";
import { useAccount } from "@/src/account/provider";

/**
 * The account's gifts, read once for a screen, with the two states a list can be in besides full.
 *
 * `read` says the list is the one this screen asked for itself. The list a page is rendered with (`start`) is as old
 * as the page: a step back in the browser's history draws the page again from what the browser kept of it, and the
 * server is not asked (measured on a production build, 10 Oct 2026: a push asks for the page's payload, a step back
 * asks for nothing). So that list is good for a first image, and for nothing that is owed once.
 */
export function useMyGifts(address: string | undefined, start?: GiftSummary[] | null): { gifts: GiftSummary[] | null; problem: string | null; read: boolean } {
  const { serverForgot } = useAccount();
  const [gifts, setGifts] = useState<GiftSummary[] | null>(start ?? null);
  const [read, setRead] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (!address) return;
    let live = true;
    loadMyGifts().then(
      (result) => {
        if (!live) return;
        setGifts(result.gifts);
        setRead(true);
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
  return { gifts: address ? gifts : null, problem, read: Boolean(address) && read };
}
