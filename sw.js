/**
 * Offline support.
 *
 * Install precaches the app shell; every same-origin GET is then served
 * from the cache and refreshed in the background (stale-while-revalidate).
 *
 * Both network paths bypass the browser's HTTP cache. GitHub Pages sends
 * `Cache-Control: max-age=600`, so a plain fetch() could hand back the
 * previous deploy for ten minutes and fill a new cache with old files.
 * `reload` always fetches fresh; `no-cache` revalidates (cheap 304s).
 *
 * Bump CACHE_NAME on every release that changes shipped files.
 */
const CACHE_NAME = "rto-v7";

const APP_SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "assets/icons/icon.svg",
  "assets/icons/icon-180.png",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
  "src/styles/tokens.css",
  "src/styles/base.css",
  "src/styles/layout.css",
  "src/styles/components.css",
  "src/styles/forms.css",
  "src/styles/dialogs.css",
  "src/js/main.js",
  "src/js/version.js",
  "src/js/domain/backup.js",
  "src/js/domain/constants.js",
  "src/js/domain/dates.js",
  "src/js/domain/holidays.js",
  "src/js/domain/days.js",
  "src/js/domain/rounding.js",
  "src/js/domain/shift.js",
  "src/js/domain/stats.js",
  "src/js/domain/time.js",
  "src/js/domain/types.js",
  "src/js/domain/verification.js",
  "src/js/lib/format.js",
  "src/js/state/model.js",
  "src/js/state/persistence.js",
  "src/js/state/store.js",
  "src/js/ui/actions.js",
  "src/js/ui/dialogs.js",
  "src/js/ui/dom.js",
  "src/js/ui/tabs.js",
  "src/js/ui/theme.js",
  "src/js/ui/updates.js",
  "src/js/ui/components/bar-chart.js",
  "src/js/ui/components/stat-grid.js",
  "src/js/ui/views/alerts.js",
  "src/js/ui/views/charts.js",
  "src/js/ui/views/day-dialog.js",
  "src/js/ui/views/history.js",
  "src/js/ui/views/month-card.js",
  "src/js/ui/views/month-summary.js",
  "src/js/ui/views/now.js",
  "src/js/ui/views/punch-dialog.js",
  "src/js/ui/views/settings.js",
  "src/js/ui/views/toast.js",
  "src/js/ui/views/verify-dialog.js",
  "vendor/lume-js/index.mjs",
  "vendor/lume-js/addons.mjs",
  "vendor/lume-js/handlers.mjs",
  "vendor/lume-js/shared-B6kzJYNx.mjs",
  "vendor/lume-js/shared-D6eU3LnD.mjs",
  "vendor/lume-js/shared-DmpHYKx7.mjs",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL.map((url) => new Request(url, { cache: "reload" }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(staleWhileRevalidate(event, request));
});

/**
 * @param {FetchEvent} event
 * @param {Request} request
 */
async function staleWhileRevalidate(event, request) {
  const cache = await caches.open(CACHE_NAME);
  // Every navigation is the single-page app shell.
  const key = request.mode === "navigate" ? "index.html" : request;
  const cached = await cache.match(key, { ignoreSearch: request.mode === "navigate" });

  const network = fetch(request.url, { cache: "no-cache" })
    .then((response) => {
      if (response.ok && response.type === "basic") cache.put(key, response.clone());

      return response;
    })
    .catch(() => null);

  if (cached) {
    event.waitUntil(network);

    return cached;
  }

  return (await network) ?? new Response("Offline", { status: 503, statusText: "Offline" });
}
