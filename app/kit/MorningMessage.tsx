"use client";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { morningStep, type MorningStep } from "@/src/morning-message";
import { GIFT_LIVE, ME, MORNING as W, YOU_DECIDE as Y } from "@/src/sentences";
import { BODY, HELP, PRIMARY_BUTTON, SECONDARY_BUTTON } from "../components/ui";
import { Sheet } from "./Sheet";

const L = GIFT_LIVE.climbing;

/**
 * Being told about a gift (N1, 17 Sep 2026): each morning for a habit, the moment it is reached for a climb, the day
 * it is theirs or its time is up for a gift had or not, and the answer of a first proof's review.
 *
 * Viky asks for no daily gesture, so the day's outcome has to arrive without one. The person is asked only ever after
 * a press: iOS grants push to an installed web app alone, and only when the request answers a press (webkit.org, 16 Feb
 * 2023), so nothing is asked on load, on any phone. On an iPhone still in Safari there is nothing to press, because
 * there the browser has nothing to grant: installing comes first, and the two steps of it are said in full.
 *
 * Offered in the open to a gift's two people (the founder, 1 Oct 2026, the audit's finding P-31), and since his rule 6
 * of the same day as one of the round controls under the card and under the link the funder has just been given
 * (app/kit/YouDecide.tsx, app/kit/FunderControls.tsx): "Messages", and this sheet after the press. It was a wide
 * button or a line with a small button, and a paragraph about the phone standing on every page.
 */

const isIOS = () => typeof window !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);
const isStandalone = () => {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return Boolean(nav.standalone) || window.matchMedia("(display-mode: standalone)").matches;
};
const never = () => () => {};
const serverFalse = () => false;
const canPush = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const permissionNow = (): "default" | "granted" | "denied" => (canPush() ? Notification.permission : "default");
const serverDefault = (): "default" => "default";

/** The VAPID public key, as the browser wants it: bytes, not text. */
function keyBytes(base64: string): BufferSource {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

type Told = { endpoint: string; keys: { p256dh: string; auth: string } };

function told(subscription: PushSubscription): Told {
  const json = subscription.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  return { endpoint: json.endpoint ?? subscription.endpoint, keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" } };
}

/** Being told about one gift on this device: where it stands, and the two presses that change it. */
export function useTold(giftId: string, yours: boolean) {
  const onIOS = useSyncExternalStore(never, isIOS, serverFalse);
  const standalone = useSyncExternalStore(never, isStandalone, serverFalse);
  const supported = useSyncExternalStore(never, canPush, serverFalse);
  // What the browser says now, until this page's own press changes it: read, never stored twice.
  const granted = useSyncExternalStore(never, permissionNow, serverDefault);
  const [asked, setAsked] = useState<"default" | "granted" | "denied" | null>(null);
  const permission = asked ?? granted;
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  useEffect(() => {
    if (!yours || !canPush()) return;
    let alive = true;
    void (async () => {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (!existing || !alive) return;
      // The same browser can be subscribed to another gift: only the server knows about this one.
      const answer = await fetch(`/api/gift/${giftId}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "check", subscription: told(existing) }),
      }).catch(() => null);
      const state = answer?.ok ? ((await answer.json()) as { on?: boolean }) : null;
      if (alive && state?.on) setSubscribed(true);
    })();
    return () => {
      alive = false;
    };
  }, [giftId, yours]);

  const start = useCallback(async () => {
    setRefusal(null);
    const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY;
    if (!publicKey) {
      setRefusal(W.failed);
      return;
    }
    setBusy(true);
    try {
      // The request answers this press and nothing else: that is the only shape iOS accepts, and the only one worth
      // asking anywhere.
      const granted = await Notification.requestPermission();
      setAsked(granted);
      if (granted !== "granted") {
        setRefusal(W.refused);
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
      const answer = await fetch(`/api/gift/${giftId}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "on", subscription: told(subscription) }),
      });
      if (!answer.ok) {
        setRefusal(W.failed);
        return;
      }
      setSubscribed(true);
    } catch {
      setRefusal(W.failed);
    } finally {
      setBusy(false);
    }
  }, [giftId]);

  const stop = useCallback(async () => {
    setBusy(true);
    setRefusal(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        await fetch(`/api/gift/${giftId}/notify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ intent: "off", subscription: told(existing) }),
        });
      }
      setSubscribed(false);
    } catch {
      setRefusal(W.failed);
    } finally {
      setBusy(false);
    }
  }, [giftId]);

  const step: MorningStep = morningStep({ supported, onIOS, standalone, permission, subscribed });
  return { step, busy, refusal, start, stop };
}

/** What a gift's messages are about: each morning for a habit, or one moment for a gift reached, had or checked. */
export type ToldAbout = Readonly<{ kind: "morning" } | { kind: "reach"; target: string } | { kind: "hadOrNot" } | { kind: "review" }>;

/**
 * "Messages", in the sheet its round button opens (the founder's rule 6 of 1 Oct 2026, you-decide.html): where being
 * told stands, and the one press that changes it. What the phone itself refuses is said here, once, after the press
 * that opened the sheet, and no longer as a paragraph standing on every page; on an iPhone outside the Home Screen
 * the two steps of installing are said here too. The words are the ones the open line under the card said.
 */
export function MessagesSheet({
  open,
  onClose,
  told,
  about,
  yours,
}: Readonly<{ open: boolean; onClose: () => void; told: ReturnType<typeof useTold>; about: ToldAbout; yours: boolean }>) {
  const { step, busy, refusal, start, stop } = told;
  const side = yours ? "yours" : "theirs";
  const morning = about.kind === "morning";
  const ask = about.kind === "review" ? L.reviewAlert : about.kind === "hadOrNot" ? L.alertHadOrNot[side] : about.kind === "reach" ? L.alert[side](about.target) : W.stopped;
  const on = about.kind === "review" ? L.reviewAlertOn : about.kind === "hadOrNot" ? L.alertHadOrNotOn[side] : about.kind === "reach" ? L.alertOn[side](about.target) : W.asked;
  const installFirst = morning ? W.installFirst : `${ask} ${L.alertInstall}`;
  return (
    <Sheet
      open={open}
      title={Y.messages}
      onClose={onClose}
      footer={
        step === "install" ? undefined : step === "on" ? (
          <button type="button" onClick={() => void stop()} disabled={busy} className={SECONDARY_BUTTON}>
            {morning ? W.stop : L.turnOff}
          </button>
        ) : (
          <button type="button" onClick={() => void start()} disabled={busy || step === "refused"} className={PRIMARY_BUTTON}>
            {morning ? W.ask : L.turnOn}
          </button>
        )
      }
    >
      <div data-told={step} className="flex flex-col gap-[var(--space-sm)]">
        <p className={BODY}>{step === "on" ? on : step === "install" ? installFirst : ask}</p>
        {/* An iPhone outside the Home Screen: the two steps of installing, said in full under what it is for. */}
        {step === "install" ? <p className={HELP}>{ME.installHow}</p> : null}
        {step === "refused" ? <p className={HELP}>{morning ? W.refused : L.alertRefused}</p> : null}
        {refusal && step !== "refused" ? <p className={HELP}>{refusal}</p> : null}
      </div>
    </Sheet>
  );
}
