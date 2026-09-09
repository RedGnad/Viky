"use client";
import { useEffect, useState } from "react";

// Web push subscription, kept from the Foundation template without its blocking alerts. Not
// rendered on the landing page; wired to a server-side store with the first product screens.

const base64ToUint8Array = (base64: string) => {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalised);
  const output = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) output[index] = raw.charCodeAt(index);
  return output;
};

export default function PushSubscription() {
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready.then((reg) => {
      setRegistration(reg);
      reg.pushManager.getSubscription().then((existing) => {
        if (existing) setSubscription(existing);
      });
    });
  }, []);

  const subscribe = async () => {
    const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY;
    if (!publicKey || !registration) {
      setStatus("Notifications are not configured.");
      return;
    }
    try {
      const created = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ToUint8Array(publicKey),
      });
      setSubscription(created);
      setStatus("Notifications on.");
    } catch {
      setStatus("Notifications could not be turned on.");
    }
  };

  const unsubscribe = async () => {
    if (!subscription) return;
    await subscription.unsubscribe();
    setSubscription(null);
    setStatus("Notifications off.");
  };

  const sendTest = async () => {
    if (!subscription) return;
    const response = await fetch("/api/notification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription, title: "Viky", message: "Notifications are working." }),
    });
    setStatus(response.ok ? "Test sent." : "Test could not be sent.");
  };

  return (
    <div className="space-y-2 text-sm">
      <div className="flex gap-2">
        <button type="button" onClick={subscribe} disabled={Boolean(subscription)} className="rounded-lg border px-3 py-1">
          Turn on notifications
        </button>
        <button type="button" onClick={unsubscribe} disabled={!subscription} className="rounded-lg border px-3 py-1">
          Turn off
        </button>
        <button type="button" onClick={sendTest} disabled={!subscription} className="rounded-lg border px-3 py-1">
          Send a test
        </button>
      </div>
      {status ? <p style={{ color: "var(--muted)" }}>{status}</p> : null}
    </div>
  );
}
