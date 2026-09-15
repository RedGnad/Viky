"use client";
import { useEffect, useState, useSyncExternalStore } from "react";

// Kept from the Foundation template. Rendered only after a recipient's first successful check-in,
// never on the landing page: installation is offered, never required.

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

const isIOS = () => {
  if (typeof window === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
};

const isStandalone = () => {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return Boolean(nav.standalone) || window.matchMedia("(display-mode: standalone)").matches;
};

const never = () => () => {};
const serverFalse = () => false;

export const InstallPWA = () => {
  const [supportsPWA, setSupportsPWA] = useState(false);
  const [promptInstall, setPromptInstall] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);
  // Platform facts are read once on the client; the server renders as if neither applied.
  const isIOSDevice = useSyncExternalStore(never, isIOS, serverFalse);
  const isInStandalone = useSyncExternalStore(never, isStandalone, serverFalse);

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setSupportsPWA(true);
      setPromptInstall(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (isInStandalone) return null;
  if (!supportsPWA && !isIOSDevice) return null;

  return (
    <div className="fixed right-6 bottom-6 z-50">
      <div className="max-w-sm rounded-[var(--radius-card)] border border-[var(--divider)] bg-[var(--surface)] p-[var(--space-lg)] shadow-lg">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <h4 className="text-sm font-semibold">Keep Viky on your home screen</h4>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              One tap to see your progress. Optional.
            </p>
          </div>
          {supportsPWA && !isIOSDevice ? (
            <button
              type="button"
              onClick={() => promptInstall?.prompt()}
              className="inline-flex min-h-[var(--tap-target)] items-center rounded-full border border-[var(--control-border)] bg-[var(--accent)] px-[var(--space-lg)] text-[length:var(--type-help)] font-medium text-[var(--on-accent)]"
            >
              Add
            </button>
          ) : isIOSDevice ? (
            <button
              type="button"
              onClick={() => setShowIOSInstructions((value) => !value)}
              className="inline-flex min-h-[var(--tap-target)] items-center rounded-full border border-[var(--control-border)] bg-[var(--accent)] px-[var(--space-lg)] text-[length:var(--type-help)] font-medium text-[var(--on-accent)]"
            >
              How?
            </button>
          ) : null}
        </div>
        {showIOSInstructions && isIOSDevice ? (
          <ol className="mt-4 list-decimal space-y-1 border-t border-[var(--divider)] pt-4 pl-4 text-xs">
            <li>Tap the Share button.</li>
            <li>Scroll down and tap &quot;Add to Home Screen&quot;.</li>
            <li>Tap &quot;Add&quot;.</li>
          </ol>
        ) : null}
      </div>
    </div>
  );
};
