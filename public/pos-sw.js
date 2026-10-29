/*
 * The till's offline helper, registered by src/components/pos/till-offline.ts
 * for the till's pages (/pos). It keeps the till page, the build files it
 * needs and product photos on the device, so the till opens and sells with no
 * internet. Sales themselves wait in the page's own storage, not here.
 * Change VERSION when the way files are kept changes.
 */
const VERSION = "1";
const PAGE_CACHE = "boamah-till-page"; // the till page; names the signed-in cashier, cleared at sign out
const DATA_CACHE = "boamah-till-data"; // the product list, written by the page itself
const STATIC_CACHE = `boamah-till-static-${VERSION}`;
const IMAGE_CACHE = `boamah-till-images-${VERSION}`;
const KEEP = [PAGE_CACHE, DATA_CACHE, STATIC_CACHE, IMAGE_CACHE];

const TILL_PAGE = "/pos";
const SIGN_IN_PAGE = "/pos/login";
const MAX_STATIC = 400;
const MAX_IMAGES = 1500;
/** Photos can be replaced under the same address, so a saved one older than this is fetched again in the background. */
const IMAGE_REFRESH_MS = 86_400_000;
/** On a slow connection the saved page opens after this long, and the fresh one is saved for next time. */
const PAGE_TIMEOUT_MS = 4000;
const TRIM_EVERY = 25;

const OFFLINE_PAGE = `<!doctype html>
<html lang="en-GH">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Till offline</title>
<style>
body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; font: 16px/1.5 system-ui, sans-serif; background: #f4f6f3; color: #1d2a22; }
main { max-width: 26rem; margin: 1rem; padding: 1.5rem; background: #fff; border: 1px solid #dfe5dc; border-radius: 0.75rem; text-align: center; }
h1 { margin: 0 0 0.5rem; font-size: 1.25rem; }
a { display: inline-block; margin-top: 1rem; padding: 0.6rem 1.2rem; border-radius: 0.5rem; background: #174d33; color: #fff; font-weight: 600; text-decoration: none; }
</style>
</head>
<body>
<main>
<h1>No internet connection</h1>
<p>Signing in to the till needs the internet. Once a cashier has signed in and opened the till on this device, it keeps working when the connection drops.</p>
<a href="/pos">Try again</a>
</main>
</body>
</html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name.startsWith("boamah-till-") && !KEEP.includes(name)).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data;
  // Only the till's own pages ask for files to be kept.
  const from = event.source && "url" in event.source ? new URL(event.source.url) : null;
  if (!from || from.origin !== self.location.origin || !from.pathname.startsWith(TILL_PAGE)) return;
  if (data && data.type === "warm") event.waitUntil(warm(data));
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    if (url.pathname === TILL_PAGE || url.pathname === `${TILL_PAGE}/`) {
      const network = fetch(request);
      // Saved before the page is handed over, so its body is copied first.
      event.waitUntil(network.then(rememberPage(generation), () => undefined));
      event.respondWith(tillPage(network));
    } else if (url.pathname.startsWith(`${TILL_PAGE}/`)) {
      const network = fetch(request);
      if (url.pathname === SIGN_IN_PAGE) event.waitUntil(network.then(forgetIfSignedOut, () => undefined));
      event.respondWith(network.catch(offlinePage));
    }
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname === "/icon.svg" || url.pathname === "/pos-manifest.webmanifest") {
    event.respondWith(cacheFirst(event, STATIC_CACHE, MAX_STATIC));
  } else if (url.pathname === "/_next/image" || url.pathname.startsWith("/images/") || url.pathname.startsWith("/uploads/")) {
    event.respondWith(cacheFirst(event, IMAGE_CACHE, MAX_IMAGES, IMAGE_REFRESH_MS));
  }
  // Everything else, the till's API included, goes straight to the network.
});

/**
 * Bumped whenever the saved till is forgotten, so a page fetched before that
 * (still on its way) is not saved again afterwards.
 */
let generation = 0;

async function forgetTill() {
  generation += 1;
  await Promise.all([caches.delete(PAGE_CACHE), caches.delete(DATA_CACHE)]);
}

/** The sign in page itself is only shown to someone not signed in to the till: whatever till was saved is no longer theirs. */
function forgetIfSignedOut(response) {
  return response.ok && response.type === "basic" ? forgetTill() : undefined;
}

/** Keeps the till page for offline use, or forgets it once the cashier is signed out. */
function rememberPage(startedAt) {
  return (response) => {
    if (response.type === "opaqueredirect" || response.status === 401 || response.status === 403) return forgetTill();
    if (!response.ok || response.type !== "basic") return undefined;
    const copy = response.clone();
    return caches.open(PAGE_CACHE).then((cache) => (generation === startedAt ? cache.put(TILL_PAGE, copy) : undefined));
  };
}

async function tillPage(network) {
  try {
    return await withTimeout(network, PAGE_TIMEOUT_MS);
  } catch {
    const saved = await caches.open(PAGE_CACHE).then((cache) => cache.match(TILL_PAGE));
    if (saved) return saved;
    return network.catch(offlinePage);
  }
}

function offlinePage() {
  return new Response(OFFLINE_PAGE, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

let saves = 0;

function savedLongAgo(response, maxAgeMs) {
  const date = Date.parse(response.headers.get("date") ?? "");
  return Number.isNaN(date) || Date.now() - date > maxAgeMs;
}

async function fetchAndKeep(event, cache, cacheName, max) {
  const response = await fetch(event.request);
  if (response.ok && response.type === "basic") {
    const copy = response.clone();
    event.waitUntil(
      cache.put(event.request, copy).then(() => {
        saves += 1;
        return saves % TRIM_EVERY === 0 ? trim(cacheName, max) : undefined;
      }),
    );
  }
  return response;
}

/**
 * Build files never change under the same name, and photos rarely do, so the
 * saved copy is used first. With refreshAfterMs, an old saved copy is still
 * shown but fetched again in the background for next time.
 */
async function cacheFirst(event, cacheName, max, refreshAfterMs) {
  const cache = await caches.open(cacheName);
  const saved = await cache.match(event.request, { ignoreVary: true });
  if (!saved) return fetchAndKeep(event, cache, cacheName, max);
  if (refreshAfterMs && savedLongAgo(saved, refreshAfterMs)) event.waitUntil(fetchAndKeep(event, cache, cacheName, max).catch(() => undefined));
  return saved;
}

/** Drops the oldest saved files beyond the limit. */
async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - max)).map((key) => cache.delete(key)));
}

function isBuildFile(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value, self.location.origin);
    return url.origin === self.location.origin && url.pathname.startsWith("/_next/static/");
  } catch {
    return false;
  }
}

/** The page lists the build files it loaded before this helper was looking after it; the page itself comes too when asked. */
async function warm(data) {
  const cache = await caches.open(STATIC_CACHE);
  const wanted = (Array.isArray(data.assets) ? data.assets : []).filter(isBuildFile).slice(0, MAX_STATIC);
  await Promise.all(
    wanted.map(async (url) => {
      if (await cache.match(url)) return;
      try {
        const response = await fetch(url);
        if (response.ok) await cache.put(url, response);
      } catch {
        // Offline: it is fetched when next used.
      }
    }),
  );
  if (data.page === true) {
    try {
      const startedAt = generation;
      await rememberPage(startedAt)(await fetch(TILL_PAGE, { credentials: "same-origin", redirect: "manual" }));
    } catch {
      // Offline: the page is saved on its next load.
    }
  }
  await trim(STATIC_CACHE, MAX_STATIC);
}
