"use client";
import { useSyncExternalStore } from "react";

/**
 * The minute, stepped once a minute, and nothing on the server: what a day is depends on the reader's clock, so it is
 * read as an external store rather than during a render, and the first paint on the server matches the first paint in
 * the browser. Zero means "no clock yet", which every reader of it treats as "nothing dated to show".
 */
function everyMinute(changed: () => void): () => void {
  const timer = setInterval(changed, 60_000);
  return () => clearInterval(timer);
}

const thisMinute = () => Math.floor(Date.now() / 60_000) * 60_000;
const noClock = () => 0;

export function useMinute(): number {
  return useSyncExternalStore(everyMinute, thisMinute, noClock);
}
