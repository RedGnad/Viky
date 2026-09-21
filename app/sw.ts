/// <reference lib="esnext" />
/// <reference lib="webworker" />
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheFirst, ExpirationPlugin, NetworkOnly, Serwist, StaleWhileRevalidate } from "serwist";

/**
 * The service worker: what it keeps, and what it never keeps (D155).
 *
 * What it never keeps is the whole decision. The library's default cached every page, every payload the router
 * fetches and every answer under `/api/`, network first with a fallback to the cache, for a day. On a phone, across
 * eight deploys in one day, that meant: a page served from the previous build, whose files were gone, so the page
 * loaded twice; the answer "nobody is signed in" served from the cache to somebody who was; a balance from the
 * morning. The founder saw the landing flash before every screen and every screen load twice, and nothing measured
 * on a fresh browser could see it, because a fresh browser has no yesterday.
 *
 * So a page, a payload and an answer about somebody come from the network and from nowhere else. What is kept is
 * what cannot be wrong: this build's own files, named by their content, and ours, the fonts and the drawings. The
 * build's files are kept a day rather than only for this build, so a screen left open across a deploy can still
 * load the piece it asks for next. Offline, a screen gets the one page written for that.
 */

// `self.__SW_MANIFEST` is the injection point replaced by the precache manifest at build time.
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/** This build's name, read off its own manifest, so the offline page is fetched again when the build changes. */
const buildOf = (manifest: readonly (PrecacheEntry | string)[]): string => {
  const named = manifest.map((entry) => (typeof entry === "string" ? entry : entry.url)).find((url) => /\/_next\/static\/[^/]+\/_buildManifest\.js$/.test(url));
  return named?.split("/")[3] ?? "unknown";
};

const OFFLINE = "/~offline";
const A_DAY = 24 * 60 * 60;

const serwist = new Serwist({
  // The offline page is the one thing precached, and only for this build: everything else is kept as it is used.
  precacheEntries: [{ url: OFFLINE, revision: buildOf(self.__SW_MANIFEST ?? []) }],
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      // A build's files are named by their content and never change; kept a day so a screen open across a deploy
      // can still load the piece it asks for next, which is the one way a page would otherwise load twice.
      matcher: /\/_next\/static\//i,
      handler: new CacheFirst({ cacheName: "builds", plugins: [new ExpirationPlugin({ maxEntries: 256, maxAgeSeconds: A_DAY, maxAgeFrom: "last-used" })] }),
    },
    {
      // Ours: the two faces and the drawings. Shown from the cache and refreshed behind.
      matcher: ({ request }) => request.destination === "font" || request.destination === "image",
      handler: new StaleWhileRevalidate({ cacheName: "assets", plugins: [new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 7 * A_DAY, maxAgeFrom: "last-used" })] }),
    },
    {
      // Everything else is a page, a payload, or an answer about somebody's money: the network, and only the network.
      matcher: /.*/i,
      handler: new NetworkOnly(),
    },
  ],
  fallbacks: {
    entries: [
      {
        url: OFFLINE,
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

/** What this worker keeps, by name. Anything else in the cache is a previous worker's, and it kept the wrong things. */
const KEPT = new Set(["builds", "assets"]);

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(names.filter((name) => !KEPT.has(name) && !name.startsWith("serwist-precache")).map((name) => caches.delete(name)))),
  );
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
