/* Nova Go — service worker.
 * ===========================================================================
 * The problem this solves: a customer standing on a Karachi street with one
 * bar of signal reloads the app, and Chrome shows them the offline dinosaur.
 * They don't conclude "my signal is bad" — they conclude the app is broken,
 * and they open Bykea instead.
 *
 * What this does NOT do: it does not cache API responses. A cached fare, a
 * cached rider position or a cached trip status is worse than an error,
 * because it's confidently wrong. Every /api/ request goes to the network,
 * every time, and fails honestly if the network isn't there.
 *
 * So: the SHELL is cached (HTML, CSS, JS, icons) so the app always opens and
 * can explain itself. The DATA is never cached.
 * ===========================================================================
 */

// Bump this on every deploy that changes a cached file. Old caches are
// deleted on activate, so a stale shell can't survive a release.
// Bump on any change to SHELL — an old cache serving the previous asset list
// is how a user ends up on a half-updated app.
const VERSION = "novago-v7";
const SHELL_CACHE = `${VERSION}-shell`;

// Only same-origin, non-critical-path assets. Deliberately small: a service
// worker that tries to pre-cache everything fails on the one file that 404s
// and then installs nothing at all.
const SHELL = [
  "./customer.html",
  "./driver.html",
  "./offline.html",
  "./css/tokens.css",
  "./css/base.css",
  "./css/components.css",
  "./css/animations.css",
  "./css/premium.css",
  "./css/fonts.css",
  // Latin only. The latin-ext files are twice the size and are needed by
  // almost nobody here, so they stay on-demand rather than in the shell.
  "./fonts/inter-var-latin.woff2",
  "./fonts/sora-var-latin.woff2",
  "./js/app.js",
  "./js/router.js",
  "./favicon.svg",
  "./icons/icon-192.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // addAll() is all-or-nothing — one missing file and the whole install
      // fails. Add individually so a renamed asset degrades instead of
      // disabling offline support entirely.
      await Promise.all(
        SHELL.map((url) => cache.add(url).catch(() => {
          console.warn("[NovaGo SW] could not cache", url);
        })),
      );
      // Take over immediately rather than waiting for every tab to close.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

/** Anything that must never be served from cache. */
function isLiveData(url) {
  return (
    url.pathname.includes("/api/") ||
    url.pathname.includes("/socket.io/") ||
    // Map tiles, geocoding and routing are all live lookups.
    url.hostname.includes("basemaps.cartocdn.com") ||
    url.hostname.includes("nominatim") ||
    url.hostname.includes("photon.komoot.io") ||
    url.hostname.includes("project-osrm.org")
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Never interfere with anything that changes state. A cached POST would be
  // a duplicate booking.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (isLiveData(url)) return; // straight to network, no SW involvement

  // Navigations: network first, so a deployed update is picked up
  // immediately; fall back to cache, then to a real offline page.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(SHELL_CACHE);
          cache.put(request, fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match(request);
          if (cached) return cached;
          return (await caches.match("./offline.html")) ||
            new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
        }
      })(),
    );
    return;
  }

  // Same-origin assets: cache first (they're versioned by the cache name),
  // revalidating in the background so the next load is current.
  if (url.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        const network = fetch(request)
          .then((res) => {
            if (res && res.status === 200) {
              caches.open(SHELL_CACHE).then((c) => c.put(request, res.clone()));
            }
            return res;
          })
          .catch(() => null);
        return cached || (await network) ||
          new Response("", { status: 504 });
      })(),
    );
  }
});
