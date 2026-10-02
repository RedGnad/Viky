"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ME as W } from "@/src/sentences";
import { BODY, HELP, SECONDARY_BUTTON, SMALL_BUTTON } from "../components/ui";
import { Act } from "./RoundControls";
import { Sheet } from "./Sheet";

/**
 * Installing Viky on the phone, offered on Me and never required (D138).
 *
 * It says nothing about being installed. A page cannot know that: `display-mode: standalone` says only that this
 * window was opened from the icon, and a browser stops firing the install prompt while it believes the app is
 * there, which on Android outlives removing the icon. The founder uninstalled it and the screen still read "Viky is
 * on this phone", with no way to install it again. So the rule is web.dev's own: offer the way in, hide it while
 * this window is already the installed one, and never make a claim about the phone.
 *
 * Three states and no fourth: the window runs installed, and there is nothing to offer; the browser gave us its
 * prompt, and the button fires it; nothing gave us anything, and the sentence says where the browser keeps it,
 * which is the only honest path left on Safari and on a Chrome that has stopped offering.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

const isIOS = () => typeof window !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);
/** Whether this window is the installed app (Safari's own flag, or the display mode every other engine reports). */
export const isStandalone = () => {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return Boolean(nav.standalone) || window.matchMedia("(display-mode: standalone)").matches;
};
/** The display mode is live: a window can become the installed one without a reload, and back. */
const watchDisplayMode = (changed: () => void) => {
  const media = window.matchMedia("(display-mode: standalone)");
  media.addEventListener("change", changed);
  window.addEventListener("appinstalled", changed);
  return () => {
    media.removeEventListener("change", changed);
    window.removeEventListener("appinstalled", changed);
  };
};
const never = () => () => {};
const serverFalse = () => false;

/** What the browser gave for installing: its prompt when it has one, and whether this window is the installed app. */
function useInstall() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const onIOS = useSyncExternalStore(never, isIOS, serverFalse);
  const standalone = useSyncExternalStore(watchDisplayMode, isStandalone, serverFalse);

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);
  return { prompt, onIOS, standalone };
}

/**
 * Installing, as one of Me's round controls (the founder's rule 6 of 1 Oct 2026): two words, and where the browser
 * gave no prompt, how to do it by hand is said in a sheet after the press, not in a line standing on the page.
 */
export function InstallAct() {
  const { prompt, onIOS, standalone } = useInstall();
  const [how, setHow] = useState(false);
  if (standalone) return null;
  return (
    <>
      <Act name={W.installShort} onPress={() => (prompt ? void prompt.prompt() : setHow(true))} data-decide="install">
        <svg aria-hidden focusable="false" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 4v11" />
          <path d="m7 10 5 5 5-5" />
          <path d="M5 20h14" />
        </svg>
      </Act>
      <Sheet open={how} title={W.install} onClose={() => setHow(false)}>
        <p className={BODY}>{onIOS ? W.installHow : W.installByHand}</p>
      </Sheet>
    </>
  );
}

export function Install({ quiet = false }: Readonly<{ quiet?: boolean }> = {}) {
  const { prompt, onIOS, standalone } = useInstall();
  const [showHow, setShowHow] = useState(false);

  // This window is the installed one: there is nothing to offer, and nothing to say about the phone.
  if (standalone) return null;
  // On the page without an account it is a line among the others, because somebody who has not signed in has more
  // to do than install anything; on Me it is the button it has always been (D139).
  if (quiet) {
    return (
      <button
        type="button"
        onClick={() => (prompt ? void prompt.prompt() : setShowHow((value) => !value))}
        className={SMALL_BUTTON}
      >
        {W.install}
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-[var(--space-sm)]">
      <button type="button" onClick={() => (prompt ? void prompt.prompt() : setShowHow((value) => !value))} className={SECONDARY_BUTTON}>
        {W.install}
      </button>
      {showHow || (!prompt && onIOS) ? <p className={HELP}>{onIOS ? W.installHow : W.installByHand}</p> : null}
    </div>
  );
}
