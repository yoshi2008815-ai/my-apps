// 島キャンプ思い出マップ Service Worker
const CACHE = 'island-camp-v230';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './data.js',
  './geo.js',
  './sync.js',
  './kankomap.js',
  './media.js',
  './manifest.json',
  './icon.svg',
  './icon-maskable.svg'
];

// キャッシュ許可リスト方式:
//  - 同一オリジン … ネットワーク優先＋キャッシュ（オフラインでも開ける）
//  - unpkg.com（Leaflet） … キャッシュ優先（バージョン固定URLのため安全）
//  - それ以外の外部（GitHub API・地図タイル等） … SWを素通し（常に最新／容量肥大防止）
const CDN_HOSTS = ['unpkg.com'];

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

// 正常レスポンスのみキャッシュに保存して返す（エラーページで良品を汚染しない）
// allowOpaque: no-cors のCDN応答は status が読めない（type:'opaque'）ため明示的に許可
function fetchAndCache(request, allowOpaque) {
  return fetch(request).then(res => {
    if (res.ok || (allowOpaque && res.type === 'opaque')) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(request, copy)).catch(() => {});
    }
    return res;
  });
}

// 自サイトのファイル: ネットワーク優先（更新がすぐ届く）、オフライン時はキャッシュ
// CDN（Leaflet）: キャッシュ優先
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetchAndCache(e.request).catch(() =>
        caches.match(e.request).then(hit => {
          if (hit) return hit;
          // HTMLの代替はページ遷移のみ（JS/JSONにHTMLを返さない）
          if (e.request.mode === 'navigate') return caches.match('./index.html');
          return Response.error();
        })
      )
    );
    return;
  }
  if (!CDN_HOSTS.includes(url.host)) return; // GitHub API・地図タイル等は素通し
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetchAndCache(e.request, true))
  );
});
