"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ME as W } from "@/src/sentences";
import { HELP, SECONDARY_BUTTON } from "../components/ui";

/**
 * Installing Viky on the phone, offered on Me and never required. On a browser that fires the install prompt it
 * is one button; on an iPhone it is the two-step sentence, because Safari has no prompt to fire. Nothing when
 * Viky already runs installed.
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
const never = () => () => {};
const serverFalse = () => false;

export function Install() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showHow, setShowHow] = useState(false);
  const onIOS = useSyncExternalStore(never, isIOS, serverFalse);
  const installed = useSyncExternalStore(never, isStandalone, serverFalse);

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (installed) return <p className={HELP}>{W.installed}</p>;
  if (!prompt && !onIOS) return null;
  return (
    <div className="flex flex-col gap-[var(--space-sm)]">
      <button type="button" onClick={() => (prompt ? void prompt.prompt() : setShowHow((value) => !value))} className={SECONDARY_BUTTON}>
        {W.install}
      </button>
      {showHow && onIOS ? <p className={HELP}>{W.installHow}</p> : null}
    </div>
  );
}
