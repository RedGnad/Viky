"use client";
import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import { SEEN_COOKIE, SEEN_MAX_AGE_SECONDS, seenCookieWith, seenKey, type Seen } from "@/src/seen-cookie";

/**
 * What this device last saw, as the server read it from the cookie and as the browser keeps it afterwards (the fix to
 * #154). The server draws an arrival's starting state from the cookie; the browser's first render reads the very same
 * values, so hydration agrees and nothing is redrawn; and what the screen then sees is written back to the cookie.
 *
 * Read once per screen, as before: a value is frozen for as long as the screen stands, because the arrival is about
 * to overwrite it, and forgotten when the screen goes, so the next screen reads what this one wrote.
 */
const SeenContext = createContext<Seen>({});

let kept: Map<string, number> | null = null;
const onThisScreen = new Map<string, number | undefined>();

export function SeenProvider({ initial, children }: Readonly<{ initial: Seen; children: ReactNode }>) {
  return <SeenContext.Provider value={initial}>{children}</SeenContext.Provider>;
}

/** The browser's own copy, started from what the server read, once per document. */
function keptFrom(initial: Seen): Map<string, number> {
  if (kept === null) kept = new Map(Object.entries(initial));
  return kept;
}

const neverChanges = () => () => {};

/**
 * Where a screen keeps its own frozen reading of a key. Two screens may read one key, Home and Me the account's
 * figure: named, each freezes its own, so the one that arrives reads what the one that leaves wrote, and never the
 * value that one had frozen when it arrived itself (measured 9 Oct 2026: Me showed Home's old figure for an image).
 */
const slotOf = (key: string, screen: string) => `${screen}|${seenKey(key)}`;

function snapshot(key: string, initial: Seen, screen = ""): number | undefined {
  const slot = slotOf(key, screen);
  if (!onThisScreen.has(slot)) onThisScreen.set(slot, keptFrom(initial).get(seenKey(key)));
  return onThisScreen.get(slot);
}

/** What this device last saw under this key, the same on the server and in the browser's first render. */
export function useSeen(key: string, screen = ""): number | undefined {
  const initial = useContext(SeenContext);
  return useSyncExternalStore(neverChanges, () => snapshot(key, initial, screen), () => initial[seenKey(key)]);
}

/** Written for the next screen, silently: telling this one would move a number mid-count. */
export function writeSeen(key: string, value: number): void {
  const name = seenKey(key);
  if (kept === null) kept = new Map();
  const current = Object.fromEntries(kept);
  kept.set(name, value);
  try {
    document.cookie = `${SEEN_COOKIE}=${seenCookieWith(current, name, value)}; path=/; max-age=${SEEN_MAX_AGE_SECONDS}; samesite=lax`;
  } catch {
    // A browser that keeps no cookie sees every visit as a first one: nothing plays, which is harmless.
  }
}

/** The screen that read this key is going: the next one reads what was written since. */
export function forgetOnThisScreen(key: string, screen = ""): void {
  onThisScreen.delete(slotOf(key, screen));
}

const many = new Map<string, readonly (number | undefined)[]>();
const manyOnServer = new WeakMap<Seen, Map<string, readonly (number | undefined)[]>>();

/** Several keys at once, for an arrival over a list of gifts: one frozen array per screen, the same on both sides. */
export function useSeenMany(keys: readonly string[]): readonly (number | undefined)[] {
  const initial = useContext(SeenContext);
  const joined = keys.map(seenKey).join("|");
  const client = () => {
    const cached = many.get(joined);
    const fresh = keys.map((key) => snapshot(key, initial));
    if (cached && cached.length === fresh.length && cached.every((value, index) => value === fresh[index])) return cached;
    many.set(joined, fresh);
    return fresh;
  };
  const server = () => {
    let byKeys = manyOnServer.get(initial);
    if (!byKeys) manyOnServer.set(initial, (byKeys = new Map()));
    const cached = byKeys.get(joined);
    if (cached) return cached;
    const fresh = keys.map((key) => initial[seenKey(key)]);
    byKeys.set(joined, fresh);
    return fresh;
  };
  return useSyncExternalStore(neverChanges, client, server);
}
