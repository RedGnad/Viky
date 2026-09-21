"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ME as W } from "@/src/sentences";
import { HELP, SECONDARY_BUTTON } from "../components/ui";

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
const isStandalone = () => {
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

export function Install() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showHow, setShowHow] = useState(false);
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

  // This window is the installed one: there is nothing to offer, and nothing to say about the phone.
  if (standalone) return null;
  return (
    <div className="flex flex-col gap-[var(--space-sm)]">
      <button type="button" onClick={() => (prompt ? void prompt.prompt() : setShowHow((value) => !value))} className={SECONDARY_BUTTON}>
        {W.install}
      </button>
      {showHow || (!prompt && onIOS) ? <p className={HELP}>{onIOS ? W.installHow : W.installByHand}</p> : null}
    </div>
  );
}
