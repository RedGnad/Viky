"use client";
import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";

/**
 * The minute, stepped once a minute. What a day is depends on the clock, so it is read as an external store rather
 * than during a render. On the server, and in the browser's hydration, it is the minute the server drew the page at
 * (the fix to #154): the days of a gift and the next reading are in the first image rather than drawn by the browser a
 * moment later, and hydration agrees because both sides read the same minute. Zero is still "no clock yet", for a
 * screen drawn outside the layout that gives the minute.
 */
const ServerMinute = createContext(0);

export function ServerMinuteProvider({ minute, children }: Readonly<{ minute: number; children: ReactNode }>) {
  return <ServerMinute.Provider value={minute}>{children}</ServerMinute.Provider>;
}

function everyMinute(changed: () => void): () => void {
  const timer = setInterval(changed, 60_000);
  return () => clearInterval(timer);
}

const thisMinute = () => Math.floor(Date.now() / 60_000) * 60_000;

export function useMinute(): number {
  const drawnAt = useContext(ServerMinute);
  return useSyncExternalStore(everyMinute, thisMinute, () => drawnAt);
}
