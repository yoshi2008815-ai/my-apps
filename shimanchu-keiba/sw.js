const SHELL_CACHE = "shimanchu-keiba-shell-v7";
const DATA_CACHE = "shimanchu-keiba-data-v7";
const PROFILE_MANIFESTS = ["./data/yoshi.json", "./data/tsubo.json", "./data/taka.json", "./data/kosu.json"];
const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./favicon.svg",
  ...PROFILE_MANIFESTS
];

self.addEventListener("install", (event) => {
  event.waitUntil(installApp());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== SHELL_CACHE && key !== DATA_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, SHELL_CACHE, "./index.html"));
    return;
  }

  if (/\/data\/.+\.(?:json|txt)$/.test(url.pathname)) {
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }

  if (/\.(?:css|js|svg|png|webmanifest|txt)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
  }
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await cache.match(fallbackUrl);
      if (fallback) return fallback;
    }
    throw error;
  }
}


async function installApp() {
  const shellCache = await caches.open(SHELL_CACHE);
  await shellCache.addAll(SHELL_ASSETS);
  await warmProfileData();
  await self.skipWaiting();
}

async function warmProfileData() {
  const cache = await caches.open(DATA_CACHE);
  for (const manifestUrl of PROFILE_MANIFESTS) {
    try {
      const response = await fetch(manifestUrl, { cache: "no-store" });
      if (!response.ok) continue;
      await cache.put(manifestUrl, response.clone());
      const payload = await response.json();
      const shared = payload?.shared;
      if (shared?.format === "gzip-base64-chunks-v1" && Array.isArray(shared.chunks)) {
        const baseUrl = new URL(manifestUrl, self.registration.scope);
        const chunkUrls = shared.chunks.map((chunk) => new URL(chunk, baseUrl).toString());
        if (chunkUrls.length) await cache.addAll(chunkUrls);
        continue;
      }
      if (shared?.url) {
        const sharedUrl = new URL(shared.url, new URL(manifestUrl, self.registration.scope)).toString();
        const sharedResponse = await fetch(sharedUrl, { cache: "no-store" });
        if (sharedResponse.ok) await cache.put(sharedUrl, sharedResponse.clone());
      }
    } catch (error) {
      console.warn("warmProfileData skipped", manifestUrl, error);
    }
  }
}
