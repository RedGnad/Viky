"use client";
import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { ZONE_COOKIE } from "../moments";

/**
 * The clock the reader keeps, as the server was told it (D160).
 *
 * A date belongs to a zone: the same moment is 25 September in New York and the 26th in London. The server draws
 * every screen now, so it has to print the reader's day and not its own, or React finds a page whose words are not
 * the ones it was sent and builds the whole thing again, which is the screen appearing to load twice.
 *
 * A cookie carries it, as it carries the currency and the appearance. Until one exists the server says UTC and the
 * browser says UTC with it, so the first render agrees; then this writes the cookie and corrects the dates on
 * screen, once, for a device that has never been here. Every visit after that is right in the first byte.
 */

const ZoneContext = createContext<string>("UTC");

export function ReaderZoneProvider({ zone, children }: Readonly<{ zone: string; children: ReactNode }>) {
  return <ZoneContext.Provider value={zone}>{children}</ZoneContext.Provider>;
}

/** The zone this browser keeps, read once and kept, so React sees the same value every time it asks. */
let here: string | undefined;
const never = () => () => {};
function browserZone(): string | undefined {
  if (here !== undefined) return here;
  try {
    here = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    here = "";
  }
  return here;
}

export function useReaderZone(): string {
  const fromTheServer = useContext(ZoneContext);
  /**
   * The browser's own zone is a value outside React, read the way React asks such a value to be read: the server's
   * answer while the page is hydrated, so the words match the ones sent, and the browser's own from then on.
   */
  const zone = useSyncExternalStore(never, () => browserZone() || fromTheServer, () => fromTheServer);
  useEffect(() => {
    if (zone === fromTheServer) return;
    try {
      const secure = window.location.protocol === "https:" ? "; secure" : "";
      document.cookie = `${ZONE_COOKIE}=${encodeURIComponent(zone)}; path=/; max-age=${365 * 24 * 60 * 60}; samesite=lax${secure}`;
    } catch {
      // A browser that refuses cookies reads its dates right here and starts from UTC again on the next page.
    }
  }, [zone, fromTheServer]);
  return zone;
}
