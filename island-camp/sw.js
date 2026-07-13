// 島キャンプ思い出マップ Service Worker
const CACHE = 'island-camp-v16';
const V = '16'; // index.html の <script src="...?v="> と合わせる
const ASSETS = [
  './',
  './index.html',
  `./geo.js?v=${V}`,
  `./app.js?v=${V}`,
  `./data.js?v=${V}`,
  `./islemap.js?v=${V}`,
  `./media.js?v=${V}`,
  `./miyake.js?v=${V}`,
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
// ページ(HTML)は cache:'no-cache' でブラウザHTTPキャッシュを迂回し、必ずサーバーへ再確認する
// （Cache-Controlヘッダの無いサーバーで古いHTMLが使い回される問題への対策）。
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const isNav = e.request.mode === 'navigate' || e.request.destination === 'document';
  e.respondWith(
    fetch(e.request, isNav ? {cache: 'no-cache'} : undefined).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request).then(hit => hit || caches.match('./index.html')))
  );
});
