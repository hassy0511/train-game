/* Service worker (generated into dist/sw.js by the "service-worker" plugin in vite.config.ts).
 * Online: pages, models and the manifest come from the network first, so every open shows the latest
 * deploy (same as without a service worker). Offline: the last copies from the cache are used.
 * Hashed build files (assets/*) never change, so they are served from the cache first.
 * The whole game is cached on install, so stages not opened yet also work offline.
 * Same-origin requests only; nothing is sent anywhere else. */
const VERSION = __VERSION__;
const PRECACHE = __PRECACHE__;
const CACHE = 'wonder-go';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  // Drop hashed files from older builds; keep everything the current build lists.
  const keep = new Set(PRECACHE.map((path) => new URL(path, self.registration.scope).href));
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.keys().then((requests) =>
          Promise.all(
            requests
              .filter((request) => request.url.includes('/assets/') && !keep.has(request.url))
              .map((request) => cache.delete(request)),
          ),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    // Pages are stored under their path; "?stage=1-2&go=1" still gets the cached game page.
    const cached =
      (await cache.match(request, { ignoreVary: true })) ?? (await cache.match(request, { ignoreSearch: true, ignoreVary: true }));
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(url.pathname.includes('/assets/') ? cacheFirst(request) : networkFirst(request));
});

self.addEventListener('message', (event) => {
  if (event.data === 'version') event.source?.postMessage({ version: VERSION });
});
