"use client";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { installedOnTheHomeScreen } from "./mera";
import { accountsAreMadeAt, doorOf, readDoor, type Door } from "./passkey-support";

/**
 * The account's door, read once for the whole page and known from its first image (the founder, 1 Oct 2026).
 *
 * The server is told which browser asks, and that alone says whether the page sits inside another app's page: so a
 * gift opened from an Instagram message is drawn with "Open in Safari" as it arrives, and never with a button that
 * cannot work until the page has woken. What the device says of itself is asked in the browser, after.
 */
const DoorContext = createContext<Readonly<{ door: Door; origin: string }>>({ door: { kind: "checking" }, origin: "" });

export function DoorProvider({ userAgent, origin, children }: Readonly<{ userAgent: string; origin: string; children: ReactNode }>) {
  const [door, setDoor] = useState<Door>(() => {
    // The server cannot know whether an iPhone page that is no browser is Viky's own installed app: that one waits
    // for the browser. Everything it can know is in the first image.
    const first = doorOf({ userAgent, hasWebAuthn: true, platformAuthenticator: null, standalone: null });
    return first.kind === "elsewhere" || first.kind === "outdated" ? first : { kind: "checking" };
  });
  useEffect(() => {
    let live = true;
    void readDoor(installedOnTheHomeScreen()).then((read) => {
      if (live) setDoor(read);
    });
    return () => {
      live = false;
    };
  }, []);
  const value = useMemo(() => ({ door, origin }), [door, origin]);
  return <DoorContext.Provider value={value}>{children}</DoorContext.Provider>;
}

export function useDoor(): Door {
  return useContext(DoorContext).door;
}

/** Whether an account may be made on the address this page is served from, known from its first image as the door is. */
export function useMadeHere(): boolean {
  const origin = useContext(DoorContext).origin;
  // A screen drawn with no page around it names no address: the gesture itself still refuses (src/account/mera.ts).
  return origin === "" || accountsAreMadeAt(origin);
}

/** Where the page is served from, as the server read it: the start of the link a page names as its own. */
export function usePageOrigin(): string {
  return useContext(DoorContext).origin;
}
