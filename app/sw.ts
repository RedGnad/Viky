/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { defaultCache } from "@serwist/turbopack/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

// `self.__SW_MANIFEST` is the injection point replaced by the precache manifest at build time.
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

type PushPayload = { title?: string; message?: string; url?: string };

self.addEventListener("push", (event) => {
  let payload: PushPayload = {};
  try {
    payload = JSON.parse(event.data?.text() ?? "{}") as PushPayload;
  } catch {
    payload = {};
  }
  event.waitUntil(
    self.registration.showNotification(payload.title ?? "Viky", {
      body: payload.message ?? "",
      icon: "/icons/android-chrome-192x192.png",
      data: { url: payload.url ?? "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data as { url?: string } | undefined)?.url ?? "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      const focused = clientList.find((client) => client.focused) ?? clientList[0];
      if (focused) {
        return focused.navigate(target).then((client) => client?.focus());
      }
      return self.clients.openWindow(target);
    }),
  );
});

serwist.addEventListeners();
