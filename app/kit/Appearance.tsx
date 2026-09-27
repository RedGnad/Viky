"use client";
import { APPEARANCE as W } from "@/src/sentences";
import { useAccount } from "@/src/account/provider";
import { putJson } from "@/src/client/api";
import { MOTION } from "@/src/design-tokens";
import { applyThemeChoice } from "@/src/theme";
import { reduced } from "./Motion";

/**
 * The appearance control (D97, 18 Sep 2026): one icon in the header of every screen, opposite the mark.
 *
 * Two appearances and no third (the founder, 20 Sep 2026): the control shows the one the screen is in, sun or moon,
 * and one press takes the other. "As your device" is still what a screen does until somebody presses, but it is not a
 * state a person has to press through: showing it as a third icon meant two presses to change anything. The choice
 * is kept in their own browser and applied before the first paint (`THEME_BOOT_SCRIPT`), so nothing flashes.
 *
 * It is the quietest thing on the header line: an icon in the ink, never the accent, because the accent belongs to the
 * action a screen is asking for and to the destination the person is on. On the page without an account it shares that
 * line with the door, and stays the smaller of the two.
 */

const BUTTON =
  "inline-flex h-[var(--tap-target)] w-[var(--tap-target)] flex-none items-center justify-center rounded-full text-[var(--text)] transition-colors duration-[var(--hover-duration)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-text)] motion-reduce:transition-none [@media(hover:hover)_and_(pointer:fine)]:hover:bg-[var(--surface)]";

/**
 * Every character on the screen blinks as the light changes (D308, the founder, 28 Sep 2026): the lid of each open eye
 * closes and opens once, over the change, which is instant. Nothing moves under reduced motion.
 */
function blinkEveryone(): void {
  if (reduced()) return;
  const { themeDurationMs, easing, closedTo } = MOTION.blink;
  const closed = `scaleY(${closedTo})`;
  document.querySelectorAll<SVGElement>('[data-part="lid"]').forEach((lid) =>
    lid.animate([{ transform: "scaleY(1)" }, { transform: closed, offset: 0.4 }, { transform: "scaleY(1)" }], { duration: themeDurationMs, easing }),
  );
}

/** The appearance the screen is in right now: what was chosen, or else what the device says. */
function appearanceNow(): "light" | "dark" {
  const chosen = document.documentElement.dataset.theme;
  if (chosen === "light" || chosen === "dark") return chosen;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function Appearance() {
  const { address } = useAccount();
  /**
   * The press changes the screen, tells the device, and tells the account when there is one (D159): a choice made
   * on a phone is the choice on the laptop, and it comes back to a browser that forgot. The screen never waits for
   * the server, and a server that refuses changes nothing of what was just pressed.
   */
  const press = () => {
    const next = appearanceNow() === "dark" ? "light" : "dark";
    applyThemeChoice(next);
    blinkEveryone();
    if (address) void putJson<{ appearance: string }>("/api/account/preferences", { appearance: next }).catch(() => undefined);
  };
  // Nothing is read at render: which icon shows is the stylesheet's decision, from the same rule that paints the
  // screen, so the server draws the same control as the browser and nothing flashes. The press reads the screen.
  return (
    <button type="button" aria-label={W.toggle} title={W.toggle} onClick={press} className={BUTTON}>
      <svg aria-hidden focusable="false" className="appearance-sun" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="4.5" />
        <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6" />
      </svg>
      <svg aria-hidden focusable="false" className="appearance-moon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
      </svg>
    </button>
  );
}
