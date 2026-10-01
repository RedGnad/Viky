"use client";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { morningStep, type MorningStep } from "@/src/morning-message";
import { GIFT_LIVE, ME, MORNING as W } from "@/src/sentences";
import { HELP, INLINE_BUTTON, SECONDARY_BUTTON } from "../components/ui";

const L = GIFT_LIVE.climbing;

/**
 * Being told each morning, on a gift's page (N1, 17 Sep 2026).
 *
 * Viky asks for no daily gesture, so the day's outcome has to arrive without one. The person is asked only ever after
 * a press: iOS grants push to an installed web app alone, and only when the request answers a press (webkit.org, 16 Feb
 * 2023), so nothing is asked on load, on any phone. On an iPhone still in Safari there is nothing to press, because
 * there the browser has nothing to grant: installing comes first, and the two steps of it are said in full.
 *
 * Offered in the open, after the first thing that worked (the founder, 1 Oct 2026, the audit's finding P-31): under the
 * gift's card for its two people, and under the link the funder has just been given. It used to sit inside the fold
 * "How this is checked", was never offered to a funder, and on an iPhone took a press to say that installing was
 * needed. Nothing is offered to anybody without an account: both places are behind one.
 *
 * Self-contained on purpose: one line puts it on a page, and nothing outside it knows it exists.
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
function useTold(giftId: string, yours: boolean) {
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

export function MorningMessage({ giftId, yours }: { giftId: string; yours: boolean }) {
  const { step, busy, refusal, start, stop } = useTold(giftId, yours);
  if (!yours) return null;
  if (step === "unsupported") return null;
  if (step === "on") {
    return (
      <div className="gift-card-width flex flex-col gap-[var(--space-xs)]" data-told="on">
        <p className={HELP}>{W.asked}</p>
        <button type="button" onClick={() => void stop()} disabled={busy} className={SECONDARY_BUTTON}>
          {W.stop}
        </button>
      </div>
    );
  }
  // An iPhone outside the Home Screen: no button, since no press there can be granted. What to do first, and how.
  if (step === "install") {
    return (
      <div className="gift-card-width flex flex-col gap-[var(--space-xs)]" data-told="install">
        <p className={HELP}>{W.installFirst}</p>
        <p className={HELP}>{ME.installHow}</p>
      </div>
    );
  }
  return (
    <div className="gift-card-width flex flex-col gap-[var(--space-xs)]" data-told="ask">
      <button type="button" onClick={() => void start()} disabled={busy || step === "refused"} className={SECONDARY_BUTTON}>
        {W.ask}
      </button>
      {step === "refused" ? <p className={HELP}>{W.refused}</p> : null}
      {refusal ? <p className={HELP}>{refusal}</p> : null}
    </div>
  );
}

/**
 * Being told the moment a milestone is reached, or its first proof checked (the founder, 29 Sep 2026, the mockup of 19 Sep): one quiet line outside
 * the card, and a small "Turn on". The same subscription as the morning message: a milestone gift's subscribers are
 * told when it is reached (src/milestone-pass.ts, and the reading on opening in src/milestone-routes.ts), or when its
 * time runs out. A phone that refused is told how to allow it, without a button that can do nothing.
 */
export function ReachAlert({
  giftId,
  target,
  yours,
  review = false,
  hadOrNot = false,
}: Readonly<{
  giftId: string;
  target: string;
  yours: boolean;
  /** Told when a first proof's review is decided, rather than when a target is reached. */
  review?: boolean;
  /** A gift had or not: told the day it is theirs or the day its time is up, since nothing there is reached by degrees. */
  hadOrNot?: boolean;
}>) {
  const { step, busy, refusal, start, stop } = useTold(giftId, true);
  const side = yours ? "yours" : "theirs";
  if (step === "unsupported") return null;
  // A first proof held for review (the founder, 29 Sep 2026): what the person waits for is the answer, so that is what
  // they are offered to be told; the same subscription carries it (scripts/portal-pin.ts tells it).
  const ask = review ? L.reviewAlert : hadOrNot ? L.alertHadOrNot[side] : L.alert[side](target);
  const on = review ? L.reviewAlertOn : hadOrNot ? L.alertHadOrNotOn[side] : L.alertOn[side](target);
  const line = step === "on" ? on : step === "refused" ? L.alertRefused : step === "install" ? `${ask} ${L.alertInstall}` : ask;
  return (
    <div className="gift-card-width flex flex-col gap-[var(--space-xs)]" data-told={step}>
      <div className="flex items-center justify-between gap-[var(--space-md)]">
        <p className={HELP}>{line}</p>
        {step === "ask" ? (
          <button type="button" onClick={() => void start()} disabled={busy} className={`${INLINE_BUTTON} shrink-0`}>
            {L.turnOn}
          </button>
        ) : step === "on" ? (
          <button type="button" onClick={() => void stop()} disabled={busy} className={`${INLINE_BUTTON} shrink-0`}>
            {L.turnOff}
          </button>
        ) : null}
      </div>
      {/* An iPhone outside the Home Screen: the two steps of installing, said in full under what it is for. */}
      {step === "install" ? <p className={HELP}>{ME.installHow}</p> : null}
      {refusal ? <p className={HELP}>{refusal}</p> : null}
    </div>
  );
}
