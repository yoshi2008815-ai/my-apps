// ===== 島キャンプ思い出マップ : アプリ本体 =====
'use strict';

// リリース時は CHANGELOG.md に変更点を追記してからここを更新する（docs/DESIGN.md §12）
const APP_VERSION = '2.10.0';

/* ---------- 投影（緯度経度 → SVG座標） ---------- */
// 本図は本土＋佐渡・対馬・小笠原のみ。南の島々は3つの枠（沖縄・鹿児島・伊豆七島）に配置
// （観光イラストマップの構成。伊豆七島の枠が主役）
const BOUNDS = { latN: 46, latS: 30.5, lngW: 128.5, lngE: 146 };
const VW = 800, VH = 1000;
// 本土の描画先矩形（canvas全面ではなく中央上寄せ。まわりに枠のスペースを空ける）
const MAIN_RECT = { x: 120, y: 34, w: 560, h: 630 };
const INSET = { x: 12, y: 70, w: 318, h: 195, latN: 27.2, latS: 23.7, lngW: 122.5, lngE: 128.7 };
function inInset(lat, lng){ return lat < 27.0 && lng < 128.7; }
function projectMain(lat, lng){
  const x = MAIN_RECT.x + (lng - BOUNDS.lngW) / (BOUNDS.lngE - BOUNDS.lngW) * MAIN_RECT.w;
  const y = MAIN_RECT.y + (BOUNDS.latN - lat) / (BOUNDS.latN - BOUNDS.latS) * MAIN_RECT.h;
  return { x, y };
}
function project(lat, lng){
  if (inInset(lat, lng)){
    return {
      x: INSET.x + (lng - INSET.lngW) / (INSET.lngE - INSET.lngW) * INSET.w,
      y: INSET.y + (INSET.latN - lat) / (INSET.latN - INSET.latS) * INSET.h,
    };
  }
  return projectMain(lat, lng);
}

// ===== 伊豆七島の枠（主役・北斗七星ならび） =====
// 柄=大島→利島→新島→神津島、枡=神津・三宅・御蔵・八丈。
// 式根島は新島の隣の伴星（ミザールとアルコル）、青ヶ島は枡の下。
// 各島は geo.js の実海岸線シルエットをポップ配色で大きめに描く（Tシャツ映え優先）。
const IZU_BOX = { x: 560, y: 500, w: 235, h: 475 };
const IZU_DIPPER = {
  'izu-oshima':  [700, 565],
  'toshima':     [665, 642],
  'niijima':     [688, 716],
  'shikinejima': [646, 738],
  'kozushima':   [620, 800],
  'miyakejima':  [734, 786],
  'mikurajima':  [748, 872],
  'hachijojima': [644, 890],
  'aogashima':   [700, 940],
};
// シルエットの最大辺（px）と島ごとのポップカラー
const IZU_SIZE = {
  'izu-oshima': 46, 'toshima': 22, 'niijima': 34, 'shikinejima': 17, 'kozushima': 30,
  'miyakejima': 38, 'mikurajima': 26, 'hachijojima': 42, 'aogashima': 19,
};
const IZU_COLORS = {
  'izu-oshima': '#ff8a6b', 'toshima': '#ffb74d', 'niijima': '#ffe082',
  'shikinejima': '#dce775', 'kozushima': '#aed581', 'miyakejima': '#3ecfb2',
  'mikurajima': '#4fc3f7', 'hachijojima': '#b39ddb', 'aogashima': '#f48fb1',
};
// geo.js の海岸線リングを正規化して (0,0) 中心のシルエット点列にする
function izuShapePoints(id, size){
  const G = window.GEO || {};
  const ring = G.islands && G.islands[id];
  if (!ring || ring.length < 8) return null;
  const step = Math.max(1, Math.floor(ring.length / 44));
  const pts = [];
  for (let i = 0; i < ring.length; i += step) pts.push(ring[i]);
  let mnLa = 90, mxLa = -90, mnLn = 200, mxLn = 0;
  for (const [la, ln] of pts){
    if (la < mnLa) mnLa = la; if (la > mxLa) mxLa = la;
    if (ln < mnLn) mnLn = ln; if (ln > mxLn) mxLn = ln;
  }
  const kx = Math.cos((mnLa + mxLa) / 2 * Math.PI / 180);
  const w = (mxLn - mnLn) * kx, h = mxLa - mnLa;
  const s = size / (Math.max(w, h) || 1e-9);
  const cLa = (mnLa + mxLa) / 2, cLn = (mnLn + mxLn) / 2;
  return pts.map(([la, ln]) => `${((ln - cLn) * kx * s).toFixed(1)},${((cLa - la) * s).toFixed(1)}`).join(' ');
}

// ===== 鹿児島・奄美の枠（左中段・実位置なりの斜めチェーン） =====
const KAGO_BOX = { x: 12, y: 320, w: 132, h: 340 };
const KAGO_POS = {
  'tanegashima':  [118, 366],
  'yakushima':    [96, 390],
  'amami-oshima': [66, 540],
  'kikaijima':    [100, 528],
  'tokunoshima':  [46, 584],
  'okinoerabu':   [32, 617],
  'yoron':        [28, 645],
};
function islandPoint(is){
  const d = IZU_DIPPER[is.id] || KAGO_POS[is.id];
  return d ? { x: d[0], y: d[1] } : project(is.lat, is.lng);
}

/* ---------- ID・時刻ユーティリティ ---------- */
function uid(p){ return p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
// 内容から決定的に生成するID（シードや旧データの移行用。同じ内容→同じID になり端末間で重複しない）
function chash(s){
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return 'sd' + (h >>> 0).toString(36);
}
function authorName(){ return (typeof Sync !== 'undefined' && Sync.cfg().name) || ''; }
function stamp(){ return { author: authorName(), updatedAt: Date.now() }; }

/* ---------- カテゴリ定義（スポット） ---------- */
const CATS = ['キャンプ場','ビーチ','温泉','山・自然','観光','食事・店','港・交通'];
const CAT_STYLE = {
  'キャンプ場': { ico:'⛺', color:'#2e8b57' },
  'ビーチ':     { ico:'🏖', color:'#1e90ff' },
  '温泉':       { ico:'♨️', color:'#e06040' },
  '山・自然':   { ico:'🏔', color:'#5a8a3c' },
  '観光':       { ico:'📷', color:'#8a63c8' },
  '食事・店':   { ico:'🍴', color:'#e08a2e' },
  '港・交通':   { ico:'⚓', color:'#4a6a8a' },
};
function catStyle(cat){ return CAT_STYLE[cat] || { ico:'📍', color:'#667788' }; }

/* ---------- データ移行・正規化 ---------- */
// IDは共有Gist・インポートJSON経由で外部から届くため、HTML属性に安全な形へ強制する。
// ID未設定 → fallback（内容ハッシュ）をそのまま使う（端末間・バージョン間で一致させるため変えない）
// 不正なID → 決定的に振り直す（同じ不正ID→同じ新ID になり端末間で一致する）
function safeId(id, fallback){
  if (id == null || id === '') return fallback;
  if (typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id)) return id;
  return chash('fix|' + fallback + '|' + String(id));
}
// v1（文字列リスト・ID無し）→ v2（ID・作者・更新時刻つき）へ正規化。
// v2データにもそのまま適用でき、欠けたフィールドを補う。
function migrateIsland(is){
  const o = { ...is };
  o.id = safeId(o.id, chash('island|' + (o.name || '') + '|' + o.lat + ',' + o.lng));
  o.photos = Array.isArray(o.photos) ? o.photos : [];
  o.updatedAt = o.updatedAt || 0;
  o.spots = (o.spots || []).map(s => ({
    id: safeId(s.id, chash(o.id + '|sp|' + s.name)),
    name: s.name, cat: CATS.includes(s.cat) ? s.cat : '観光',
    lat: +s.lat, lng: +s.lng,
    url: s.url || '', note: s.note || '',
    author: s.author || '', updatedAt: s.updatedAt || 0,
    deleted: !!s.deleted,
  }));
  // logs のみ index を混ぜる: 同一日付・同一本文の日記が別エントリとして残るように
  o.logs = (o.logs || []).map((l, i) => ({
    id: safeId(l.id, chash(o.id + '|log|' + (l.date||'') + '|' + (l.text||'') + '#' + i)),
    date: l.date || '', text: l.text || '',
    author: l.author || '', updatedAt: l.updatedAt || 0, deleted: !!l.deleted,
  }));
  o.shops = (o.shops || []).map(s => ({
    id: safeId(s.id, chash(o.id + '|shop|' + (s.name||''))),
    name: s.name || '', type: s.type || '', note: s.note || '', url: s.url || '',
    author: s.author || '', updatedAt: s.updatedAt || 0, deleted: !!s.deleted,
  }));
  for (const key of ['knowledge','tips']){
    o[key] = (o[key] || []).map(t => typeof t === 'string'
      ? { id: chash(o.id + '|' + key + '|' + t), text: t, author: '', updatedAt: 0, deleted: false }
      : { id: safeId(t.id, chash(o.id + '|' + key + '|' + (t.text||''))), text: t.text || '',
          author: t.author || '', updatedAt: t.updatedAt || 0, deleted: !!t.deleted });
  }
  return o;
}

const LIST_KEYS = ['spots','logs','shops','knowledge','tips'];
const SCALAR_KEYS = ['name','region','pref','lat','lng','firstVisit','visits','fav','summary'];

/* ---------- マージ（共有同期・シード取り込み共通） ---------- */
// エントリ: ID で突き合わせ、updatedAt が新しい方を採用（削除フラグも同じ土俵）
function mergeLists(a, b){
  const m = new Map();
  for (const e of (a || [])) if (e && e.id) m.set(e.id, e);
  for (const e of (b || [])){
    if (!e || !e.id) continue;
    const ex = m.get(e.id);
    if (!ex || (e.updatedAt || 0) > (ex.updatedAt || 0)) m.set(e.id, e);
  }
  return [...m.values()].sort((x, y) => (x.updatedAt || 0) - (y.updatedAt || 0));
}
// 島: スカラーは updatedAt が新しい島から、リストはエントリ単位でマージ。写真はローカル優先。
// ※両引数とも migrateIsland 済みで渡すこと。
function mergeIslands(localArr, otherArr){
  const lm = new Map((localArr || []).map(i => [i.id, i]));
  const om = new Map((otherArr || []).map(i => [i.id, i]));
  const ids = [...new Set([...lm.keys(), ...om.keys()])];
  return ids.map(id => {
    const l = lm.get(id), o = om.get(id);
    if (l && !o) return l;
    if (o && !l) return { ...o, photos: [] };
    const newer = (o.updatedAt || 0) > (l.updatedAt || 0) ? o : l;
    const merged = { ...l };
    for (const k of SCALAR_KEYS) merged[k] = newer[k];
    merged.updatedAt = Math.max(l.updatedAt || 0, o.updatedAt || 0);
    for (const k of LIST_KEYS) merged[k] = mergeLists(l[k], o[k]);
    merged.photos = l.photos || [];
    return merged;
  });
}
// 同期送信用: 写真参照を除いた形（写真は端末内のみ）
function stripIsland(is){ const { photos, ...rest } = is; return rest; }
// 内容の正規形。並び順・キー順に依存しないので「実質同じデータか」の比較に使える
function canon(islands){
  const norm = (islands || []).map(is => {
    const o = { id: is.id, updatedAt: is.updatedAt || 0 };
    for (const k of SCALAR_KEYS) o[k] = is[k];
    for (const k of LIST_KEYS)
      o[k] = (is[k] || []).slice().sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    return o;
  }).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return JSON.stringify(norm);
}

/* ---------- 永続化 ---------- */
const LS_KEY = 'island-camp/islands-v2';
const LS_KEY_V1 = 'island-camp/islands-v1';

function seedIslands(){ return deepClone(window.SEED_ISLANDS || []).map(migrateIsland); }

let loadFailed = false; // 保存データのparse失敗（起動時の上書き保存を抑止する）
function loadIslands(){
  let stored = null;
  const raw = localStorage.getItem(LS_KEY) || localStorage.getItem(LS_KEY_V1);
  if (raw){
    try { stored = JSON.parse(raw); }
    catch(e){
      // 破損データはシードで上書きせず、復旧用に退避しておく
      loadFailed = true;
      try { localStorage.setItem(LS_KEY + '-corrupt', raw); } catch(e2){}
    }
  }
  if (!stored) return seedIslands();
  // 保存データを正規化し、シード（新しい島・新スポット）を取り込む。
  // 削除済みエントリは tombstone(updatedAt>0) が勝つため復活しない。
  return mergeIslands(stored.map(migrateIsland), seedIslands());
}
function saveLocal(){
  try { localStorage.setItem(LS_KEY, JSON.stringify(STATE.islands)); }
  catch(e){ toast('保存に失敗しました（容量超過の可能性）'); }
}
function saveIslands(){ saveLocal(); scheduleSync(); }
function deepClone(o){ return JSON.parse(JSON.stringify(o)); }

/* ---------- 写真・動画・ドキュメントは IndexedDB に保存 ----------
   photos: 島の写真 / media: アルバムの写真・動画（+サムネ） / files: ドキュメント
   すべて端末内のみ（共有同期の対象外） */
const AppDB = (() => {
  let dbp;
  const STORES = ['photos', 'media', 'files'];
  function open(){
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open('island-camp-photos', 2);
      r.onupgradeneeded = () => {
        const db = r.result;
        for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  function make(store){
    async function tx(mode){ return (await open()).transaction(store, mode).objectStore(store); }
    return {
      async put(id, blob){ const s = await tx('readwrite'); return new Promise((res,rej)=>{const r=s.put(blob,id); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error);}); },
      async get(id){ const s = await tx('readonly'); return new Promise((res,rej)=>{const r=s.get(id); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error);}); },
      async del(id){ const s = await tx('readwrite'); return new Promise((res,rej)=>{const r=s.delete(id); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error);}); },
      async all(){ const s = await tx('readonly'); return new Promise((res,rej)=>{const out={}; const r=s.openCursor(); r.onsuccess=e=>{const c=e.target.result; if(c){out[c.key]=c.value; c.continue();} else res(out);}; r.onerror=()=>rej(r.error);}); }
    };
  }
  return { photos: make('photos'), media: make('media'), files: make('files') };
})();
const PhotoDB = AppDB.photos;
const MediaDB = AppDB.media;
const FileDB  = AppDB.files;

/* ---------- 状態 ---------- */
const STATE = {
  islands: loadIslands(),
  activeId: null,
  view: { scale: 1, tx: 0, ty: 0 }, // 全国SVGズーム/パン
  catFilter: null, // null = 全カテゴリ表示 / Set = 選択カテゴリのみ
  viewMode: 'map', // 'map' | 'side'（横からながめる＝横並びパノラマ）
  sideTx: 0,       // 横並びビューの横スクロール量
};

const $ = sel => document.querySelector(sel);
const svg = $('#map');

/* ---------- 全国地図データ ---------- */
// 主要陸地（スムーズパス近似）
const LANDMASSES = [
  // 本州
  [[41.5,140.4],[40.5,140.0],[39.9,139.8],[38.9,139.6],[37.8,138.8],[37.2,136.7],
   [36.8,137.0],[35.5,135.9],[34.6,135.0],[34.3,135.8],[34.7,137.3],[34.6,138.9],
   [35.3,139.7],[36.1,140.6],[37.0,141.0],[38.3,141.5],[39.5,142.0],[41.0,141.5]],
  // 北海道
  [[45.5,141.7],[45.3,142.6],[44.3,143.9],[43.3,145.6],[42.9,144.4],[42.0,143.2],
   [41.5,140.9],[41.8,140.2],[42.6,139.8],[43.4,140.3],[44.4,141.6],[45.4,141.0]],
  // 九州
  [[33.9,130.9],[33.6,131.7],[32.9,131.9],[32.0,131.5],[31.0,131.0],[31.2,130.2],
   [31.9,130.6],[32.6,129.7],[33.2,129.6],[33.7,130.3]],
  // 四国
  [[34.3,134.0],[34.0,134.7],[33.5,134.3],[32.9,133.0],[33.3,132.4],[33.9,132.7],[34.2,133.3]]
];

// 訪問島の形状データ（全国図では見やすさ優先で実寸の約1.5〜2倍にデフォルメ。
// 正確な地形・位置は島選択後の詳細マップ＝地理院タイルで表示する）
const ISLAND_SHAPE_DATA = {
  // ===== 伊豆諸島 ===== (チェーン状で近接しているため慎重にサイズ設定)
  'izu-oshima': [
    [34.90,139.29],[34.92,139.36],[34.89,139.44],
    [34.78,139.47],[34.64,139.44],[34.59,139.36],[34.63,139.28]
  ],
  'niijima': [
    [34.53,139.23],[34.54,139.27],[34.53,139.31],
    [34.44,139.33],[34.30,139.31],[34.20,139.27],
    [34.18,139.23],[34.28,139.21],[34.44,139.22]
  ],
  'kozushima': [
    [34.29,139.06],[34.31,139.14],[34.29,139.21],
    [34.20,139.23],[34.11,139.20],[34.09,139.13],
    [34.11,139.06],[34.20,139.03]
  ],
  'hachijojima': [
    [33.23,139.72],[33.25,139.79],[33.22,139.86],
    [33.16,139.89],[33.10,139.88],[33.04,139.84],
    [33.00,139.77],[32.99,139.71],[33.05,139.67],
    [33.12,139.68],[33.17,139.70]
  ],
  // ===== 鹿児島の島 =====
  'yakushima': [
    [30.59,130.30],[30.61,130.51],[30.57,130.72],
    [30.44,130.80],[30.24,130.72],[30.12,130.51],
    [30.16,130.30],[30.34,130.20]
  ],
  'amami-oshima': [
    [28.76,129.34],[28.78,129.44],[28.72,129.54],
    [28.56,129.59],[28.40,129.63],[28.24,129.64],
    [28.08,129.60],[27.96,129.52],[27.88,129.42],
    [27.86,129.33],[27.94,129.26],[28.10,129.24],
    [28.28,129.25],[28.50,129.26],[28.66,129.29]
  ],
  // ===== 沖縄の島 =====
  'ishigaki': [
    [24.55,124.10],[24.56,124.22],[24.54,124.34],
    [24.46,124.40],[24.36,124.39],[24.26,124.33],
    [24.22,124.20],[24.26,124.08],[24.36,124.04],
    [24.46,124.06]
  ],
  'iriomote': [
    [24.49,123.46],[24.50,123.60],[24.49,123.75],
    [24.42,123.83],[24.32,123.82],[24.22,123.76],
    [24.20,123.62],[24.22,123.48],[24.32,123.42],[24.43,123.44]
  ],
  // ===== 新潟の島 =====
  'sado': [
    [38.50,138.18],[38.52,138.30],[38.48,138.44],
    [38.36,138.52],[38.22,138.56],[38.12,138.62],
    [38.05,138.74],[37.95,138.84],[37.83,138.86],
    [37.79,138.76],[37.84,138.62],[37.96,138.52],
    [38.14,138.44],[38.28,138.30],[38.40,138.16]
  ]
};

// 詳細マップの初期表示範囲 [[latS,lngW],[latN,lngE]]（実際の島の範囲）
const DETAIL_BBOX = {
  'izu-oshima':   [[34.67,139.31],[34.81,139.47]],
  'niijima':      [[34.31,139.23],[34.45,139.31]],
  'kozushima':    [[34.17,139.11],[34.26,139.18]],
  'hachijojima':  [[33.03,139.74],[33.16,139.86]],
  'yakushima':    [[30.21,130.37],[30.47,130.69]],
  'amami-oshima': [[28.04,129.09],[28.54,129.76]],
  'ishigaki':     [[24.29,124.06],[24.63,124.36]],
  'iriomote':     [[24.24,123.65],[24.45,123.95]],
  'sado':         [[37.78,138.19],[38.36,138.59]],
};

// 参考地形（ユーザーの島リストにないが位置の手がかりに地図上へ薄く表示）
const REF_ISLANDS = [
  {
    name: '沖縄本島',
    coords: [
      [26.92,128.20],[26.84,128.10],[26.74,127.98],[26.60,127.90],
      [26.46,127.82],[26.32,127.74],[26.18,127.70],[26.06,127.68],
      [25.98,127.72],[26.06,127.82],[26.20,127.92],[26.34,128.02],
      [26.48,128.12],[26.60,128.20],[26.70,128.27],[26.82,128.32]
    ]
  },
  {
    name: '宮古島',
    coords: [
      [24.88,125.12],[24.90,125.24],[24.88,125.36],
      [24.82,125.42],[24.74,125.42],[24.68,125.36],
      [24.66,125.22],[24.70,125.10],[24.78,125.07],[24.86,125.10]
    ]
  },
  {
    name: '種子島',
    coords: [
      [30.76,130.88],[30.78,130.98],[30.74,131.06],
      [30.56,131.08],[30.38,131.00],[30.28,130.90],
      [30.26,130.82],[30.38,130.76],[30.56,130.78],[30.70,130.84]
    ]
  },
  {
    name: '対馬',
    coords: [
      [34.60,129.22],[34.66,129.30],[34.64,129.44],
      [34.52,129.50],[34.36,129.48],[34.26,129.34],
      [34.20,129.22],[34.26,129.14],[34.44,129.14],[34.56,129.18]
    ]
  }
];

/* ---------- 描画ユーティリティ ---------- */
function smoothPath(coords){
  const pts = coords.map(([la,ln]) => project(la,ln));
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)} `;
  for (let i=0;i<pts.length;i++){
    const p=pts[i], n=pts[(i+1)%pts.length];
    d += `Q ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${((p.x+n.x)/2).toFixed(1)} ${((p.y+n.y)/2).toFixed(1)} `;
  }
  return d + 'Z';
}
function polyPoints(coords){
  return coords.map(([la,ln])=>{const p=project(la,ln);return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;}).join(' ');
}
function centroid(coords){
  const pts=coords.map(([la,ln])=>project(la,ln));
  return {x:pts.reduce((s,p)=>s+p.x,0)/pts.length, y:pts.reduce((s,p)=>s+p.y,0)/pts.length};
}

/* ---------- 全国地図描画 ---------- */
// 本土の海岸線: geo.js（OSM由来・実データ）があればそれを使う
function landRings(){
  const G = window.GEO || {};
  if (G.land && G.land.honshu){
    return ['hokkaido','honshu','shikoku','kyushu'].map(k => G.land[k] && G.land[k][0]).filter(Boolean);
  }
  return LANDMASSES;
}

// 北方領土（右上の枠内・参考表示）
const HOPPO = {
  box: { x: 684, y: 36, w: 112, h: 154 },
  proj(lat, lng){
    return { x: 688 + (lng - 145.35) / 3.65 * 104, y: 48 + (45.75 - lat) / 2.6 * 130 };
  },
  shapes: [
    { name: '国後島', label: [44.0, 145.62],
      pts: [[43.73,145.55],[43.87,145.72],[44.07,145.93],[44.3,146.2],[44.5,146.55],[44.4,146.62],[44.13,146.32],[43.93,146.1],[43.73,145.85],[43.64,145.62]] },
    { name: '択捉島', label: [45.15, 147.75],
      pts: [[44.45,146.85],[44.7,147.1],[44.95,147.45],[45.2,147.8],[45.5,148.5],[45.6,148.85],[45.44,148.72],[45.18,148.2],[44.88,147.7],[44.58,147.32],[44.34,147.0]] },
    { name: '色丹島', label: [43.95, 146.95],
      pts: [[43.8,146.58],[43.9,146.72],[43.86,146.9],[43.74,146.78]] },
  ],
  dots: [[43.45,145.8],[43.52,146.0],[43.6,146.18]], // 歯舞群島
};

// トカラ列島（鹿児島枠内の小島・固定座標）・小笠原諸島（右下の参考・固定座標）
const TOKARA = [
  { name:'口之島', x:88, y:416 }, { name:'中之島', x:82, y:428 },
  { name:'諏訪之瀬島', x:74, y:444 }, { name:'悪石島', x:66, y:460 },
  { name:'宝島', x:56, y:484 },
];
const OGASAWARA = [
  { name:'聟島列島', x:500, y:905 }, { name:'父島', x:506, y:928 }, { name:'母島', x:500, y:950 },
];

function drawBase(){
  // 観光イラストマップ調: ポップな青の海×緑の島、白フチの海岸線、波と生きもの
  let g = `<rect x="-200" y="-200" width="${VW+400}" height="${VH+400}" fill="#2d9cdb"/>`;
  for(let lat=32;lat<=46;lat+=2){const y=projectMain(lat,0).y; g+=`<line stroke="rgba(255,255,255,.2)" stroke-width=".6" x1="0" y1="${y.toFixed(1)}" x2="${VW}" y2="${y.toFixed(1)}"/>`;}
  for(let lng=130;lng<=144;lng+=4){const x=projectMain(0,lng).x; g+=`<line stroke="rgba(255,255,255,.2)" stroke-width=".6" x1="${x.toFixed(1)}" y1="0" x2="${x.toFixed(1)}" y2="${VH}"/>`;}
  // 枠（沖縄・北方領土・鹿児島・伊豆七島）はグリッドの上・島群の下に敷く
  const panel = (x,y,w,h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="#43ade9" stroke="#ffffff" stroke-width="2.2"/>`;
  g += `<g>
    ${panel(INSET.x-6, INSET.y-24, INSET.w+12, INSET.h+34)}
    <text x="${INSET.x+8}" y="${INSET.y-6}" fill="#ffffff" font-size="13" font-weight="900" letter-spacing="2">沖縄の島々</text>
    <text x="${INSET.x+INSET.w-4}" y="${INSET.y+INSET.h+4}" text-anchor="end" fill="rgba(255,255,255,.8)" font-size="8.5" font-weight="700">実際は本土のはるか南西</text>
  </g>`;
  // 北方領土（右上）
  g += `<g>${panel(HOPPO.box.x, HOPPO.box.y, HOPPO.box.w, HOPPO.box.h)}
    <text x="${HOPPO.box.x+8}" y="${HOPPO.box.y+16}" fill="#ffffff" font-size="11" font-weight="900" letter-spacing="2">北方領土</text>`;
  for(const s of HOPPO.shapes){
    const pts = s.pts.map(([la,ln]) => { const p=HOPPO.proj(la,ln); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(' ');
    const lp = HOPPO.proj(s.label[0], s.label[1]);
    g += `<polygon points="${pts}" fill="#7cc884" stroke="#ffffff" stroke-width="1.6" stroke-linejoin="round"/>
      <text x="${lp.x.toFixed(1)}" y="${lp.y.toFixed(1)}" text-anchor="end" fill="#eafff0" font-size="8" font-weight="800">${s.name}</text>`;
  }
  for(const [la,ln] of HOPPO.dots){ const p=HOPPO.proj(la,ln);
    g += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.1" fill="#7cc884" stroke="#ffffff" stroke-width="1"/>`; }
  { const p=HOPPO.proj(43.38,146.02);
    g += `<text x="${p.x.toFixed(1)}" y="${(p.y+9).toFixed(1)}" text-anchor="middle" fill="#eafff0" font-size="8" font-weight="800">歯舞群島</text></g>`; }
  // 伊豆七島の枠（主役: 実シルエット×ポップカラーの北斗七星）
  g += `<g><rect x="${IZU_BOX.x}" y="${IZU_BOX.y}" width="${IZU_BOX.w}" height="${IZU_BOX.h}" rx="18"
      fill="#1f7fc4" stroke="#ffffff" stroke-width="3"/>
    <text x="${IZU_BOX.x+14}" y="${IZU_BOX.y+30}" fill="#ffffff" font-size="19" font-weight="900" letter-spacing="4">伊豆七島</text>
    <text x="${IZU_BOX.x+14}" y="${IZU_BOX.y+46}" fill="rgba(255,255,255,.85)" font-size="9" font-weight="700" letter-spacing="2">ISLAND BIG DIPPER ★ 北斗七星ならび</text>`;
  { // 星座線: 柄（大島→利島→新島→神津島）と枡（神津島→三宅島→御蔵島→八丈島→神津島）
    const D = IZU_DIPPER;
    const chain = ids => ids.map((id,i) => `${i?'L':'M'} ${D[id][0]} ${D[id][1]}`).join(' ');
    const lines = chain(['izu-oshima','toshima','niijima','kozushima'])
      + ' ' + chain(['kozushima','miyakejima','mikurajima','hachijojima']) + ` L ${D['kozushima'][0]} ${D['kozushima'][1]}`;
    g += `<path d="${lines}" fill="none" stroke="rgba(255,255,255,.7)" stroke-width="2" stroke-dasharray="1 7" stroke-linecap="round" stroke-linejoin="round"/>`;
    for(const [x,y,fs] of [[IZU_BOX.x+18,IZU_BOX.y+70,12],[IZU_BOX.x+200,IZU_BOX.y+36,14],
        [IZU_BOX.x+206,IZU_BOX.y+240,10],[IZU_BOX.x+22,IZU_BOX.y+330,11],[IZU_BOX.x+120,IZU_BOX.y+455,10]])
      g += `<text x="${x}" y="${y}" font-size="${fs}" opacity=".85">✨</text>`;
  }
  g += `</g>`;
  // 鹿児島・奄美の枠（左中段: 種子島〜与論の斜めチェーン。トカラ列島も枠内）
  g += `<g>${panel(KAGO_BOX.x, KAGO_BOX.y, KAGO_BOX.w, KAGO_BOX.h)}
    <text x="${KAGO_BOX.x+8}" y="${KAGO_BOX.y+18}" fill="#ffffff" font-size="11.5" font-weight="900" letter-spacing="1">鹿児島の島々</text>`;
  for(const t of TOKARA){
    g+=`<circle cx="${t.x}" cy="${t.y}" r="2.6" fill="#7cc884" stroke="#ffffff" stroke-width="1.2"/>`; }
  g += `<text x="96" y="446" fill="rgba(255,255,255,.9)" font-size="8.5" font-weight="800">トカラ列島</text>
    <text x="66" y="488" fill="rgba(255,255,255,.85)" font-size="8" font-weight="700">宝島</text></g>`;
  // 参考地形（薄緑）※種子島は鹿児島枠にピンで入ったため描かない
  for(const ri of REF_ISLANDS){
    if (ri.name === '種子島') continue;
    g+=`<polygon points="${polyPoints(ri.coords)}" fill="#7cc884" stroke="#ffffff" stroke-width="2.4" stroke-linejoin="round"/>
        <polygon points="${polyPoints(ri.coords)}" fill="none" stroke="#4da35c" stroke-width=".9" stroke-linejoin="round"/>
        <text x="${centroid(ri.coords).x.toFixed(1)}" y="${centroid(ri.coords).y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle"
          fill="#2c6b3a" font-size="10" font-weight="700" paint-order="stroke" stroke="#bfe6c2" stroke-width="3px">${esc(ri.name)}</text>`;
  }
  // 小笠原諸島（右下・参考の小島）
  for(const o of OGASAWARA){
    g+=`<ellipse cx="${o.x}" cy="${o.y}" rx="3.4" ry="4.6" fill="#7cc884" stroke="#ffffff" stroke-width="1.2"/>
        <text x="${o.x-7}" y="${o.y+3}" text-anchor="end" fill="rgba(255,255,255,.85)" font-size="8" font-weight="700">${esc(o.name)}</text>`; }
  g+=`<text x="503" y="972" text-anchor="middle" fill="rgba(255,255,255,.85)" font-size="9.5" font-weight="800">小笠原諸島</text>`;
  // 本土（白フチ＋緑・実海岸線）
  for(const m of landRings()){
    const d = smoothPath(m);
    g+=`<path fill="#63bd6d" stroke="#ffffff" stroke-width="4" stroke-linejoin="round" d="${d}"/>
        <path fill="none" stroke="#3f9a52" stroke-width="1.2" stroke-linejoin="round" d="${d}"/>`;
  }
  const labels=[['本州',36.5,138.5],['九州',32.3,130.8],['北海道',43.4,142.6]];
  for(const[t,la,ln] of labels){const p=projectMain(la,ln);
    g+=`<text x="${p.x.toFixed(1)}" y="${p.y.toFixed(1)}" text-anchor="middle" fill="rgba(255,255,255,.9)" font-size="13" font-weight="800" letter-spacing="3">${t}</text>`;}
  const seaLabels=[['日本海',39.0,135.5],['太平洋',31.6,136.2]];
  for(const[t,la,ln] of seaLabels){const p=projectMain(la,ln);
    g+=`<text x="${p.x.toFixed(1)}" y="${p.y.toFixed(1)}" text-anchor="middle" fill="rgba(255,255,255,.65)" font-size="12" font-weight="700" letter-spacing="3">${t}</text>`;}
  // 波と海の生きもの（飾り）
  const wave=(x,y,s)=>`<path d="M ${x} ${y} q ${5*s} -4 ${10*s} 0 q ${5*s} 4 ${10*s} 0" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="${1.6*s}" stroke-linecap="round"/>`;
  for(const [x,y,s] of [[250,360,.9],[420,230,.9],[300,720,1],[220,880,.9],[420,860,1],[560,320,.8],[350,560,.9],[600,180,.8],[170,720,.8],[380,950,.9]]) g+=wave(x,y,s);
  for(const [e,x,y,fs] of [['🐋',300,860,20],['⛵',420,520,18],['🐬',200,770,15],['☁️',470,60,18],['☁️',420,120,15],['🐢',500,660,15]])
    g+=`<text x="${x}" y="${y}" font-size="${fs}" opacity=".9" pointer-events="none">${e}</text>`;
  return g;
}

/* ---------- 東海汽船の定期航路（全国マップ） ---------- */
// 竹芝桟橋発の2系統。寄港順は2026-07時点の定期便（東海汽船公式より）。
// 第4要素は島ID: 伊豆七島枠（IZU_DIPPER）の位置に寄港点を合わせる
const FERRY_ROUTES = [
  { name: 'さるびあ丸', color: '#1f7fa8',
    stops: [
      ['竹芝',   35.6547, 139.7638, null],
      ['大島',   34.7906, 139.3906, 'izu-oshima'],
      ['利島',   34.529,  139.279,  'toshima'],
      ['新島',   34.372,  139.252,  'niijima'],
      ['式根島', 34.3352, 139.2137, 'shikinejima'],
      ['神津島', 34.203,  139.134,  'kozushima'],
    ] },
  { name: '橘丸', color: '#c05a28',
    stops: [
      ['竹芝',   35.6547, 139.7638, null],
      ['三宅島', 34.100,  139.5555, 'miyakejima'],
      ['御蔵島', 33.8957, 139.5893, 'mikurajima'],
      ['八丈島', 33.113,  139.802,  'hachijojima'],
    ] },
];
function drawFerryRoutes(){
  const k = STATE.view.scale || 1;
  const f = v => (v/k).toFixed(2);
  let g = '<g class="ferry-routes" pointer-events="none">';
  const legMid = (a, b, m, t) => ({
    x: (1-t)*(1-t)*a.x + 2*(1-t)*t*m.x + t*t*b.x,
    y: (1-t)*(1-t)*a.y + 2*(1-t)*t*m.y + t*t*b.y,
  });
  for (const r of FERRY_ROUTES){
    const pts = r.stops.map(([,la,ln,id]) =>
      (id && IZU_DIPPER[id]) ? { x: IZU_DIPPER[id][0], y: IZU_DIPPER[id][1] } : project(la,ln));
    let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    const mids = [];
    for (let i=1;i<pts.length;i++){
      const a = pts[i-1], b = pts[i];
      // 進行方向の左へ少し膨らむゆるいカーブ（海路らしい見た目）
      const m = { x:(a.x+b.x)/2 - (b.y-a.y)*0.12, y:(a.y+b.y)/2 + (b.x-a.x)*0.12 };
      mids.push(m);
      d += ` Q ${m.x.toFixed(1)} ${m.y.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
    }
    g += `<path d="${d}" fill="none" stroke="#fff" stroke-width="${f(3.6)}" opacity=".55" stroke-linecap="round"/>
      <path d="${d}" fill="none" stroke="${r.color}" stroke-width="${f(1.6)}" stroke-dasharray="${f(6)} ${f(4)}" stroke-linecap="round" opacity=".9"/>`;
    for (const p of pts){
      g += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${f(2.3)}" fill="#fff" stroke="${r.color}" stroke-width="${f(1.1)}"/>`;
    }
    // 船と航路名は竹芝→最初の寄港地の区間上に。名前は船の左側（伊豆七島枠を避ける）
    const t0 = r.name === '橘丸' ? 0.25 : 0.30;
    const s = legMid(pts[0], pts[1], mids[0], t0);
    g += `<text x="${s.x.toFixed(1)}" y="${(s.y+4/k).toFixed(1)}" text-anchor="middle" font-size="${f(13)}">⛴</text>
      <text x="${(s.x-9/k).toFixed(1)}" y="${(s.y+3.5/k).toFixed(1)}" text-anchor="end" fill="${r.color}" font-size="${f(9.5)}" font-weight="800"
        paint-order="stroke" stroke="#fff" stroke-width="${f(2.6)}">東海汽船 ${r.name}</text>`;
  }
  // 竹芝桟橋
  const tk = project(35.6547, 139.7638);
  g += `<text x="${tk.x.toFixed(1)}" y="${(tk.y-6/k).toFixed(1)}" text-anchor="middle" fill="#1f6288" font-size="${f(10)}" font-weight="800"
    paint-order="stroke" stroke="#fff" stroke-width="${f(3)}">竹芝桟橋</text>`;
  g += '</g>';
  return g;
}

function drawIslandShapes(){
  const useShapes = STATE.view.scale >= 2;
  return STATE.islands.map(is => {
    const coords = ISLAND_SHAPE_DATA[is.id];
    if (!coords || !useShapes || IZU_DIPPER[is.id] || KAGO_POS[is.id]) return ''; // 枠内の島は常にピン/シルエット表示
    const active = is.id === STATE.activeId;
    const fill   = active ? '#9ec4e0' : is.fav ? '#e0d07a' : '#bdd4a6';
    const stroke = active ? '#1e6eb8' : is.fav ? '#a09640' : '#7a9e70';
    const sw     = active ? 2.5 : 1.2;
    const c = centroid(coords);
    const k = STATE.view.scale * (STATE.vScale || 0.73);
    const fs = +(12 / k).toFixed(2);
    const visitFs = +(10 / k).toFixed(2);
    const visits = is.visits ? `<text x="${c.x.toFixed(1)}" y="${(c.y + 14/k).toFixed(1)}" text-anchor="middle" fill="${active?'#14508a':is.fav?'#706010':'#3a6a30'}" font-size="${visitFs}" font-weight="800" opacity=".9">${is.visits}回</text>` : '';
    const favMark = is.fav ? `<text x="${c.x.toFixed(1)}" y="${(c.y - 15/k).toFixed(1)}" text-anchor="middle" font-size="${+(13/k).toFixed(2)}">★</text>` : '';
    return `<g class="isle-shape${active?' active':''}" data-id="${is.id}">
      <polygon class="isle-body" points="${polyPoints(coords)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw/STATE.view.scale}" stroke-linejoin="round"/>
      <text class="isle-lbl" x="${c.x.toFixed(1)}" y="${c.y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="${fs}">${esc(is.name)}</text>
      ${visits}${favMark}
    </g>`;
  }).join('');
}

function drawDotPins(){
  return STATE.islands.map(is => {
    const hasShape = !!ISLAND_SHAPE_DATA[is.id];
    const boxed = IZU_DIPPER[is.id] || KAGO_POS[is.id];
    if (hasShape && STATE.view.scale >= 2 && !boxed) return '';
    const p = islandPoint(is);
    const active = is.id === STATE.activeId;
    // 伊豆七島（主役枠）: 実海岸線シルエット×ポップカラーの「島の星」
    if (IZU_DIPPER[is.id]){
      const size = IZU_SIZE[is.id] || 26;
      const col = IZU_COLORS[is.id] || '#ffe082';
      const shp = izuShapePoints(is.id, size);
      return `<g class="pin${is.fav?' fav':''}${active?' active':''}" data-id="${is.id}" transform="translate(${p.x.toFixed(1)},${p.y.toFixed(1)})">
        ${active ? `<circle class="ring" r="${(size*0.72+7).toFixed(0)}" fill="none" stroke="#ffffff" stroke-width="2.5" opacity=".95"/>` : ''}
        <circle r="${(size*0.62).toFixed(0)}" fill="rgba(255,255,255,.15)"/>
        ${shp
          ? `<polygon class="dot" points="${shp}" fill="${col}" stroke="#ffffff" stroke-width="2.6" stroke-linejoin="round"/>`
          : `<circle class="dot" r="${(size/2).toFixed(0)}" fill="${col}" stroke="#ffffff" stroke-width="2.6"/>`}
        ${is.visits ? `<g pointer-events="none" transform="translate(${(size*0.55).toFixed(0)},${(-size*0.55).toFixed(0)})">
          <circle r="8" fill="#ffffff"/><text y="3" text-anchor="middle" fill="#1d6fa5" font-size="9" font-weight="900">${is.visits}</text></g>` : ''}
        ${is.fav ? `<text x="${(-size*0.62).toFixed(0)}" y="${(-size*0.45).toFixed(0)}" font-size="12" pointer-events="none">⭐</text>` : ''}
        <text y="${(size*0.62+13).toFixed(0)}" text-anchor="middle" fill="#ffffff" font-size="11.5" font-weight="900"
          paint-order="stroke" stroke="#1d6fa5" stroke-width="3px" pointer-events="none">${esc(is.name)}</text>
      </g>`;
    }
    const fill   = is.fav ? '#d8c870' : '#e06040';
    return `<g class="pin${is.fav?' fav':''}${active?' active':''}" data-id="${is.id}" transform="translate(${p.x.toFixed(1)},${p.y.toFixed(1)})">
      ${active ? `<circle class="ring" r="16" fill="none" stroke="#2a7ec8" stroke-width="2" opacity=".8"/>` : ''}
      <circle class="dot" r="${active?10:8}" fill="${fill}" stroke="#fff" stroke-width="1.5"/>
      <text y="3" text-anchor="middle" fill="#fff" font-size="8" font-weight="800" pointer-events="none">${is.visits||''}</text>
      <text x="12" y="4" fill="#2a2520" font-size="11" font-weight="700" paint-order="stroke" stroke="#fff" stroke-width="3px" pointer-events="none">${esc(is.name)}</text>
    </g>`;
  }).join('');
}

/* ---------- 横並びビュー（⛰ 横からながめる / v1.x 系より移植） ---------- */
// 島シルエットの種類: 火山(cone) / 丸い丘(dome) / 平らな隆起サンゴ＋ヤシ(flat) / ふたこぶ(twin) / 深い森(forest)
const ISLAND_KIND = {
  'izu-oshima':'cone','toshima':'cone','niijima':'dome','shikinejima':'flat',
  'kozushima':'dome','miyakejima':'cone','mikurajima':'dome','hachijojima':'twin','aogashima':'cone',
  'sado':'dome','yakushima':'forest','tanegashima':'flat','amami-oshima':'forest','kikaijima':'flat',
  'tokunoshima':'dome','okinoerabu':'flat','yoron':'flat','okinawa-hontou':'dome','miyako':'flat',
  'kumejima':'dome','ishigaki':'dome','iriomote':'forest','yonaguni':'dome','hateruma':'flat'
};
function islandKind(is){ return ISLAND_KIND[is.id] || 'dome'; }

// 島の名産（横並びビューのバッジ）
const SPECIALTY = {
  'izu-oshima':{ic:'🌺',name:'椿'},        'toshima':{ic:'🌺',name:'椿油'},      'niijima':{ic:'🗿',name:'モヤイ像'},
  'shikinejima':{ic:'♨️',name:'海中温泉'}, 'kozushima':{ic:'🦑',name:'赤イカ'},  'miyakejima':{ic:'🐦',name:'アカコッコ'},
  'mikurajima':{ic:'🐬',name:'イルカ'},    'hachijojima':{ic:'🍣',name:'島寿司'},'aogashima':{ic:'🧂',name:'ひんぎゃの塩'},
  'sado':{ic:'🕊',name:'トキ'},            'yakushima':{ic:'🌲',name:'屋久杉'},  'tanegashima':{ic:'🍠',name:'安納芋'},
  'amami-oshima':{ic:'🧵',name:'大島紬'},  'kikaijima':{ic:'🍬',name:'黒糖'},    'tokunoshima':{ic:'🥔',name:'じゃがいも'},
  'okinoerabu':{ic:'🌼',name:'えらぶゆり'},'yoron':{ic:'✨',name:'星の砂'},      'okinawa-hontou':{ic:'🦁',name:'シーサー'},
  'kumejima':{ic:'🦐',name:'車えび'},      'miyako':{ic:'🥭',name:'マンゴー'},   'ishigaki':{ic:'🐄',name:'石垣牛'},
  'iriomote':{ic:'🐈',name:'ヤマネコ'},    'yonaguni':{ic:'🐴',name:'与那国馬'}, 'hateruma':{ic:'🌌',name:'南十字星'}
};
// 島の基本サイズ（viewBox単位）。訪問が多いほど大きく。
function islandRadius(is){
  const v = is.visits||0;
  if(!v) return 11;
  return 13 + Math.min(10, v*0.7);
}

const ISLE_DEFS = `
  <linearGradient id="gVis" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a3de81"/><stop offset="1" stop-color="#5cae54"/></linearGradient>
  <linearGradient id="gFav" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d3e690"/><stop offset="1" stop-color="#8cbf58"/></linearGradient>
  <linearGradient id="gUns" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c2d2b8"/><stop offset="1" stop-color="#93ab8c"/></linearGradient>
  <linearGradient id="gAct" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#abe98a"/><stop offset="1" stop-color="#4da44e"/></linearGradient>`;

// 島イラスト（ぷっくり立体・砂浜と波の輪つき）
function isleArt(is, sx, sy, r, H, ry, o){
  const grad = o.active ? 'gAct' : is.fav ? 'gFav' : o.visited ? 'gVis' : 'gUns';
  const edge = o.active ? '#2e7d3b' : is.fav ? '#7d9a3c' : o.visited ? '#3f8e47' : '#75917e';
  const sand = is.fav ? '#ffe9ad' : o.visited ? '#f6e6b8' : '#e2ddcd';
  const n = v => (+v).toFixed(1);
  const shadow = `<ellipse cx="${n(sx)}" cy="${n(sy+ry*0.55)}" rx="${n(r*1.06)}" ry="${n(ry*0.7)}" fill="rgba(20,40,60,.13)"/>`;
  const foam   = `<ellipse cx="${n(sx)}" cy="${n(sy)}" rx="${n(r*1.17)}" ry="${n(ry*1.32)}" fill="rgba(255,255,255,.55)"/>`;
  const beach  = `<ellipse cx="${n(sx)}" cy="${n(sy)}" rx="${n(r)}" ry="${n(ry)}" fill="${sand}" stroke="#e5cd93" stroke-width="1"/>`;
  const land   = landShape(is, sx, sy, r, H, `url(#${grad})`, edge);
  const ring   = o.active ? `<ellipse cx="${n(sx)}" cy="${n(sy)}" rx="${n(r+5)}" ry="${n(ry+3)}" fill="none" stroke="#2a7ec8" stroke-width="2.4"/>` : '';
  const ly = +(sy + ry + 12).toFixed(1);
  const fav = is.fav ? `<text x="${n(sx)}" y="${n(sy-H-8)}" text-anchor="middle" font-size="${o.favSize||13}">⭐</text>` : '';
  const visitsB = (o.visited && o.showLabel) ? `<text x="${n(sx)}" y="${n(ly+(o.visitsGap||13))}" text-anchor="middle" fill="#3a6a30" font-size="${o.visitsSize||9.5}" font-weight="800">${is.visits}回</text>` : '';
  const label = o.showLabel ? `<text class="isle-lbl" x="${n(sx)}" y="${ly}" text-anchor="middle" font-size="${o.labelSize||11.5}" font-weight="700">${esc(is.name)}</text>${visitsB}` : '';
  return `<g class="isle${o.visited?'':' unseen'}${o.active?' active':''}" data-id="${esc(is.id)}" style="opacity:${o.op}">${shadow}${foam}${beach}${land}${ring}${fav}${label}</g>`;
}
// 種類ごとの陸地シルエット。sx,sy=海面中心、Hだけ上へ立ち上がる。
function landShape(is, sx, sy, r, H, fill, edge){
  const kind = islandKind(is);
  const w = r*0.84, peak = sy - H;
  const n = v => (+v).toFixed(1);
  const P  = d => `<path d="${d}" fill="${fill}" stroke="${edge}" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round"/>`;
  const hi = d => `<path d="${d}" fill="none" stroke="rgba(255,255,255,.6)" stroke-width="1.6" stroke-linecap="round"/>`;
  if (kind === 'cone'){ // ぷっくり火山＋火口＋ゆげ
    const body = `M ${n(sx-w)} ${n(sy)} Q ${n(sx-w*0.72)} ${n(sy-H*0.35)} ${n(sx-w*0.24)} ${n(peak+H*0.13)} Q ${n(sx)} ${n(peak-H*0.03)} ${n(sx+w*0.24)} ${n(peak+H*0.13)} Q ${n(sx+w*0.72)} ${n(sy-H*0.35)} ${n(sx+w)} ${n(sy)} Z`;
    const crater = `<ellipse cx="${n(sx)}" cy="${n(peak+H*0.10)}" rx="${n(w*0.20)}" ry="${n(w*0.075)}" fill="#8a6a4a" stroke="${edge}" stroke-width="0.8"/>`;
    const puff = `<g fill="#fff" opacity=".85"><circle cx="${n(sx+w*0.10)}" cy="${n(peak-r*0.26)}" r="${n(r*0.12)}"/><circle cx="${n(sx+w*0.26)}" cy="${n(peak-r*0.44)}" r="${n(r*0.085)}"/></g>`;
    return P(body) + hi(`M ${n(sx-w*0.58)} ${n(sy-H*0.32)} Q ${n(sx-w*0.34)} ${n(sy-H*0.62)} ${n(sx-w*0.18)} ${n(peak+H*0.22)}`) + crater + puff;
  }
  if (kind === 'forest'){ // まるい丘＋もこもこの木
    const body = `M ${n(sx-w)} ${n(sy)} Q ${n(sx)} ${n(sy-H*1.15)} ${n(sx+w)} ${n(sy)} Z`;
    const tree = (tx,ty,tr) => `<circle cx="${n(tx)}" cy="${n(ty)}" r="${n(tr)}" fill="#3e8e4f" stroke="${edge}" stroke-width="0.9"/><circle cx="${n(tx-tr*0.35)}" cy="${n(ty-tr*0.3)}" r="${n(tr*0.32)}" fill="rgba(255,255,255,.4)"/>`;
    return P(body)
      + tree(sx-w*0.34, sy-H*0.50, r*0.20)
      + tree(sx+w*0.30, sy-H*0.46, r*0.23)
      + tree(sx-w*0.02, sy-H*0.76, r*0.21);
  }
  if (kind === 'twin'){ // ふたこぶ（八丈島）
    const right = `M ${n(sx-w*0.10)} ${n(sy)} Q ${n(sx+w*0.42)} ${n(sy-H*1.5)} ${n(sx+w)} ${n(sy)} Z`;
    const left  = `M ${n(sx-w)} ${n(sy)} Q ${n(sx-w*0.56)} ${n(sy-H*1.05)} ${n(sx-w*0.04)} ${n(sy)} Z`;
    return P(left) + P(right)
      + hi(`M ${n(sx+w*0.16)} ${n(sy-H*0.86)} Q ${n(sx+w*0.40)} ${n(sy-H*1.02)} ${n(sx+w*0.58)} ${n(sy-H*0.72)}`);
  }
  if (kind === 'flat'){ // 平らな隆起サンゴ＋ヤシの木
    const fh = H*0.48, cr = r*0.22;
    const body = `M ${n(sx-w)} ${n(sy)} L ${n(sx-w)} ${n(sy-fh+cr)} Q ${n(sx-w)} ${n(sy-fh)} ${n(sx-w+cr)} ${n(sy-fh)} L ${n(sx+w-cr)} ${n(sy-fh)} Q ${n(sx+w)} ${n(sy-fh)} ${n(sx+w)} ${n(sy-fh+cr)} L ${n(sx+w)} ${n(sy)} Z`;
    const px = sx+w*0.18, py = sy-fh, th = H*0.85, tx = px+r*0.03, ty = py-th;
    const trunk = `<path d="M ${n(px)} ${n(py)} q ${n(r*0.10)} ${n(-th*0.55)} ${n(r*0.03)} ${n(-th)}" stroke="#a5825a" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
    const leaf = (rot) => `<ellipse cx="${n(tx)}" cy="${n(ty)}" rx="${n(r*0.26)}" ry="${n(r*0.085)}" transform="rotate(${rot} ${n(tx)} ${n(ty)}) translate(${n(r*0.2)} 0)" fill="#57b25c" stroke="${edge}" stroke-width="0.5"/>`;
    const palm = trunk + `<g>${leaf(-150)}${leaf(-110)}${leaf(-60)}${leaf(-20)}</g>`
      + `<circle cx="${n(tx-r*0.05)}" cy="${n(ty+r*0.07)}" r="${n(r*0.06)}" fill="#8a6a4a"/><circle cx="${n(tx+r*0.06)}" cy="${n(ty+r*0.09)}" r="${n(r*0.06)}" fill="#8a6a4a"/>`;
    return P(body) + hi(`M ${n(sx-w*0.7)} ${n(sy-fh*0.55)} L ${n(sx-w*0.15)} ${n(sy-fh*0.55)}`) + palm;
  }
  // dome（丸い丘・既定）
  const body = `M ${n(sx-w)} ${n(sy)} Q ${n(sx)} ${n(sy-H*1.55)} ${n(sx+w)} ${n(sy)} Z`;
  return P(body) + hi(`M ${n(sx-w*0.5)} ${n(sy-H*0.72)} Q ${n(sx-w*0.14)} ${n(sy-H*1.12)} ${n(sx+w*0.22)} ${n(sy-H*1.0)}`);
}

function cloudSVG(x,y,s=1){
  return `<g fill="#fff" opacity=".85" transform="translate(${x},${y}) scale(${s})">
    <ellipse rx="46" ry="17"/><circle cx="-18" cy="-11" r="15"/><circle cx="14" cy="-13" r="19"/></g>`;
}
function sideIslands(){
  return [...STATE.islands].sort((a,b) => b.lat - a.lat); // 北 → 南 ＝ 左 → 右
}
function renderSideView(){
  const list = sideIslands();
  const n = list.length;
  const HZ = 620; // 海面の高さ
  const gap = n > 1 ? Math.max(130, (VW-180)/(n-1)) : 0;
  const width = 180 + gap*Math.max(0, n-1);
  const minTx = Math.min(0, VW - width);
  STATE.sideTx = Math.min(0, Math.max(minTx, STATE.sideTx || 0));
  let g = `<defs>${ISLE_DEFS}
    <linearGradient id="skyG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b7e1f2"/><stop offset="1" stop-color="#eef9fc"/></linearGradient>
    <linearGradient id="seaSideG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8ecbe0"/><stop offset="1" stop-color="#5b9fc2"/></linearGradient>
  </defs>`;
  g += `<rect width="${VW}" height="${HZ}" fill="url(#skyG)"/>`;
  g += `<rect y="${HZ}" width="${VW}" height="${VH-HZ}" fill="url(#seaSideG)"/>`;
  g += `<circle cx="${VW-110}" cy="110" r="34" fill="#ffd76e" opacity=".9"/>`;
  g += cloudSVG(150,120) + cloudSVG(430,78,0.8) + cloudSVG(640,170,0.65);
  for(let i=0;i<3;i++){
    g += `<path d="M0 ${HZ+50+i*80} q 40 -9 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0" stroke="rgba(255,255,255,.35)" stroke-width="2.5" fill="none"/>`;
  }
  let items = '';
  list.forEach((is, i) => {
    const sx = 90 + gap*i + STATE.sideTx;
    if (sx < -150 || sx > VW+150) return;
    const visited = (is.visits||0) > 0;
    const r = (islandRadius(is) + 15) * 1.9;
    items += isleArt(is, sx, HZ, r, r*1.3, r*0.28,
      {active: is.id===STATE.activeId, visited, op: visited?1:0.6, showLabel:true,
       labelSize:19, visitsSize:14, visitsGap:21, favSize:16});
    // 名産バッジ（島の上）：大きな絵＋名前の2段
    const sp = SPECIALTY[is.id];
    if (sp){
      const spY = HZ - r*1.3 - r*0.62 - 6;
      items += `<text x="${sx.toFixed(1)}" y="${(spY-24).toFixed(1)}" text-anchor="middle" font-size="34">${sp.ic}</text>`
        + `<text x="${sx.toFixed(1)}" y="${spY.toFixed(1)}" text-anchor="middle" font-size="17" font-weight="800"
        fill="#17395f" paint-order="stroke" stroke="#fff" stroke-width="4" opacity=".95">${esc(sp.name)}</text>`;
    }
  });
  g += `<g class="isles">${items}</g>`;
  g += `<text x="24" y="${VH-36}" fill="#fff" font-size="17" font-weight="800" opacity=".95">⛵ すべての島（北 → 南）${width>VW?'・ドラッグで移動':''}</text>`;
  svg.innerHTML = g;
  bindIsleClicks();
  // 左右スクロールボタンの有効/無効
  const prevB = $('#sidePrev'), nextB = $('#sideNext');
  if (prevB && nextB){
    prevB.classList.toggle('off', STATE.sideTx >= 0);
    nextB.classList.toggle('off', STATE.sideTx <= minTx + 1);
  }
}

function bindIsleClicks(){
  svg.querySelectorAll('.isle-shape, .pin, .isle').forEach(el => {
    el.addEventListener('click', ev => { ev.stopPropagation(); openIsland(el.dataset.id); });
  });
}

function renderMap(){
  if (STATE.viewMode === 'side'){ renderSideView(); return; }
  const { scale, tx, ty } = STATE.view;
  const svgH = svg.getBoundingClientRect().height;
  STATE.vScale = svgH > 0 ? svgH / VH : 0.73;
  svg.innerHTML = `<g transform="translate(${tx},${ty}) scale(${scale})">${drawBase()}${drawFerryRoutes()}${drawIslandShapes()}${drawDotPins()}</g>`;
  bindIsleClicks();
}

/* ---------- 島の詳細マップ（Leaflet / 地理院タイル） ---------- */
let dmap = null, dmapIslandId = null, dmarkers = new Map(), pickHandler = null;

function liveList(arr){ return (arr || []).filter(e => !e.deleted); }
function visibleSpots(is){
  return liveList(is.spots).filter(s => !STATE.catFilter || STATE.catFilter.has(s.cat));
}

function ensureDmap(){
  if (dmap || typeof L === 'undefined') return dmap;
  dmap = L.map('dmap', { zoomSnap: 0.5, zoomControl: true });
  const pale = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>'
  });
  const photo = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg', {
    maxZoom: 18, attribution: '地理院タイル（写真）'
  });
  pale.addTo(dmap);
  L.control.layers({ '地図': pale, '航空写真': photo }, null, { position: 'bottomright' }).addTo(dmap);
  dmap.on('click', e => {
    if (pickHandler){
      const h = pickHandler;
      cancelPick();
      h(e.latlng);
    }
  });
  return dmap;
}

function initDetailMap(is){
  const wrap = $('#dmapwrap');
  if (typeof L === 'undefined'){
    wrap.querySelector('#dmap').innerHTML = '<div class="dmap-off">オフラインのため詳細地図を表示できません</div>';
    return;
  }
  ensureDmap();
  if (dmapIslandId !== is.id){
    dmapIslandId = is.id;
    cancelPick();
    fitIsland(is);
  }
  rebuildMarkers(is);
  // パネルのスライドイン完了後にサイズ再計算
  setTimeout(() => { if (dmap) dmap.invalidateSize(); }, 320);
}

function fitIsland(is){
  const bb = DETAIL_BBOX[is.id];
  if (bb){ dmap.fitBounds(bb, { padding: [10,10] }); return; }
  const pts = liveList(is.spots).map(s => [s.lat, s.lng]);
  pts.push([is.lat, is.lng]);
  if (pts.length > 1) dmap.fitBounds(pts, { padding: [30,30], maxZoom: 13 });
  else dmap.setView([is.lat, is.lng], 12);
}

function spotIcon(cat){
  const st = catStyle(cat);
  return L.divIcon({
    className: 'spot-ico',
    html: `<span style="background:${st.color}">${st.ico}</span>`,
    iconSize: [26,26], iconAnchor: [13,13], popupAnchor: [0,-13]
  });
}

function spotPopup(is, s){
  const d = document.createElement('div');
  d.className = 'spot-pop';
  d.innerHTML = `<b>${esc(s.name)}</b><span class="cat">${esc(s.cat)}</span>
    ${s.note ? `<p>${esc(s.note)}</p>` : ''}
    ${safeUrl(s.url) ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">🔗 Webページを開く</a>` : ''}
    ${s.author ? `<span class="by">✎ ${esc(s.author)}</span>` : ''}
    <div class="row"><button data-a="edit">✏️ 編集</button><button data-a="del">🗑 削除</button></div>`;
  d.querySelector('[data-a="edit"]').onclick = () => { dmap.closePopup(); spotForm(is, s); };
  d.querySelector('[data-a="del"]').onclick = () => deleteSpot(is, s.id);
  return d;
}

function rebuildMarkers(is){
  if (!dmap) return;
  for (const m of dmarkers.values()) m.remove();
  dmarkers.clear();
  for (const s of visibleSpots(is)){
    if (!isFinite(s.lat) || !isFinite(s.lng)) continue;
    const m = L.marker([s.lat, s.lng], { icon: spotIcon(s.cat), title: s.name })
      .addTo(dmap)
      .bindPopup(() => spotPopup(is, s));
    dmarkers.set(s.id, m);
  }
}

function focusSpot(is, id){
  const s = liveList(is.spots).find(x => x.id === id);
  if (!s || !dmap || !isFinite(s.lat) || !isFinite(s.lng)) return;
  dmap.setView([s.lat, s.lng], Math.max(dmap.getZoom(), 14), { animate: true });
  const m = dmarkers.get(id);
  if (m) m.openPopup();
}

function startPick(onPick){
  if (!dmap){ onPick(null); return; }
  pickHandler = onPick;
  $('#dmapwrap').classList.add('picking');
}
function cancelPick(){
  pickHandler = null;
  $('#dmapwrap').classList.remove('picking');
}

/* ---------- 詳細パネル ---------- */
function islandById(id){ return STATE.islands.find(i => i.id === id); }
// 同期で STATE.islands の島オブジェクトが差し替わるため、
// UIハンドラが掴んだ島は変異の直前に必ずIDで引き直す
function resolveIsland(is){ return islandById(is.id) || is; }

function deleteSpot(is, spotId){
  const cur = resolveIsland(is);
  const s = (cur.spots || []).find(x => x.id === spotId);
  if (!s) return;
  if (!confirm(`「${s.name}」を削除しますか？（5人全員から消えます）`)) return;
  if (dmap) dmap.closePopup();
  Object.assign(s, { deleted: true }, stamp());
  saveIslands(); refreshSpots(cur); toast('スポットを削除しました');
}

async function openIsland(id){
  const is = islandById(id);
  if (!is) return;
  STATE.activeId = id;
  STATE.catFilter = null;
  $('#hint').classList.add('hidden');
  $('#pBadge').textContent = is.region + ' / ' + is.pref;
  $('#pTitle').textContent = is.name;
  $('#pFav').textContent = is.fav ? '★' : '☆';
  $('#pFav').style.color = is.fav ? 'var(--fav)' : 'var(--sub)';
  $('#pMeta').innerHTML =
    `<span>📍 初訪問 ${esc(is.firstVisit||'—')}</span>
     <span>🔁 訪問 ${is.visits||0} 回</span>
     <span>📷 写真 ${is.photos.length} 枚</span>`;
  $('#pSummary').textContent = is.summary || '';
  await renderBody(is);
  $('#panel').classList.add('open');
  $('#pDim').classList.add('show');
  initDetailMap(is);
  if (window.Kanko) Kanko.onOpen(is);
  renderMap();
}

// スポットの追加・編集後に地図と一覧だけ更新（地図の表示位置は保つ）
function refreshSpots(is){
  rebuildMarkers(is);
  if (window.Kanko) Kanko.refresh(is);
  renderBody(is);
}

/* 各セクションは「開く」ボタンで展開する折りたたみ式（下までスクロール不要）。
   開閉状態は端末内のみ・島ごとに記憶（同期で島オブジェクトが差し替わっても保持） */
const ACC = {};
function accState(id){
  return ACC[id] || (ACC[id] = { spots:false, photos:false, logs:false, shops:false, knowledge:false, tips:false });
}
async function renderBody(is){
  const body = $('#pBody');
  const acc = accState(is.id);
  const secs = [
    { key:'spots',     ic:'🗺', title:'スポット',    n: liveList(is.spots).length },
    { key:'photos',    ic:'📷', title:'写真',        n: is.photos.length },
    { key:'logs',      ic:'📖', title:'旅日記',      n: liveList(is.logs).length },
    { key:'shops',     ic:'🍴', title:'お店・グルメ', n: liveList(is.shops).length },
    { key:'knowledge', ic:'💡', title:'ナレッジ',    n: liveList(is.knowledge).length },
    { key:'tips',      ic:'🎯', title:'Tips・コツ',  n: liveList(is.tips).length },
  ];
  body.innerHTML = `<div class="accs">` + secs.map(s => `
    <div class="acc${acc[s.key] ? ' open' : ''}" data-sec="${s.key}">
      <button class="acc-h" data-acct="${s.key}">
        <span class="aic">${s.ic}</span><span class="at">${s.title}</span>
        ${s.n ? `<span class="an">${s.n}</span>` : ''}
        <span class="aopen">${acc[s.key] ? '▾ 閉じる' : '▸ 開く'}</span>
      </button>
      <div class="acc-b">${acc[s.key] ? accContent(is, s.key) : ''}</div>
    </div>`).join('') + `</div>`;
  if (acc.photos){
    await Promise.all(is.photos.map(async pid => {
      const blob = await PhotoDB.get(pid);
      const img = body.querySelector(`img[data-pid="${pid}"]`);
      if (img && blob) img.src = URL.createObjectURL(blob);
    }));
  }
  body.querySelectorAll('[data-acct]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.acct;
    acc[k] = !acc[k];
    const top = body.scrollTop;
    renderBody(resolveIsland(is)).then(() => { $('#pBody').scrollTop = top; });
  }));
  bindBody(is);
}
function accContent(is, key){
  const addBtn = `<button class="btn acc-add" data-add="${key}">＋ 追加</button>`;
  if (key === 'spots')     return addBtn + spotListBlock(is);
  if (key === 'photos')    return photosBlock(is); // ＋はグリッド内タイル
  if (key === 'logs')      return addBtn + listLogs(is);
  if (key === 'shops')     return addBtn + listShops(is);
  if (key === 'knowledge') return addBtn + listSimple(is,'knowledge','📌');
  return addBtn + listSimple(is,'tips','✅');
}
function byBadge(e){ return e.author ? `<span class="by">✎${esc(e.author)}</span>` : ''; }

function usedCats(is){
  const all = liveList(is.spots);
  return CATS.filter(c => all.some(s => s.cat === c));
}
function spotListBlock(is){
  const all = liveList(is.spots);
  const cats = usedCats(is);
  const chips = cats.length > 1 ? `<div class="chips">${cats.map(c => {
    const on = !STATE.catFilter || STATE.catFilter.has(c);
    return `<span class="chip${on?' on':''}" data-cat="${esc(c)}">${catStyle(c).ico} ${esc(c)}</span>`;
  }).join('')}</div>` : '';
  const spots = visibleSpots(is)
    .slice()
    .sort((a,b) => CATS.indexOf(a.cat) - CATS.indexOf(b.cat) || a.name.localeCompare(b.name,'ja'));
  const rows = spots.map(s =>
    `<li class="spotrow" data-spot="${esc(s.id)}">
      <span class="ic">${catStyle(s.cat).ico}</span>
      <span class="txt"><span class="nm">${esc(s.name)}</span><span class="cat">${esc(s.cat)}</span>${byBadge(s)}
        ${s.note?`<span class="nt">${esc(s.note)}</span>`:''}
        ${safeUrl(s.url)?`<a class="lk" href="${esc(s.url)}" target="_blank" rel="noopener">🔗 ${esc(shortUrl(s.url))}</a>`:''}
      </span>
      <span class="x" data-delspot="${esc(s.id)}">✕</span>
    </li>`).join('');
  if (!all.length) return `<p class="empty">スポットがありません。「＋追加」→ 地図タップで登録できます。</p>`;
  return chips + `<ul class="list spots">${rows || '<p class="empty">このカテゴリのスポットはありません。</p>'}</ul>`;
}

function photosBlock(is){
  const items = is.photos.map(pid =>
    `<div class="ph"><img data-pid="${pid}" alt=""><button class="del" data-delph="${pid}">✕</button></div>`).join('');
  return `<div class="gallery">${items}<label class="add-ph">＋<input type="file" accept="image/*" class="hidden" id="photoInput" multiple></label></div>`;
}
function listLogs(is){
  const logs = liveList(is.logs).slice().sort((a,b) => String(b.date).localeCompare(String(a.date)) || (b.updatedAt-a.updatedAt));
  if(!logs.length) return `<p class="empty">まだ旅日記がありません。「＋追加」で記録を。</p>`;
  return `<ul class="list">${logs.map(l=>
    `<li class="log"><span class="txt"><span class="d">${esc(l.date)}</span>${byBadge(l)}<br>${esc(l.text)}</span><span class="x" data-del="logs:${esc(l.id)}">✕</span></li>`).join('')}</ul>`;
}
function listShops(is){
  const shops = liveList(is.shops);
  if(!shops.length) return `<p class="empty">まだお店が登録されていません。</p>`;
  return `<ul class="list">${shops.map(s=>
    `<li class="shop"><span class="txt"><span class="t">${esc(s.name)}</span><span class="ty">${esc(s.type||'')}</span>${byBadge(s)}
      ${s.note?`<span class="n">${esc(s.note)}</span>`:''}
      ${safeUrl(s.url)?`<a class="lk" href="${esc(s.url)}" target="_blank" rel="noopener">🔗 ${esc(shortUrl(s.url))}</a>`:''}
    </span><span class="x" data-del="shops:${esc(s.id)}">✕</span></li>`).join('')}</ul>`;
}
function listSimple(is, key, ic){
  const arr = liveList(is[key]);
  if(!arr.length) return `<p class="empty">まだありません。</p>`;
  return `<ul class="list">${arr.map(t=>
    `<li><span class="ic">${ic}</span><span class="txt">${esc(t.text)}${byBadge(t)}</span><span class="x" data-del="${key}:${esc(t.id)}">✕</span></li>`).join('')}</ul>`;
}

/* ---------- パネル内のイベント ---------- */
function bindBody(is){
  const pi = $('#photoInput');
  if (pi) pi.addEventListener('change', e => addPhotos(is, e.target.files));
  $('#pBody').querySelectorAll('[data-delph]').forEach(b =>
    b.addEventListener('click', () => delPhoto(is, b.dataset.delph)));
  $('#pBody').querySelectorAll('[data-add]').forEach(b =>
    b.addEventListener('click', () => addEntry(is, b.dataset.add)));
  // カテゴリ絞り込み
  $('#pBody').querySelectorAll('.chip').forEach(ch =>
    ch.addEventListener('click', () => {
      const cat = ch.dataset.cat;
      const cats = usedCats(is);
      if (!STATE.catFilter){ STATE.catFilter = new Set(cats); }
      if (STATE.catFilter.has(cat)) STATE.catFilter.delete(cat); else STATE.catFilter.add(cat);
      if (STATE.catFilter.size === cats.length || STATE.catFilter.size === 0) STATE.catFilter = null;
      refreshSpots(is);
    }));
  // スポット行タップ → 地図で表示
  $('#pBody').querySelectorAll('.spotrow').forEach(li =>
    li.addEventListener('click', e => {
      if (e.target.closest('a') || e.target.closest('[data-delspot]')) return;
      focusSpot(is, li.dataset.spot);
    }));
  // スポット削除
  $('#pBody').querySelectorAll('[data-delspot]').forEach(b =>
    b.addEventListener('click', () => deleteSpot(is, b.dataset.delspot)));
  // その他エントリ削除（tombstone 化して同期でも消える）
  $('#pBody').querySelectorAll('[data-del]').forEach(b =>
    b.addEventListener('click', () => {
      const [key, id] = b.dataset.del.split(':');
      const cur = resolveIsland(is);
      const e = (cur[key]||[]).find(x => x.id === id);
      if (!e) return;
      Object.assign(e, { deleted: true }, stamp());
      saveIslands(); renderBody(cur);
    }));
}

async function addPhotos(is, files){
  const cur = resolveIsland(is);
  for (const f of files){
    if (!f.type.startsWith('image/')) continue;
    const pid = uid('ph');
    try { await PhotoDB.put(pid, f); cur.photos.push(pid); }
    catch(e){ toast('写真の保存に失敗'); }
  }
  saveIslands(); toast('写真を追加しました（写真は端末内のみ）'); openIsland(cur.id);
}
async function delPhoto(is, pid){
  const cur = resolveIsland(is);
  cur.photos = cur.photos.filter(p => p !== pid);
  try { await PhotoDB.del(pid); } catch(e){}
  saveIslands(); openIsland(cur.id);
}

/* ---------- 入力モーダル ---------- */
function modalForm(title, fields, onSubmit){
  const card = $('#formCard');
  card.innerHTML = `<h3>${esc(title)}</h3>` + fields.map(f => {
    const label = `<label>${esc(f.label)}</label>`;
    if (f.type === 'textarea')
      return label + `<textarea data-f="${f.name}" rows="3" placeholder="${esc(f.ph||'')}">${esc(f.value||'')}</textarea>`;
    if (f.type === 'select')
      return label + `<select data-f="${f.name}">${(f.options||[]).map(o =>
        `<option value="${esc(o)}"${o===f.value?' selected':''}>${esc(o)}</option>`).join('')}</select>`;
    return label + `<input data-f="${f.name}" type="${f.type||'text'}" ${f.step?`step="${f.step}"`:''} placeholder="${esc(f.ph||'')}" value="${esc(f.value==null?'':f.value)}">`;
  }).join('') +
  `<div class="actions"><button class="btn ghost" id="fCancel">キャンセル</button><button class="btn accent" id="fOk">保存</button></div>`;
  $('#formModal').classList.add('open');
  card.querySelector('input,textarea')?.focus();
  const close = () => $('#formModal').classList.remove('open');
  $('#fCancel').onclick = close;
  $('#fOk').onclick = () => {
    const v = {}; card.querySelectorAll('[data-f]').forEach(el => v[el.dataset.f] = el.value.trim());
    if (onSubmit(v) !== false) close();
  };
}

/* ---------- スポットの追加・編集 ---------- */
function spotForm(is, spot, latlng){
  const lat = spot ? spot.lat : (latlng ? +latlng.lat.toFixed(5) : +is.lat);
  const lng = spot ? spot.lng : (latlng ? +latlng.lng.toFixed(5) : +is.lng);
  modalForm(spot ? 'スポットを編集' : 'スポットを追加', [
    { name:'name', label:'スポット名', value: spot?.name || '' },
    { name:'cat', label:'カテゴリ', type:'select', options: CATS, value: spot?.cat || '観光' },
    { name:'url', label:'Webリンク（URL）', ph:'https://…（公式サイトや紹介ページ）', value: spot?.url || '' },
    { name:'note', label:'メモ', type:'textarea', ph:'見どころ・営業時間・注意点など', value: spot?.note || '' },
    { name:'lat', label:'緯度', type:'number', step:'any', value: lat },
    { name:'lng', label:'経度', type:'number', step:'any', value: lng },
  ], v => {
    if (!v.name){ toast('スポット名は必須です'); return false; }
    // +'' は 0 になるため、空文字は isFinite より先に弾く
    if (v.lat === '' || v.lng === '' || !isFinite(+v.lat) || !isFinite(+v.lng)){ toast('緯度・経度を入力してください'); return false; }
    if (v.url && !safeUrl(v.url)){ toast('URLは https:// で始まる形式にしてください'); return false; }
    const cur = resolveIsland(is);
    const fields = { name:v.name, cat:v.cat, url:v.url, note:v.note, lat:+v.lat, lng:+v.lng };
    if (spot){
      const target = (cur.spots || []).find(x => x.id === spot.id);
      if (target) Object.assign(target, fields, stamp());
      else cur.spots.push({ id: spot.id, ...fields, deleted:false, ...stamp() });
    } else {
      cur.spots.push({ id: uid('sp'), ...fields, deleted:false, ...stamp() });
    }
    saveIslands(); refreshSpots(cur);
    toast(spot ? 'スポットを更新しました' : 'スポットを追加しました');
    if (!authorName()) toast('共有設定で名前を入れると「誰の更新か」が表示されます');
  });
}

function addEntry(is, key){
  const today = new Date().toISOString().slice(0,10);
  if (key==='photos'){ $('#photoInput')?.click(); return; }
  if (key==='spots'){
    if (window.Kanko && Kanko.active()){
      toast('観光マップをタップしてスポットの位置を指定してください');
      Kanko.pick(latlng => spotForm(is, null, latlng));
    } else if (dmap){
      toast('地図をタップしてスポットの位置を指定してください');
      startPick(latlng => spotForm(is, null, latlng));
    } else {
      spotForm(is, null, null); // オフライン時は座標を手入力
    }
    return;
  }
  if (key==='logs'){
    modalForm('旅日記を追加', [
      {name:'date', label:'日付・時期', value:today},
      {name:'text', label:'できごと', type:'textarea', ph:'天気、誰と、何があったか…'}
    ], v => { if(!v.text) return false;
      const cur = resolveIsland(is);
      cur.logs.push({ id: uid('lg'), date:v.date||today, text:v.text, deleted:false, ...stamp() });
      saveIslands(); renderBody(cur); });
  } else if (key==='shops'){
    modalForm('お店を追加', [
      {name:'name', label:'店名'},
      {name:'type', label:'種類', ph:'食事 / カフェ / 買い出し など'},
      {name:'url', label:'Webリンク（URL）', ph:'https://…（任意）'},
      {name:'note', label:'メモ', type:'textarea', ph:'名物・営業時間など'}
    ], v => { if(!v.name) return false;
      if (v.url && !safeUrl(v.url)){ toast('URLは https:// で始まる形式にしてください'); return false; }
      const cur = resolveIsland(is);
      cur.shops.push({ id: uid('sh'), name:v.name, type:v.type, note:v.note, url:v.url, deleted:false, ...stamp() });
      saveIslands(); renderBody(cur); });
  } else { // knowledge / tips
    const t = key==='knowledge' ? 'ナレッジを追加' : 'Tipsを追加';
    modalForm(t, [{name:'text', label:'内容', type:'textarea'}], v => {
      if(!v.text) return false;
      const cur = resolveIsland(is);
      cur[key].push({ id: uid('kt'), text:v.text, deleted:false, ...stamp() });
      saveIslands(); renderBody(cur);
    });
  }
}

/* 島そのものを追加 */
function addIsland(){
  modalForm('島を追加', [
    {name:'name', label:'島の名前'},
    {name:'region', label:'エリア', ph:'伊豆諸島 / 沖縄の島 など'},
    {name:'pref', label:'都道府県', ph:'東京都 など'},
    {name:'lat', label:'緯度（例 34.75）', type:'number', step:'any'},
    {name:'lng', label:'経度（例 139.36）', type:'number', step:'any'},
    {name:'summary', label:'ひとことメモ', type:'textarea'}
  ], v => {
    if(!v.name || !v.lat || !v.lng){ toast('名前・緯度・経度は必須です'); return false; }
    const id = uid('is');
    STATE.islands.push(migrateIsland({
      id, name:v.name, region:v.region||'その他', pref:v.pref||'',
      lat:+v.lat, lng:+v.lng, firstVisit:String(new Date().getFullYear()), visits:1, fav:false,
      summary:v.summary||'', updatedAt: Date.now(),
      photos:[], spots:[], shops:[], knowledge:[], tips:[], logs:[]
    }));
    saveIslands(); renderMap(); openIsland(id); toast('島を追加しました');
  });
}

/* ---------- ズーム / パン（全国SVG） ---------- */
function applyView(){ renderMap(); }
function zoomBy(factor, cx=VW/2, cy=VH/2){
  const v = STATE.view;
  const ns = Math.min(6, Math.max(1, v.scale*factor));
  v.tx = cx - (cx - v.tx) * (ns/v.scale);
  v.ty = cy - (cy - v.ty) * (ns/v.scale);
  v.scale = ns;
  clampView(); applyView();
}
function clampView(){
  const v = STATE.view;
  const minTx = VW - VW*v.scale, minTy = VH - VH*v.scale;
  v.tx = Math.min(0, Math.max(minTx, v.tx));
  v.ty = Math.min(0, Math.max(minTy, v.ty));
}
function resetView(){ STATE.view = {scale:1, tx:0, ty:0}; applyView(); }

let drag = null;
function svgPoint(ev){
  const r = svg.getBoundingClientRect();
  const px = (ev.touches?ev.touches[0].clientX:ev.clientX) - r.left;
  const py = (ev.touches?ev.touches[0].clientY:ev.clientY) - r.top;
  return { x: px / r.width * VW, y: py / r.height * VH };
}
svg.addEventListener('mousedown', e => {
  if (STATE.viewMode === 'side'){ drag = {...svgPoint(e), stx:STATE.sideTx}; svg.classList.add('dragging'); return; }
  drag = {...svgPoint(e), tx:STATE.view.tx, ty:STATE.view.ty}; svg.classList.add('dragging');
});
window.addEventListener('mousemove', e => {
  if(!drag) return;
  const p = svgPoint(e);
  if (STATE.viewMode === 'side'){ STATE.sideTx = drag.stx + (p.x - drag.x); renderMap(); return; }
  STATE.view.tx = drag.tx + (p.x - drag.x)*STATE.view.scale;
  STATE.view.ty = drag.ty + (p.y - drag.y)*STATE.view.scale;
  clampView(); applyView();
});
window.addEventListener('mouseup', () => { drag=null; svg.classList.remove('dragging'); });
svg.addEventListener('wheel', e => {
  e.preventDefault();
  if (STATE.viewMode === 'side'){ STATE.sideTx -= e.deltaY*0.9; renderMap(); return; }
  zoomBy(e.deltaY<0?1.15:0.87, ...Object.values(svgPoint(e)));
}, {passive:false});
let pinch = null;
svg.addEventListener('touchstart', e => {
  if (STATE.viewMode === 'side'){
    if(e.touches.length===1) drag = {...svgPoint(e), stx:STATE.sideTx};
    return;
  }
  if(e.touches.length===1){ drag = {...svgPoint(e), tx:STATE.view.tx, ty:STATE.view.ty}; }
  else if(e.touches.length===2){ drag=null; pinch = touchDist(e); }
}, {passive:true});
svg.addEventListener('touchmove', e => {
  if (STATE.viewMode === 'side'){
    if(e.touches.length===1 && drag){ const p=svgPoint(e); STATE.sideTx = drag.stx + (p.x-drag.x); renderMap(); }
    return;
  }
  if(e.touches.length===1 && drag){
    const p=svgPoint(e);
    STATE.view.tx = drag.tx + (p.x-drag.x)*STATE.view.scale;
    STATE.view.ty = drag.ty + (p.y-drag.y)*STATE.view.scale;
    clampView(); applyView();
  } else if(e.touches.length===2 && pinch){
    const d=touchDist(e); zoomBy(d/pinch); pinch=d;
  }
}, {passive:true});
svg.addEventListener('touchend', () => { drag=null; pinch=null; });
function touchDist(e){ const a=e.touches[0],b=e.touches[1]; return Math.hypot(a.clientX-b.clientX, a.clientY-b.clientY); }

/* ---------- お気に入りトグル ---------- */
$('#pFav').addEventListener('click', () => {
  const is = islandById(STATE.activeId); if(!is) return;
  is.fav = !is.fav; is.updatedAt = Date.now(); saveIslands(); openIsland(is.id);
});

/* ---------- 共有同期の実行 ---------- */
let syncTimer = null, syncBusy = false;
const TOMBSTONE_TTL = 90 * 24 * 60 * 60 * 1000; // 削除跡は90日後に掃除

function purgeTombstones(islands){
  const cutoff = Date.now() - TOMBSTONE_TTL;
  for (const is of islands)
    for (const k of LIST_KEYS)
      // シード由来（id が chash の 'sd' 始まり）の墓標は掃除しない。
      // シードは毎起動 data.js から再注入されるため、墓標が消えると削除が復活してしまう。
      is[k] = (is[k]||[]).filter(e => !e.deleted || e.id.startsWith('sd') || (e.updatedAt||0) > cutoff);
  return islands;
}

function scheduleSync(){
  updateSyncUI();
  if (!Sync.enabled()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncNow(), 2500);
}

async function syncNow(){
  if (!Sync.enabled() || syncBusy) return;
  syncBusy = true; Sync.status.busy = true; updateSyncUI();
  try {
    const remote = await Sync.pull();
    const remoteIslands = (remote.islands || []).map(migrateIsland);
    const before = canon(STATE.islands);
    const merged = purgeTombstones(mergeIslands(STATE.islands, remoteIslands));
    const mergedCanon = canon(merged);
    const changedLocally = mergedCanon !== before;
    if (changedLocally){
      // 内容が変わったときだけ差し替える。変わっていなければ既存オブジェクトを保つ
      //（開いているパネルやフォームが掴んでいる参照を無効化しないため）
      STATE.islands = merged;
      saveLocal();
    }
    if (Sync.canPush() && mergedCanon !== canon(remoteIslands)){
      await Sync.push(STATE.islands.map(stripIsland));
    }
    Sync.status.lastSync = Date.now(); Sync.status.error = '';
    if (changedLocally){
      renderMap();
      const is = islandById(STATE.activeId);
      if (is && $('#panel').classList.contains('open')){ rebuildMarkers(is); renderBody(is); }
    }
  } catch(e){
    Sync.status.error = e.message || String(e);
  } finally {
    syncBusy = false; Sync.status.busy = false; updateSyncUI();
  }
}

function updateSyncUI(){
  const b = $('#syncBtn');
  b.classList.remove('ok','err','busy');
  if (Sync.status.busy) b.classList.add('busy');
  else if (!Sync.enabled()) {/* 灰色のまま */}
  else if (Sync.status.error) b.classList.add('err');
  else if (Sync.status.lastSync) b.classList.add('ok');
  b.title = !Sync.enabled() ? '共有未設定（タップして設定）'
    : Sync.status.error ? '同期エラー: ' + Sync.status.error
    : Sync.status.lastSync ? '最終同期 ' + new Date(Sync.status.lastSync).toLocaleTimeString('ja-JP')
    : '共有設定済み';
}

/* ---------- 共有設定モーダル ---------- */
function openShareModal(){
  const c = Sync.cfg();
  $('#shareName').value = c.name || '';
  $('#shareCode').value = c.gistId ? Sync.formatCode(c.gistId, c.token) : '';
  renderShareStatus();
  $('#shareModal').classList.add('open');
}
function renderShareStatus(){
  const el = $('#shareStatus');
  if (!Sync.enabled()){ el.textContent = '共有は未設定です。コードを貼り付けるか、下の「共有グループを作成」から始められます。'; return; }
  el.textContent = (Sync.canPush() ? '✅ 送受信できます。' : '👀 受信のみ（コードにトークンが含まれていません）。')
    + (Sync.status.lastSync ? ' 最終同期 ' + new Date(Sync.status.lastSync).toLocaleString('ja-JP') : '')
    + (Sync.status.error ? ' ⚠ ' + Sync.status.error : '');
}
$('#shareSave').onclick = async () => {
  const name = $('#shareName').value.trim();
  const codeRaw = $('#shareCode').value.trim();
  if (codeRaw){
    const p = Sync.parseCode(codeRaw);
    if (!p){ toast('共有コードの形式が正しくありません（ic1. で始まるコード）'); return; }
    Sync.setCfg({ name, gistId: p.gistId, token: p.token });
  } else {
    // コード欄を空にして保存 = 共有をやめる（トークンも端末から消す）
    const wasEnabled = Sync.enabled();
    Sync.setCfg({ name, gistId: '', token: '' });
    if (wasEnabled){
      Sync.status.lastSync = 0; Sync.status.error = '';
      updateSyncUI(); renderShareStatus();
      toast('共有を解除しました（この端末のデータは残ります）');
      return;
    }
  }
  toast('保存しました。同期します…');
  await syncNow();
  renderShareStatus();
  if (!Sync.status.error && Sync.enabled()) { toast('同期しました'); }
};
$('#createGroupBtn').onclick = async () => {
  const token = $('#newGroupToken').value.trim();
  if (!token){ toast('トークンを入力してください'); return; }
  $('#createGroupBtn').disabled = true;
  try {
    const name = $('#shareName').value.trim();
    if (name) Sync.setCfg({ name });
    const code = await Sync.createGroup(token, STATE.islands.map(stripIsland));
    $('#shareCode').value = code;
    $('#newGroupToken').value = '';
    renderShareStatus();
    await syncNow();
    let copied = false;
    try { await navigator.clipboard.writeText(code); copied = true; } catch(e){}
    toast(copied ? '共有グループを作成し、コードをコピーしました。メンバーに送ってください'
                 : '共有グループを作成しました。上のコードをメンバーに送ってください');
  } catch(e){
    toast('作成に失敗: ' + (e.message || e));
  } finally {
    $('#createGroupBtn').disabled = false;
  }
};
$('#shareClose').onclick = () => $('#shareModal').classList.remove('open');
$('#shareModal').addEventListener('click', e => { if(e.target.id==='shareModal') e.currentTarget.classList.remove('open'); });

/* ---------- データ入出力 ---------- */
async function exportData(){
  const photos = await PhotoDB.all();
  const photoData = {};
  for (const [k,blob] of Object.entries(photos)){ photoData[k] = await blobToDataURL(blob); }
  const payload = { version:2, exportedAt:new Date().toISOString(), islands:STATE.islands, photos:photoData };
  const blob = new Blob([JSON.stringify(payload)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `island-camp-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  toast('バックアップを書き出しました');
}
async function importData(file){
  try {
    const text = await file.text();
    const p = JSON.parse(text);
    if(!p.islands) throw new Error('形式が不正');
    STATE.islands = mergeIslands(p.islands.map(migrateIsland), seedIslands());
    saveIslands();
    if(p.photos){ for(const [k,durl] of Object.entries(p.photos)){ await PhotoDB.put(k, dataURLtoBlob(durl)); } }
    renderMap(); $('#dataModal').classList.remove('open'); toast('読み込み完了');
  } catch(e){ toast('読み込みに失敗しました'); }
}
function blobToDataURL(blob){ return new Promise(res=>{const r=new FileReader(); r.onload=()=>res(r.result); r.readAsDataURL(blob);}); }
function dataURLtoBlob(durl){ const [h,b]=durl.split(','); const mime=h.match(/:(.*?);/)[1]; const bin=atob(b); const u=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i); return new Blob([u],{type:mime}); }

/* ---------- UI 配線 ---------- */
function closePanel(){
  $('#panel').classList.remove('open');
  $('#pDim').classList.remove('show');
  $('#dmapwrap').classList.remove('full');
  $('#dmapFull').textContent = '⤢ 拡大';
  cancelPick();
  STATE.activeId=null; renderMap();
}
$('#closePanel').onclick = closePanel;
$('#pDim').onclick = closePanel;
// 携帯縦のシート: つまみ（ヘッダ）を下にスワイプで閉じる
(() => {
  const head = document.querySelector('#panel .phead');
  let sy = null;
  head.addEventListener('touchstart', e => {
    if (e.target.closest('button,.fav-toggle')) return;
    sy = e.touches[0].clientY;
  }, {passive:true});
  head.addEventListener('touchmove', e => {
    if (sy == null) return;
    if (e.touches[0].clientY - sy > 70){ sy = null; closePanel(); }
  }, {passive:true});
  head.addEventListener('touchend', () => { sy = null; });
})();
$('#zin').onclick = () => zoomBy(1.3);
$('#zout').onclick = () => zoomBy(0.77);
$('#zreset').onclick = resetView;
$('#addIslandBtn').onclick = addIsland;
$('#menuBtn').onclick = () => $('#dataModal').classList.add('open');
$('#closeData').onclick = () => $('#dataModal').classList.remove('open');
$('#shareOpenBtn').onclick = () => { $('#dataModal').classList.remove('open'); openShareModal(); };
$('#syncBtn').onclick = () => { if (Sync.enabled()) syncNow(); openShareModal(); };
$('#exportBtn').onclick = exportData;
$('#importBtn').onclick = () => $('#importFile').click();
$('#importFile').onchange = e => e.target.files[0] && importData(e.target.files[0]);
$('#resetBtn').onclick = () => {
  if(confirm('この端末で追加・編集した内容を消して初期データに戻します。（共有中の場合、次の同期でみんなのデータが戻ります）よろしいですか？')){
    localStorage.removeItem(LS_KEY); localStorage.removeItem(LS_KEY_V1);
    STATE.islands = seedIslands();
    saveLocal(); $('#dataModal').classList.remove('open'); $('#panel').classList.remove('open'); renderMap(); toast('初期データに戻しました');
  }
};
$('#dmapFull').onclick = () => {
  const wrap = $('#dmapwrap');
  const full = wrap.classList.toggle('full');
  $('#dmapFull').textContent = full ? '✕ 閉じる' : '⤢ 拡大';
  if (dmap) setTimeout(() => dmap.invalidateSize(), 60);
};
$('#sidePrev').onclick = () => { STATE.sideTx += 390; renderMap(); };
$('#sideNext').onclick = () => { STATE.sideTx -= 390; renderMap(); };
$('#viewToggle').onclick = () => {
  STATE.viewMode = STATE.viewMode === 'side' ? 'map' : 'side';
  const side = STATE.viewMode === 'side';
  $('#viewToggle').textContent = side ? '🗾 地図にもどる' : '⛰ 横からながめる';
  document.querySelector('.mapwrap').classList.toggle('side-mode', side);
  $('#hint').classList.add('hidden');
  if (side) STATE.sideTx = 0;
  renderMap();
};
$('#dataModal').addEventListener('click', e => { if(e.target.id==='dataModal') e.currentTarget.classList.remove('open'); });
$('#formModal').addEventListener('click', e => { if(e.target.id==='formModal') e.currentTarget.classList.remove('open'); });

/* ---------- ユーティリティ ---------- */
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function safeUrl(u){ return /^https?:\/\/\S+$/i.test(String(u||'')); }
function shortUrl(u){ try { const x = new URL(u); return x.hostname.replace(/^www\./,'') + (x.pathname !== '/' ? '/…' : ''); } catch(e){ return u; } }
let toastTimer;
function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'),2600); }

/* ---------- 起動 ---------- */
$('#appVer').textContent = 'v' + APP_VERSION + '（変更点は CHANGELOG.md）';
renderMap();
// v1→v2 移行やシード取り込みの結果を確定。
// ただし保存データが破損していた場合は上書きしない（-corrupt キーに退避済み）
if (!loadFailed) saveLocal();
updateSyncUI();
if (Sync.enabled()) syncNow();
setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 90000);
window.addEventListener('focus', () => syncNow());
