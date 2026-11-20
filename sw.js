// Offline support. The app shell is precached on install; after that every
// same-origin GET is served from the cache first and refreshed in the
// background (stale-while-revalidate), so a new deploy shows up on the
// launch after next without a manual version bump. Bump CACHE to force a
// clean slate (e.g. after removing files).
const CACHE = "rto-v1";
const SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/app.css",
  "js/app.js",
  "js/store.js",
  "js/calc.js",
  "js/charts.js",
  "js/storage.js",
  "vendor/lume-js/index.mjs",
  "vendor/lume-js/addons.mjs",
  "vendor/lume-js/handlers.mjs",
  "vendor/lume-js/shared-B6kzJYNx.mjs",
  "vendor/lume-js/shared-D6eU3LnD.mjs",
  "vendor/lume-js/shared-DmpHYKx7.mjs",
  "icons/icon.svg",
  "icons/icon-180.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const key = req.mode === "navigate" ? "index.html" : req;
      const cached = await cache.match(key, { ignoreSearch: req.mode === "navigate" });
      const network = fetch(req)
        .then((res) => {
          if (res.ok && res.type === "basic") cache.put(key, res.clone());
          return res;
        })
        .catch(() => null);
      if (cached) {
        event.waitUntil(network);
        return cached;
      }
      return (await network) ?? new Response("Offline", { status: 503, statusText: "Offline" });
    }),
  );
});
