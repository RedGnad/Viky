"use client";
import { useEffect } from "react";
import { DEFAULT_IDLE_MINUTES, MONEY_SCREEN_IDLE_MINUTES, setSessionIdleMinutes } from "./mera";

/**
 * Keeps the signing session open thirty minutes while a money screen is mounted, and ten again once it is not.
 *
 * Mounted by the three screens where money moves: the way out, giving, and a gift's page. It changes the length
 * of the session and nothing about what the session may sign (decision 2 of the design pass, 17 Sep 2026).
 */
export function useMoneySession(): void {
  useEffect(() => {
    setSessionIdleMinutes(MONEY_SCREEN_IDLE_MINUTES);
    return () => setSessionIdleMinutes(DEFAULT_IDLE_MINUTES);
  }, []);
}
