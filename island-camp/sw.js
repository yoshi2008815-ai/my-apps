// 島キャンプ思い出マップ Service Worker
const CACHE = 'island-camp-v7';
const ASSETS = [
  './',
  './index.html',
  './geo.js',
  './app.js',
  './data.js',
  './islemap.js',
  './miyake.js',
  './manifest.json',
  './icon.svg',
  './icon-maskable.svg'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ネットワーク優先：常に最新を取得しキャッシュ更新。オフライン時のみキャッシュにフォールバック。
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request).then(hit => hit || caches.match('./index.html')))
  );
});
