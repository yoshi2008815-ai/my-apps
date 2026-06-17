/**
 * Service Worker for ハーモニーブライダル PWA
 * GitHub Pages 対応：サブパス（/<repo>/）配信下でも動作するよう
 * SW のスコープを self.registration.scope から自動算出する。
 */
const CACHE_VERSION = 'harmony-v1.0.1';
const STATIC_CACHE  = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// SW自身が登録されたディレクトリを基準とする
const BASE = new URL('./', self.location.href).pathname;

const STATIC_ASSETS = [
  '',
  'index.html',
  'manifest.json',
  'css/main.css',
  'css/member.css',
  'css/admin.css',
  'js/seed.js',
  'js/store.js',
  'js/auth.js',
  'js/app.js',
  'member/login.html',
  'member/dashboard.html',
  'member/introductions.html',
  'member/search.html',
  'member/events.html',
  'member/board.html',
  'member/applications.html',
  'member/documents.html',
  'member/settings.html',
  'member/options.html',
  'member/videos.html',
  'member/inquiry.html',
  'member/notifications.html',
  'member/profile.html',
  'member/mypage.html',
  'admin/login.html',
  'admin/dashboard.html',
  'admin/members.html',
  'admin/events.html',
  'admin/notifications.html',
  'admin/inquiries.html',
].map((p) => BASE + p);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Some static assets failed to cache:', err);
      }))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
            .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // YouTube embeds — pass through, never cache
  if (url.hostname.includes('youtube.com') || url.hostname.includes('ytimg.com')) {
    return;
  }

  // Google Fonts — cache after first fetch
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const resp = await fetch(req);
          if (resp.ok) cache.put(req, resp.clone());
          return resp;
        } catch {
          return cached || new Response('', { status: 504 });
        }
      })
    );
    return;
  }

  // Same-origin: stale-while-revalidate
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetchPromise = fetch(req).then((resp) => {
          if (resp.ok) {
            caches.open(STATIC_CACHE).then((c) => c.put(req, resp.clone()));
          }
          return resp;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  event.respondWith(
    fetch(req).catch(() => caches.match(req))
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
