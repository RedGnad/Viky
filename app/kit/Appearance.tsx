"use client";
import { useSyncExternalStore } from "react";
import { APPEARANCE as W } from "@/src/sentences";
import { applyThemeChoice, readThemeChoice, subscribeToThemeChoice, themeChoiceOnServer, type ThemeChoice } from "@/src/theme";

/**
 * The appearance control (D97, 18 Sep 2026): one icon in the header of every screen, opposite the mark.
 *
 * Three states and not two, in this order: as your device, day, night. The device is the default and stays it until
 * somebody presses, so the product and the device never disagree unless a person asked them to. The choice is kept in
 * their own browser and applied before the first paint (`THEME_BOOT_SCRIPT`), so nothing flashes on a reload.
 *
 * It is the quietest thing on the header line: an icon in the ink, never the accent, because the accent belongs to the
 * action a screen is asking for and to the destination the person is on. On the page without an account it shares that
 * line with the door, and stays the smaller of the two.
 */

const NEXT: Record<ThemeChoice, ThemeChoice> = { system: "light", light: "dark", dark: "system" };

const BUTTON =
  "inline-flex h-[var(--tap-target)] w-[var(--tap-target)] flex-none items-center justify-center rounded-full text-[var(--text)] transition-colors duration-[var(--hover-duration)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-text)] motion-reduce:transition-none [@media(hover:hover)_and_(pointer:fine)]:hover:bg-[var(--surface)]";

export function Appearance() {
  // The browser reads its own storage, the server always renders the default, and every copy of the control agrees
  // the moment one of them changes it. An effect that read storage and set state would be a cascading render.
  const choice = useSyncExternalStore(subscribeToThemeChoice, readThemeChoice, themeChoiceOnServer);
  return (
    <button type="button" aria-label={W[choice]} title={W[choice]} onClick={() => applyThemeChoice(NEXT[choice])} className={BUTTON}>
      <AppearanceIcon choice={choice} />
    </button>
  );
}

/** Three line drawings, 24 by 24, in the current colour: a circle half in shade, a sun, a moon. */
function AppearanceIcon({ choice }: Readonly<{ choice: ThemeChoice }>) {
  if (choice === "light") {
    return (
      <svg aria-hidden focusable="false" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="4.5" />
        <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6" />
      </svg>
    );
  }
  if (choice === "dark") {
    return (
      <svg aria-hidden focusable="false" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
      </svg>
    );
  }
  return (
    <svg aria-hidden focusable="false" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="8.5" />
      {/* Half of it in ink: the product taking whichever side the device is on. */}
      <path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" fill="currentColor" stroke="none" />
    </svg>
  );
}
