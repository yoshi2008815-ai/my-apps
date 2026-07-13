// ===== 島キャンプ思い出マップ : アプリ本体 =====
'use strict';

/* ---------- 投影（緯度経度 → SVG座標） ---------- */
// 日本の島々が収まる範囲
const BOUNDS = { latN: 46, latS: 23.5, lngW: 122, lngE: 146 };
const VW = 800, VH = 1000;
function project(lat, lng){
  const x = (lng - BOUNDS.lngW) / (BOUNDS.lngE - BOUNDS.lngW) * VW;
  const y = (BOUNDS.latN - lat) / (BOUNDS.latN - BOUNDS.latS) * VH;
  return { x, y };
}

/* ---------- 永続化 ---------- */
const LS_KEY = 'island-camp/islands-v1';

const STATS_KEY = 'island-camp/stats-v';
const STATS_VERSION = 2; // v2: OneNote実記録（2004〜2025）を反映

function loadIslands(){
  let list;
  try {
    const raw = localStorage.getItem(LS_KEY);
    list = raw ? JSON.parse(raw) : null;
  } catch(e){ list = null; }
  if (!list){
    try { localStorage.setItem(STATS_KEY, String(STATS_VERSION)); } catch(e){}
    return deepClone(window.SEED_ISLANDS || []);
  }
  // 保存済みデータに無い「シードの島（新規ロスター等）」を補完（ユーザー編集は維持）
  const have = new Set(list.map(i => i.id));
  for (const seed of (window.SEED_ISLANDS || [])){
    if (!have.has(seed.id)) list.push(deepClone(seed));
  }
  migrateStats(list);
  return list;
}
// 訪問統計（初訪問年・回数・訪問年・★）をシードの実記録で上書きする一回きりの移行。
// 写真・日記・お店・ナレッジ等のユーザーデータは維持する。
function migrateStats(list){
  try {
    if (+(localStorage.getItem(STATS_KEY) || 1) >= STATS_VERSION) return;
    const seedById = new Map((window.SEED_ISLANDS || []).map(s => [s.id, s]));
    for (const is of list){
      const s = seedById.get(is.id);
      if (!s) continue; // ユーザーが追加した島はそのまま
      is.firstVisit = s.firstVisit;
      is.visits = s.visits;
      is.years = s.years ? [...s.years] : [];
      is.fav = s.fav;
      if (is.id === 'izu-oshima')
        is.logs = (is.logs || []).filter(l => !(l.date === '2005' && /初めての島キャンプ/.test(l.text || '')));
      if (is.id === 'shikinejima' && !(is.logs || []).some(l => /初めての島キャンプ/.test(l.text || '')))
        (is.logs = is.logs || []).unshift({ date: '2004', text: '初めての島キャンプ。すべてここから始まった。' });
    }
    localStorage.setItem(LS_KEY, JSON.stringify(list));
    localStorage.setItem(STATS_KEY, String(STATS_VERSION));
  } catch(e){}
}
function saveIslands(){
  try { localStorage.setItem(LS_KEY, JSON.stringify(STATE.islands)); }
  catch(e){ toast('保存に失敗しました（容量超過の可能性）'); }
}
function deepClone(o){ return JSON.parse(JSON.stringify(o)); }

/* ---------- 写真・動画・ドキュメントは IndexedDB に保存 ----------
   photos: 島の写真 / media: アルバムの写真・動画（+サムネ） / files: ドキュメント */
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
  region: 'all',                   // エリアタブの選択
  viewMode: 'map',                 // 'map' | 'side'（横からビュー）
  sideTx: 0,                       // 横からビューの横スクロール量
  view: { scale: 1, tx: 0, ty: 0 } // SVGズーム/パン
};

const $ = sel => document.querySelector(sel);
const svg = $('#map');
const SVGNS = 'http://www.w3.org/2000/svg';

/* ---------- 地図データ（陸地は実海岸線: geo.js / OpenStreetMap ODbL） ---------- */
const GEO = window.GEO || { islands:{}, land:{}, refs:{}, miyakeDetail:[], miyakeSpots:[] };
const REF_NAMES = { tsushima:'対馬' }; // 諸島ロスターに昇格した島は island 側で描く
const PROMOTED_REFS = new Set(['tanegashima','miyako','okinawa']); // ref描画から除外

/* ---------- 島の見た目（可愛い立体イラスト） ---------- */
// kind: 火山(cone) / 丸い丘(dome) / 平らな隆起サンゴ＋ヤシ(flat) / ふたこぶ(twin) / 深い森(forest)
const ISLAND_KIND = {
  'izu-oshima':'cone','toshima':'cone','niijima':'dome','shikinejima':'flat',
  'kozushima':'dome','miyakejima':'cone','mikurajima':'dome','hachijojima':'twin','aogashima':'cone',
  'yakushima':'forest','tanegashima':'flat','amami-oshima':'forest','kikaijima':'flat','tokunoshima':'dome',
  'okinoerabu':'flat','yoron':'flat','okinawa-hontou':'dome','miyako':'flat','kumejima':'dome',
  'ishigaki':'dome','iriomote':'forest','yonaguni':'dome','hateruma':'flat'
};
function islandKind(is){ return ISLAND_KIND[is.id] || 'dome'; }

/* ---------- 島の名産（横からビューのバッジ＆詳細パネルに表示） ---------- */
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
// 島の基本サイズ（viewBox単位・画面固定）。訪問が多いほど大きく、未訪問は小さめ。
function islandRadius(is){
  const v = is.visits||0;
  if(!v) return 11;
  return 13 + Math.min(10, v*0.7);
}

/* ---------- 描画ユーティリティ ---------- */
function polyPoints(coords){
  return coords.map(([la,ln])=>{const p=project(la,ln);return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;}).join(' ');
}
function centroid(coords){
  const pts=coords.map(([la,ln])=>project(la,ln));
  return {x:pts.reduce((s,p)=>s+p.x,0)/pts.length, y:pts.reduce((s,p)=>s+p.y,0)/pts.length};
}

/* ---------- 地図描画 ---------- */
function drawBase(){
  // 海の背景（やわらかいグラデーション）
  let g = `<defs><linearGradient id="seaG" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#d8edf5"/><stop offset="1" stop-color="#c3e1ee"/>
    </linearGradient></defs>`;
  g += `<rect width="${VW}" height="${VH}" fill="url(#seaG)"/>`;
  // 参考地形（対馬のみ：実海岸線。位置の手がかりに薄く。他は島イラストで描く）
  for(const [key, rings] of Object.entries(GEO.refs)){
    if (PROMOTED_REFS.has(key)) continue;
    for(const ring of rings){
      g+=`<polygon points="${polyPoints(ring)}" fill="#eee9da" stroke="#d6cfba" stroke-width="1" stroke-linejoin="round"/>`;
    }
    const big = rings.reduce((a,b)=> a.length>=b.length?a:b);
    const c = centroid(big);
    g+=`<text x="${c.x.toFixed(1)}" y="${c.y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle"
          fill="#ab9f8a" font-size="10" font-weight="600" paint-order="stroke" stroke="#f2eddf" stroke-width="3px">${esc(REF_NAMES[key]||'')}</text>`;
  }
  // 陸地（本州・北海道・九州・四国：実海岸線）
  for(const rings of Object.values(GEO.land)){
    for(const ring of rings){
      g+=`<polygon points="${polyPoints(ring)}" fill="none" stroke="#ffffff" stroke-width="4" stroke-linejoin="round" opacity=".7"/>`;
    }
  }
  for(const rings of Object.values(GEO.land)){
    for(const ring of rings){
      g+=`<polygon points="${polyPoints(ring)}" fill="#f0ebdc" stroke="#d8d2be" stroke-width="1" stroke-linejoin="round"/>`;
    }
  }
  // 地域ラベル
  const labels=[['本州',36.5,137.0],['九州',32.0,130.3],['北海道',43.6,142.5],
    ['日本海',39.5,134.5],['太平洋',33.0,135.5],['東シナ海',28.0,125.5]];
  for(const[t,la,ln] of labels){const p=project(la,ln);
    g+=`<text x="${p.x.toFixed(1)}" y="${p.y.toFixed(1)}" text-anchor="middle" fill="#9cbac6" font-size="13" font-weight="700" letter-spacing="3" opacity=".85">${t}</text>`;}
  return g;
}

/* ---------- 島の描画（ズームに応じて拡大＋横顔に立ち上がる） ---------- */
// 0 = 真上から、1 = 横から。ズームするほど横顔に。
function standUp(){ return Math.max(0, Math.min(1, (STATE.view.scale - 1) / 2.2)); }
// ズームすると島イラストも大きくなる（地図よりゆるやかに＝重なり防止）
function glyphK(){ return Math.min(2.8, Math.pow(STATE.view.scale, 0.55)); }
// 島の中心を画面（viewBox）座標へ。陸地グループと同じ tx + px*scale。
function islandScreen(is){
  const p = project(is.lat, is.lng);
  return { x: STATE.view.tx + p.x*STATE.view.scale, y: STATE.view.ty + p.y*STATE.view.scale };
}
function drawIslands(){
  const t = standUp();
  // 南（緯度小）の島ほど手前＝後に描画して、立ち上がり時に手前が前面へ（重なり対策）
  const order = [...STATE.islands].sort((a,b) => b.lat - a.lat);
  return order.map(is => islandGlyph(is, t)).join('');
}
function islandGlyph(is, t){
  const { x:sx, y:sy } = islandScreen(is);
  if (sx < -90 || sx > VW+90 || sy < -90 || sy > VH+150) return ''; // 画面外は省略
  const active  = is.id === STATE.activeId;
  const visited = (is.visits||0) > 0;
  const r  = islandRadius(is) * glyphK() * (active ? 1.1 : 1);
  const H  = r * (0.55 + 1.30*t);                    // 立ち上がり高さ
  const ry = r * (0.52 - 0.20*t);                    // 海面楕円の縦（立つほど薄く）
  const showLabel = STATE.view.scale >= 1.45 || is.fav || active;
  return isleArt(is, sx, sy, r, H, ry,
    {active, visited, op: visited ? 1 : 0.55, showLabel, labelSize: 13, visitsSize: 11, visitsGap: 15});
}

// 島イラスト共通パーツ（地図モード・横からビューで共用）
const ISLE_DEFS = `
  <linearGradient id="gVis" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a3de81"/><stop offset="1" stop-color="#5cae54"/></linearGradient>
  <linearGradient id="gFav" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d3e690"/><stop offset="1" stop-color="#8cbf58"/></linearGradient>
  <linearGradient id="gUns" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c2d2b8"/><stop offset="1" stop-color="#93ab8c"/></linearGradient>
  <linearGradient id="gAct" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#abe98a"/><stop offset="1" stop-color="#4da44e"/></linearGradient>`;
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
  return `<g class="isle${o.visited?'':' unseen'}${o.active?' active':''}" data-id="${is.id}" style="opacity:${o.op}">${shadow}${foam}${beach}${land}${ring}${fav}${label}</g>`;
}
// 種類ごとの陸地シルエット。sx,sy=海面中心、Hだけ上へ立ち上がる。ぷっくり可愛く。
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
  if (kind === 'twin'){ // ふたこぶ（八丈島）まるいマウンド×2
    const right = `M ${n(sx-w*0.10)} ${n(sy)} Q ${n(sx+w*0.42)} ${n(sy-H*1.5)} ${n(sx+w)} ${n(sy)} Z`;
    const left  = `M ${n(sx-w)} ${n(sy)} Q ${n(sx-w*0.56)} ${n(sy-H*1.05)} ${n(sx-w*0.04)} ${n(sy)} Z`;
    return P(left) + P(right)
      + hi(`M ${n(sx+w*0.16)} ${n(sy-H*0.86)} Q ${n(sx+w*0.40)} ${n(sy-H*1.02)} ${n(sx+w*0.58)} ${n(sy-H*0.72)}`);
  }
  if (kind === 'flat'){ // 平らな隆起サンゴ＋ヤシの木（ココナッツ付き）
    const fh = H*0.48, cr = r*0.22;
    const body = `M ${n(sx-w)} ${n(sy)} L ${n(sx-w)} ${n(sy-fh+cr)} Q ${n(sx-w)} ${n(sy-fh)} ${n(sx-w+cr)} ${n(sy-fh)} L ${n(sx+w-cr)} ${n(sy-fh)} Q ${n(sx+w)} ${n(sy-fh)} ${n(sx+w)} ${n(sy-fh+cr)} L ${n(sx+w)} ${n(sy)} Z`;
    const px = sx+w*0.18, py = sy-fh, th = H*0.85, tx = px+r*0.03, ty = py-th;
    const trunk = `<path d="M ${n(px)} ${n(py)} q ${n(r*0.10)} ${n(-th*0.55)} ${n(r*0.03)} ${n(-th)}" stroke="#a5825a" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
    const leaf = (rot) => `<ellipse cx="${n(tx)}" cy="${n(ty)}" rx="${n(r*0.26)}" ry="${n(r*0.085)}" transform="rotate(${rot} ${n(tx)} ${n(ty)}) translate(${n(r*0.2)} 0)" fill="#57b25c" stroke="${edge}" stroke-width="0.5"/>`;
    const palm = trunk + `<g>${leaf(-150)}${leaf(-110)}${leaf(-60)}${leaf(-20)}</g>`
      + `<circle cx="${n(tx-r*0.05)}" cy="${n(ty+r*0.07)}" r="${n(r*0.06)}" fill="#8a6a4a"/><circle cx="${n(tx+r*0.06)}" cy="${n(ty+r*0.09)}" r="${n(r*0.06)}" fill="#8a6a4a"/>`;
    return P(body) + hi(`M ${n(sx-w*0.7)} ${n(sy-fh*0.55)} L ${n(sx-w*0.15)} ${n(sy-fh*0.55)}`) + palm;
  }
  // dome（丸い丘・既定）ぷっくり＋ハイライト
  const body = `M ${n(sx-w)} ${n(sy)} Q ${n(sx)} ${n(sy-H*1.55)} ${n(sx+w)} ${n(sy)} Z`;
  return P(body) + hi(`M ${n(sx-w*0.5)} ${n(sy-H*0.72)} Q ${n(sx-w*0.14)} ${n(sy-H*1.12)} ${n(sx+w*0.22)} ${n(sy-H*1.0)}`);
}

function renderMap(){
  if (STATE.viewMode === 'side'){ renderSideView(); return; }
  const { scale, tx, ty } = STATE.view;
  const svgH = svg.getBoundingClientRect().height;
  STATE.vScale = svgH > 0 ? svgH / VH : 0.73;
  // 陸地は拡大グループ内、島イラストは画面固定サイズで上に重ねる
  svg.innerHTML =
    `<defs>${ISLE_DEFS}</defs>` +
    `<g transform="translate(${tx},${ty}) scale(${scale})">${drawBase()}</g>` +
    `<g class="isles">${drawIslands()}</g>`;
  bindIsleClicks();
}
function bindIsleClicks(){
  svg.querySelectorAll('.isle').forEach(el => {
    el.addEventListener('click', ev => { ev.stopPropagation(); openIsland(el.dataset.id); });
  });
}

/* ---------- 横からビュー（パノラマ：島が重ならない） ---------- */
const REGION_NAME = { izu:'伊豆諸島', kago:'鹿児島の島', oki:'沖縄の島' };
function sideIslands(){
  let list = STATE.islands;
  const rn = REGION_NAME[STATE.region];
  if (rn) list = list.filter(i => i.region === rn);
  return [...list].sort((a,b) => b.lat - a.lat); // 北 → 南 ＝ 左 → 右
}
function cloudSVG(x,y,s=1){
  return `<g fill="#fff" opacity=".85" transform="translate(${x},${y}) scale(${s})">
    <ellipse rx="46" ry="17"/><circle cx="-18" cy="-11" r="15"/><circle cx="14" cy="-13" r="19"/></g>`;
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
    // 名産バッジ（島の上・ゆげより高い位置）：大きな絵＋名前の2段
    const sp = SPECIALTY[is.id];
    if (sp){
      const spY = HZ - r*1.3 - r*0.62 - 6;
      items += `<text x="${sx.toFixed(1)}" y="${(spY-24).toFixed(1)}" text-anchor="middle" font-size="34">${sp.ic}</text>`
        + `<text x="${sx.toFixed(1)}" y="${spY.toFixed(1)}" text-anchor="middle" font-size="17" font-weight="800"
        fill="#17395f" paint-order="stroke" stroke="#fff" stroke-width="4" opacity=".95">${esc(sp.name)}</text>`;
    }
  });
  g += `<g class="isles">${items}</g>`;
  const rgLabel = {all:'すべての島', izu:'伊豆諸島', kago:'屋久島・奄美', oki:'沖縄・先島'}[STATE.region||'all'] || 'すべての島';
  g += `<text x="24" y="${VH-36}" fill="#fff" font-size="17" font-weight="800" opacity=".95">⛵ ${rgLabel}（北 → 南）${width>VW?'・ドラッグで移動':''}</text>`;
  svg.innerHTML = g;
  bindIsleClicks();
  // 左右スクロールボタンの有効/無効
  const prevB = $('#sidePrev'), nextB = $('#sideNext');
  if (prevB && nextB){
    prevB.classList.toggle('off', STATE.sideTx >= 0);
    nextB.classList.toggle('off', STATE.sideTx <= minTx + 1);
  }
}

/* ---------- 左ペイン：年次別インデックス ---------- */
function idxItemHTML(is){
  const active  = is.id === STATE.activeId;
  const visited = (is.visits||0) > 0;
  const ic = is.fav ? '★' : (visited ? '🏝' : '○');
  return `<button class="idx-item${visited?'':' unseen'}${active?' active':''}" data-id="${is.id}">
    <span class="ic">${ic}</span><span class="nm">${esc(is.name)}</span>
    <span class="vc">${visited ? is.visits+'回' : '未訪問'}</span>
  </button>`;
}
function renderIndexPanel(){
  const body = $('#idxBody');
  if (!body) return;
  // 訪問した年ごとにグループ化（同じ島が複数の年に登場する＝年表形式）
  const byYear = new Map();
  for (const i of STATE.islands){
    const ys = (i.years && i.years.length) ? i.years : (i.firstVisit ? [+i.firstVisit] : []);
    for (const y of ys){
      if (!byYear.has(y)) byYear.set(y, []);
      byYear.get(y).push(i);
    }
  }
  const years = [...byYear.keys()].sort((a,b) => a - b);
  const noYear = STATE.islands.filter(i => !(i.visits||0) && !i.firstVisit);
  let html = '', prev = null;
  for (const y of years){
    if (prev === 2019 && y >= 2024){
      html += `<div class="idx-year"><div class="idx-year-h"><span class="y" style="font-size:.9rem">😷 2020–2023</span><span class="n">コロナでお休み</span></div></div>`;
    }
    const items = byYear.get(y);
    html += `<div class="idx-year"><div class="idx-year-h"><span class="y">${y}年</span><span class="n">${items.length}島</span></div>
      <div class="idx-list">${items.map(idxItemHTML).join('')}</div></div>`;
    prev = y;
  }
  if (noYear.length){
    html += `<div class="idx-year"><div class="idx-year-h"><span class="y">🗺 まだ行ったことのない島</span><span class="n">${noYear.length}島</span></div>
      <div class="idx-list">${noYear.map(idxItemHTML).join('')}</div></div>`;
  }
  body.innerHTML = html;
  body.querySelectorAll('.idx-item').forEach(el => {
    el.addEventListener('click', () => {
      openIsland(el.dataset.id);
      if (window.matchMedia('(max-width:760px)').matches) $('#idxPanel').classList.remove('open');
    });
  });
}

/* ---------- 詳細パネル ---------- */
function islandById(id){ return STATE.islands.find(i => i.id === id); }

async function openIsland(id){
  const is = islandById(id);
  if (!is) return;
  STATE.activeId = id;
  renderIndexPanel();
  $('#hint').classList.add('hidden');
  $('#pBadge').textContent = is.region + ' / ' + is.pref;
  $('#pTitle').textContent = is.name;
  $('#pFav').textContent = is.fav ? '★' : '☆';
  $('#pFav').style.color = is.fav ? 'var(--fav)' : 'var(--sub)';
  const sp = SPECIALTY[is.id];
  const yrs = (is.years && is.years.length) ? `（${is.years.join('・')}）` : '';
  $('#pMeta').innerHTML =
    `<span>📍 初訪問 ${esc(is.firstVisit||'—')}</span>
     <span>🔁 訪問 ${is.visits||0} 回${yrs}</span>
     <span>📷 写真 ${is.photos.length} 枚</span>` +
    (sp ? `<span>🎁 名産 ${sp.ic} ${esc(sp.name)}</span>` : '');
  $('#pSummary').textContent = is.summary || '';
  if (is.special === 'miyake' && window.renderMiyakeBody){
    await window.renderMiyakeBody(is);
  } else {
    await renderBody(is);
  }
  $('#panel').classList.add('open');
  focusIsland(is);
}

async function renderBody(is){
  const body = $('#pBody');
  const tab = is._tab || 'map';
  const n = (v) => v ? ` <span class="tn">${v}</span>` : '';
  body.innerHTML = `
    <div class="ptabs" id="pTabs">
      <button data-t="map"    class="${tab==='map'?'on':''}">🗺 地図</button>
      <button data-t="photos" class="${tab==='photos'?'on':''}">📷 写真${n(is.photos.length)}</button>
      <button data-t="logs"   class="${tab==='logs'?'on':''}">📖 旅日記${n(is.logs.length)}</button>
      <button data-t="shops"  class="${tab==='shops'?'on':''}">🍴 お店${n(is.shops.length)}</button>
      <button data-t="notes"  class="${tab==='notes'?'on':''}">💡 メモ${n((is.knowledge||[]).length + (is.tips||[]).length)}</button>
    </div>
    <div class="ptab-body">${tabContent(is, tab)}</div>`;
  // 写真の遅延読み込み（写真タブのみ）
  if (tab === 'photos'){
    for (const pid of is.photos){
      const blob = await PhotoDB.get(pid);
      const img = body.querySelector(`img[data-pid="${pid}"]`);
      if (img && blob) img.src = URL.createObjectURL(blob);
    }
  }
  bindBody(is);
  if (tab === 'map' && window.wireIsleMap) window.wireIsleMap(is);
  body.querySelectorAll('#pTabs button').forEach(b => b.onclick = async () => {
    is._tab = b.dataset.t;
    await renderBody(is);
    $('#pBody').scrollTop = 0;
  });
}
function tabContent(is, tab){
  if (tab === 'photos') return section('photos','📷 写真', photosBlock(is));
  if (tab === 'logs')   return section('logs','📖 旅日記', listLogs(is));
  if (tab === 'shops')  return section('shops','🍴 お店・グルメ', listShops(is));
  if (tab === 'notes')  return section('knowledge','💡 ナレッジ', listSimple(is,'knowledge','📌'))
                             + section('tips','🎯 Tips・コツ', listSimple(is,'tips','✅'));
  const mapSec = window.isleMapHTML ? window.isleMapHTML(is) : '';
  return mapSec || `<p class="empty">この島の地図データはまだありません。</p>`;
}

function section(key, title, inner){
  return `<div class="sec" data-sec="${key}">
    <h3>${title}<span class="add" data-add="${key}">＋ 追加</span></h3>${inner}</div>`;
}
function photosBlock(is){
  const items = is.photos.map(pid =>
    `<div class="ph"><img data-pid="${pid}" alt=""><button class="del" data-delph="${pid}">✕</button></div>`).join('');
  return `<div class="gallery">${items}<label class="add-ph">＋<input type="file" accept="image/*" class="hidden" id="photoInput" multiple></label></div>`;
}
function listLogs(is){
  if(!is.logs.length) return `<p class="empty">まだ旅日記がありません。「＋追加」で記録を。</p>`;
  return `<ul class="list">${is.logs.map((l,i)=>
    `<li class="log"><span class="txt"><span class="d">${esc(l.date)}</span><br>${esc(l.text)}</span><span class="x" data-del="logs:${i}">✕</span></li>`).join('')}</ul>`;
}
function listShops(is){
  if(!is.shops.length) return `<p class="empty">まだお店が登録されていません。</p>`;
  return `<ul class="list">${is.shops.map((s,i)=>
    `<li class="shop"><span class="txt"><span class="t">${esc(s.name)}</span><span class="ty">${esc(s.type||'')}</span>${s.note?`<span class="n">${esc(s.note)}</span>`:''}</span><span class="x" data-del="shops:${i}">✕</span></li>`).join('')}</ul>`;
}
function listSimple(is, key, ic){
  const arr = is[key]||[];
  if(!arr.length) return `<p class="empty">まだありません。</p>`;
  return `<ul class="list">${arr.map((t,i)=>
    `<li><span class="ic">${ic}</span><span class="txt">${esc(t)}</span><span class="x" data-del="${key}:${i}">✕</span></li>`).join('')}</ul>`;
}

/* ---------- パネル内のイベント ---------- */
function bindBody(is){
  // 写真追加
  const pi = $('#photoInput');
  if (pi) pi.addEventListener('change', e => addPhotos(is, e.target.files));
  // 写真削除
  $('#pBody').querySelectorAll('[data-delph]').forEach(b =>
    b.addEventListener('click', () => delPhoto(is, b.dataset.delph)));
  // 各セクションの＋追加
  $('#pBody').querySelectorAll('[data-add]').forEach(b =>
    b.addEventListener('click', () => addEntry(is, b.dataset.add)));
  // 項目削除
  $('#pBody').querySelectorAll('[data-del]').forEach(b =>
    b.addEventListener('click', () => {
      const [key, idx] = b.dataset.del.split(':');
      is[key].splice(+idx, 1); saveIslands(); openIsland(is.id);
    }));
}

async function addPhotos(is, files){
  for (const f of files){
    if (!f.type.startsWith('image/')) continue;
    const pid = 'ph_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
    try { await PhotoDB.put(pid, f); is.photos.push(pid); }
    catch(e){ toast('写真の保存に失敗'); }
  }
  saveIslands(); toast('写真を追加しました'); openIsland(is.id);
}
async function delPhoto(is, pid){
  is.photos = is.photos.filter(p => p !== pid);
  try { await PhotoDB.del(pid); } catch(e){}
  saveIslands(); openIsland(is.id);
}

/* ---------- 入力モーダル ---------- */
function modalForm(title, fields, onSubmit){
  const card = $('#formCard');
  card.innerHTML = `<h3>${title}</h3>` + fields.map(f =>
    `<label>${f.label}</label>` + (f.type==='textarea'
      ? `<textarea data-f="${f.name}" rows="3" placeholder="${f.ph||''}"></textarea>`
      : f.type==='select'
      ? `<select data-f="${f.name}">${(f.options||[]).map(o=>`<option value="${o.v}">${o.l}</option>`).join('')}</select>`
      : `<input data-f="${f.name}" type="${f.type||'text'}" placeholder="${f.ph||''}" value="${f.value||''}">`)
  ).join('') +
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

function addEntry(is, key){
  const today = new Date().toISOString().slice(0,10);
  if (key==='photos'){ $('#photoInput')?.click(); return; }
  if (key==='logs'){
    modalForm('旅日記を追加', [
      {name:'date', label:'日付・時期', value:today},
      {name:'text', label:'できごと', type:'textarea', ph:'天気、誰と、何があったか…'}
    ], v => { if(!v.text) return false; is.logs.unshift({date:v.date||today, text:v.text}); saveIslands(); openIsland(is.id); });
  } else if (key==='shops'){
    modalForm('お店を追加', [
      {name:'name', label:'店名'},
      {name:'type', label:'種類', ph:'食事 / カフェ / 買い出し など'},
      {name:'note', label:'メモ', type:'textarea', ph:'名物・営業時間など'}
    ], v => { if(!v.name) return false; is.shops.push({name:v.name, type:v.type, note:v.note}); saveIslands(); openIsland(is.id); });
  } else { // knowledge / tips
    const t = key==='knowledge' ? 'ナレッジを追加' : 'Tipsを追加';
    modalForm(t, [{name:'text', label:'内容', type:'textarea'}], v => {
      if(!v.text) return false; is[key].push(v.text); saveIslands(); openIsland(is.id);
    });
  }
}

/* 島そのものを追加 */
function addIsland(){
  modalForm('島を追加', [
    {name:'name', label:'島の名前'},
    {name:'region', label:'エリア', ph:'伊豆諸島 / 沖縄の島 など'},
    {name:'pref', label:'都道府県', ph:'東京都 など'},
    {name:'lat', label:'緯度（例 34.75）', type:'number'},
    {name:'lng', label:'経度（例 139.36）', type:'number'},
    {name:'summary', label:'ひとことメモ', type:'textarea'}
  ], v => {
    if(!v.name || !v.lat || !v.lng){ toast('名前・緯度・経度は必須です'); return false; }
    const id = 'is_' + Date.now();
    STATE.islands.push({
      id, name:v.name, region:v.region||'その他', pref:v.pref||'',
      lat:+v.lat, lng:+v.lng, firstVisit:String(new Date().getFullYear()), visits:1, fav:false,
      summary:v.summary||'', photos:[], shops:[], knowledge:[], tips:[], logs:[]
    });
    saveIslands(); renderMap(); renderIndexPanel(); openIsland(id); toast('島を追加しました');
  });
}

/* ---------- ズーム / パン ---------- */
const MAX_SCALE = 9;
function applyView(){ renderMap(); }
function zoomBy(factor, cx=VW/2, cy=VH/2){
  const v = STATE.view;
  const ns = Math.min(MAX_SCALE, Math.max(1, v.scale*factor));
  // 中心を保つ
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

// なめらかなビュー遷移（イージング付き）
let viewAnim = null;
function animateView(target, ms=560){
  cancelAnimationFrame(viewAnim);
  if (document.hidden){ // バックグラウンドでは rAF が止まるため即時反映
    STATE.view = {...target}; clampView(); applyView(); return;
  }
  const s = {...STATE.view};
  const t0 = performance.now();
  const ease = x => x<.5 ? 4*x*x*x : 1 - Math.pow(-2*x+2, 3)/2;
  const step = now => {
    const k = Math.min(1, (now-t0)/ms), e = ease(k);
    STATE.view.scale = s.scale + (target.scale - s.scale)*e;
    STATE.view.tx    = s.tx    + (target.tx    - s.tx)*e;
    STATE.view.ty    = s.ty    + (target.ty    - s.ty)*e;
    clampView(); applyView();
    if (k < 1) viewAnim = requestAnimationFrame(step);
  };
  viewAnim = requestAnimationFrame(step);
}
// 指定地点が中心に来るビューを計算
function viewFor(lat, lng, scale){
  const p = project(lat, lng);
  const ns = Math.min(MAX_SCALE, Math.max(1, scale));
  return { scale:ns, tx:VW/2 - p.x*ns, ty:VH/2 - p.y*ns };
}
function resetView(){ STATE.region='all'; renderRegionBar(); animateView({scale:1, tx:0, ty:0}); }

// 島を選んだとき、その島へなめらかにズーム＆センタリング
function focusIsland(is, targetScale=3.6){
  if(!is) return;
  if (STATE.viewMode === 'side'){ renderMap(); return; } // 横ビューはハイライトのみ
  animateView(viewFor(is.lat, is.lng, targetScale));
}

/* ---------- エリアタブ（ワンタップで島エリアへ） ---------- */
const REGIONS = [
  { id:'all',  label:'🗾 全体',      view:()=>({scale:1, tx:0, ty:0}) },
  { id:'izu',  label:'伊豆諸島',     view:()=>viewFor(33.6, 139.45, 3.1) },
  { id:'kago', label:'屋久島・奄美', view:()=>viewFor(28.9, 129.6, 2.5) },
  { id:'oki',  label:'沖縄・先島',   view:()=>viewFor(25.3, 125.6, 2.3) },
];
function renderRegionBar(){
  const bar = $('#regionBar');
  if (!bar) return;
  bar.innerHTML = REGIONS.map(r =>
    `<button class="rchip${STATE.region===r.id?' on':''}" data-r="${r.id}">${r.label}</button>`).join('');
  bar.querySelectorAll('.rchip').forEach(b => b.onclick = () => {
    STATE.region = b.dataset.r;
    renderRegionBar();
    if (STATE.viewMode === 'side'){ STATE.sideTx = 0; renderMap(); return; } // 横ビューでは絞り込み
    animateView(REGIONS.find(r => r.id === b.dataset.r).view());
  });
}
// 手動操作したらエリアタブの選択を解除
function clearRegion(){
  if (STATE.region){ STATE.region = null; renderRegionBar(); }
}

// ドラッグでパン
let drag = null;
function svgPoint(ev){
  const r = svg.getBoundingClientRect();
  const px = (ev.touches?ev.touches[0].clientX:ev.clientX) - r.left;
  const py = (ev.touches?ev.touches[0].clientY:ev.clientY) - r.top;
  return { x: px / r.width * VW, y: py / r.height * VH };
}
svg.addEventListener('mousedown', e => {
  if (STATE.viewMode === 'side'){ drag = {...svgPoint(e), stx:STATE.sideTx}; svg.classList.add('dragging'); return; }
  clearRegion();
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
  clearRegion(); zoomBy(e.deltaY<0?1.15:0.87, ...Object.values(svgPoint(e)));
}, {passive:false});
// タッチ（パン＋ピンチ）
let pinch = null;
svg.addEventListener('touchstart', e => {
  if (STATE.viewMode === 'side'){
    if(e.touches.length===1) drag = {...svgPoint(e), stx:STATE.sideTx};
    return;
  }
  clearRegion();
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
  is.fav = !is.fav; saveIslands(); renderIndexPanel(); openIsland(is.id);
});

/* ---------- アルバム・動画・ドキュメントの本体は media.js ---------- */

// ZIP作成（無圧縮STORE・UTF-8ファイル名対応・ライブラリ不要）
async function makeZip(files){
  const enc = new TextEncoder();
  const crcT = (() => { const t=new Uint32Array(256);
    for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c = c&1 ? 0xEDB88320^(c>>>1) : c>>>1; t[n]=c; }
    return t; })();
  const crc32 = u8 => { let c=0xFFFFFFFF;
    for(let i=0;i<u8.length;i++) c = crcT[(c^u8[i])&0xFF]^(c>>>8);
    return (c^0xFFFFFFFF)>>>0; };
  const parts=[], central=[]; let offset=0;
  for (const f of files){
    const data = new Uint8Array(await f.blob.arrayBuffer());
    const nameB = enc.encode(f.name);
    const crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0,0x04034b50,true); lh.setUint16(4,20,true); lh.setUint16(6,0x0800,true);
    lh.setUint32(14,crc,true); lh.setUint32(18,data.length,true); lh.setUint32(22,data.length,true);
    lh.setUint16(26,nameB.length,true);
    parts.push(lh.buffer, nameB, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0,0x02014b50,true); ch.setUint16(4,20,true); ch.setUint16(6,20,true); ch.setUint16(8,0x0800,true);
    ch.setUint32(16,crc,true); ch.setUint32(20,data.length,true); ch.setUint32(24,data.length,true);
    ch.setUint16(28,nameB.length,true); ch.setUint32(42,offset,true);
    central.push(ch.buffer, nameB);
    offset += 30 + nameB.length + data.length;
  }
  let cdSize = 0;
  for (const c of central) cdSize += c.byteLength;
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0,0x06054b50,true); eocd.setUint16(8,files.length,true); eocd.setUint16(10,files.length,true);
  eocd.setUint32(12,cdSize,true); eocd.setUint32(16,offset,true);
  return new Blob([...parts, ...central, eocd.buffer], {type:'application/zip'});
}

/* ---------- データ入出力 ---------- */
async function packDB(db){
  const all = await db.all();
  const out = {};
  for (const [k, blob] of Object.entries(all)){
    try { out[k] = await blobToDataURL(blob); } catch(e){}
  }
  return out;
}
async function exportData(){
  toast('バックアップを作成中…（動画が多いと時間がかかります）');
  const payload = {
    version: 2, exportedAt: new Date().toISOString(),
    islands: STATE.islands,
    photos: await packDB(PhotoDB),
    albums: window.Albums ? window.Albums.list() : [],
    media:  await packDB(MediaDB),
    docs:   window.Docs ? window.Docs.list() : [],
    files:  await packDB(FileDB)
  };
  const blob = new Blob([JSON.stringify(payload)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `island-camp-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  toast('バックアップを書き出しました');
}
async function importData(file){
  try {
    const text = await file.text();
    const p = JSON.parse(text);
    if(!p.islands) throw new Error('形式が不正');
    STATE.islands = p.islands;
    saveIslands();
    if(p.photos){ for(const [k,durl] of Object.entries(p.photos)){ await PhotoDB.put(k, dataURLtoBlob(durl)); } }
    if(p.media){  for(const [k,durl] of Object.entries(p.media)){  await MediaDB.put(k, dataURLtoBlob(durl)); } }
    if(p.files){  for(const [k,durl] of Object.entries(p.files)){  await FileDB.put(k, dataURLtoBlob(durl)); } }
    if(p.albums && window.Albums) window.Albums.replace(p.albums);
    if(p.docs && window.Docs) window.Docs.replace(p.docs);
    renderMap(); renderIndexPanel(); $('#dataModal').classList.remove('open'); toast('読み込み完了');
  } catch(e){ toast('読み込みに失敗しました'); }
}
function blobToDataURL(blob){ return new Promise(res=>{const r=new FileReader(); r.onload=()=>res(r.result); r.readAsDataURL(blob);}); }
function dataURLtoBlob(durl){ const [h,b]=durl.split(','); const mime=h.match(/:(.*?);/)[1]; const bin=atob(b); const u=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i); return new Blob([u],{type:mime}); }

/* ---------- UI 配線 ---------- */
$('#closePanel').onclick = () => { $('#panel').classList.remove('open'); STATE.activeId=null; renderMap(); };
$('#zin').onclick = () => zoomBy(1.3);
$('#zout').onclick = () => zoomBy(0.77);
$('#zreset').onclick = resetView;
$('#addIslandBtn').onclick = addIsland;
$('#menuBtn').onclick = () => $('#dataModal').classList.add('open');
$('#closeData').onclick = () => $('#dataModal').classList.remove('open');
$('#exportBtn').onclick = exportData;
$('#importBtn').onclick = () => $('#importFile').click();
$('#importFile').onchange = e => e.target.files[0] && importData(e.target.files[0]);
$('#resetBtn').onclick = () => {
  if(confirm('追加・編集した内容をすべて消して初期データに戻します。よろしいですか？')){
    localStorage.removeItem(LS_KEY); STATE.islands = deepClone(window.SEED_ISLANDS);
    saveIslands(); $('#dataModal').classList.remove('open'); $('#panel').classList.remove('open');
    renderMap(); renderIndexPanel(); toast('初期データに戻しました');
  }
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
$('#idxBtn').onclick = () => $('#idxPanel').classList.toggle('open');
$('#idxClose').onclick = () => $('#idxPanel').classList.remove('open');
$('#dataModal').addEventListener('click', e => { if(e.target.id==='dataModal') e.currentTarget.classList.remove('open'); });
$('#formModal').addEventListener('click', e => { if(e.target.id==='formModal') e.currentTarget.classList.remove('open'); });

/* ---------- ユーティリティ ---------- */
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
let toastTimer;
function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'),2000); }

/* ---------- 起動 ---------- */
renderMap();
renderIndexPanel();
renderRegionBar();
