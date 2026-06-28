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

function loadIslands(){
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch(e){}
  return deepClone(window.SEED_ISLANDS || []);
}
function saveIslands(){
  try { localStorage.setItem(LS_KEY, JSON.stringify(STATE.islands)); }
  catch(e){ toast('保存に失敗しました（容量超過の可能性）'); }
}
function deepClone(o){ return JSON.parse(JSON.stringify(o)); }

/* ---------- 写真は IndexedDB に保存 ---------- */
const PhotoDB = (() => {
  let dbp;
  function open(){
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open('island-camp-photos', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('photos');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function tx(mode){ return (await open()).transaction('photos', mode).objectStore('photos'); }
  return {
    async put(id, blob){ const s = await tx('readwrite'); return new Promise((res,rej)=>{const r=s.put(blob,id); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error);}); },
    async get(id){ const s = await tx('readonly'); return new Promise((res,rej)=>{const r=s.get(id); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error);}); },
    async del(id){ const s = await tx('readwrite'); return new Promise((res,rej)=>{const r=s.delete(id); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error);}); },
    async all(){ const s = await tx('readonly'); return new Promise((res,rej)=>{const out={}; const r=s.openCursor(); r.onsuccess=e=>{const c=e.target.result; if(c){out[c.key]=c.value; c.continue();} else res(out);}; r.onerror=()=>rej(r.error);}); }
  };
})();

/* ---------- 状態 ---------- */
const STATE = {
  islands: loadIslands(),
  activeId: null,
  view: { scale: 1, tx: 0, ty: 0 } // SVGズーム/パン
};

const $ = sel => document.querySelector(sel);
const svg = $('#map');
const SVGNS = 'http://www.w3.org/2000/svg';

/* ---------- 地図データ ---------- */
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

// 訪問島の形状データ（実寸の約1.5〜2倍・隣島と重ならないよう調整）
// [lat, lng] の配列で輪郭を定義
const ISLAND_SHAPE_DATA = {
  // ===== 伊豆諸島 ===== (チェーン状で近接しているため慎重にサイズ設定)
  'izu-oshima': [
    // 大島: N-S方向にやや長い三角形〜楕円。実寸×1.8
    [34.90,139.29],[34.92,139.36],[34.89,139.44],
    [34.78,139.47],[34.64,139.44],[34.59,139.36],[34.63,139.28]
  ],
  'niijima': [
    // 新島: 南北に細長い。実寸×1.8。大島と重ならないようS端を34.56以下に
    [34.53,139.23],[34.54,139.27],[34.53,139.31],
    [34.44,139.33],[34.30,139.31],[34.20,139.27],
    [34.18,139.23],[34.28,139.21],[34.44,139.22]
  ],
  'kozushima': [
    // 神津島: コンパクトな楕円形。実寸×2
    [34.29,139.06],[34.31,139.14],[34.29,139.21],
    [34.20,139.23],[34.11,139.20],[34.09,139.13],
    [34.11,139.06],[34.20,139.03]
  ],
  'miyakejima': [
    // 三宅島: ほぼ円形の火山島。実寸×1.8。神津島/八丈島と離れて配置
    [34.17,139.50],[34.18,139.55],[34.15,139.60],
    [34.10,139.63],[34.04,139.62],[33.99,139.57],
    [33.99,139.51],[34.02,139.46],[34.08,139.44],[34.13,139.46]
  ],
  'hachijojima': [
    // 八丈島: 八の字（N=八丈富士、S=三原山系）実寸×1.8
    [33.23,139.72],[33.25,139.79],[33.22,139.86],
    [33.16,139.89],[33.10,139.88],[33.04,139.84],
    [33.00,139.77],[32.99,139.71],[33.05,139.67],
    [33.12,139.68],[33.17,139.70]
  ],
  // ===== 鹿児島の島 =====
  'yakushima': [
    // 屋久島: 三角形〜五角形。実寸×2（直径22px at scale1）
    [30.59,130.30],[30.61,130.51],[30.57,130.72],
    [30.44,130.80],[30.24,130.72],[30.12,130.51],
    [30.16,130.30],[30.34,130.20]
  ],
  'amami-oshima': [
    // 奄美大島: NE-SW方向に細長い。実寸×1.5
    [28.76,129.34],[28.78,129.44],[28.72,129.54],
    [28.56,129.59],[28.40,129.63],[28.24,129.64],
    [28.08,129.60],[27.96,129.52],[27.88,129.42],
    [27.86,129.33],[27.94,129.26],[28.10,129.24],
    [28.28,129.25],[28.50,129.26],[28.66,129.29]
  ],
  // ===== 沖縄の島 =====
  'ishigaki': [
    // 石垣島: 西表と0.21°以上の隙間を確保。W端124.04以上
    [24.55,124.10],[24.56,124.22],[24.54,124.34],
    [24.46,124.40],[24.36,124.39],[24.26,124.33],
    [24.22,124.20],[24.26,124.08],[24.36,124.04],
    [24.46,124.06]
  ],
  'iriomote': [
    // 西表島: 石垣と0.21°以上の隙間を確保。E端123.83以下
    [24.49,123.46],[24.50,123.60],[24.49,123.75],
    [24.42,123.83],[24.32,123.82],[24.22,123.76],
    [24.20,123.62],[24.22,123.48],[24.32,123.42],[24.43,123.44]
  ],
  // ===== 新潟の島 =====
  'sado': [
    // 佐渡島: S字形。実寸×1.2（元々大きいので）
    [38.50,138.18],[38.52,138.30],[38.48,138.44],
    [38.36,138.52],[38.22,138.56],[38.12,138.62],
    [38.05,138.74],[37.95,138.84],[37.83,138.86],
    [37.79,138.76],[37.84,138.62],[37.96,138.52],
    [38.14,138.44],[38.28,138.30],[38.40,138.16]
  ]
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

/* ---------- 地図描画 ---------- */
function drawBase(){
  // 海の背景
  let g = `<rect width="${VW}" height="${VH}" fill="#c0d8e8"/>`;
  // グリッド（薄く）
  for(let lat=24;lat<=46;lat+=2){const y=project(lat,0).y; g+=`<line stroke="rgba(255,255,255,.45)" stroke-width=".6" x1="0" y1="${y.toFixed(1)}" x2="${VW}" y2="${y.toFixed(1)}">`+'</line>';}
  for(let lng=124;lng<=144;lng+=4){const x=project(0,lng).x; g+=`<line stroke="rgba(255,255,255,.45)" stroke-width=".6" x1="${x.toFixed(1)}" y1="0" x2="${x.toFixed(1)}" y2="${VH}">`+'</line>';}
  // 参考島（薄いクリーム色）
  for(const ri of REF_ISLANDS){
    g+=`<polygon points="${polyPoints(ri.coords)}" fill="#e4e0d4" stroke="#c0bab0" stroke-width="1" stroke-linejoin="round"/>
        <text x="${centroid(ri.coords).x.toFixed(1)}" y="${centroid(ri.coords).y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle"
          fill="#a09890" font-size="10" font-weight="600" paint-order="stroke" stroke="#e8e4d8" stroke-width="3px">${esc(ri.name)}</text>`;
  }
  // 陸地（本州・北海道・九州・四国）
  for(const m of LANDMASSES){ g+=`<path fill="#e4e0d4" stroke="#b8b2a6" stroke-width="1.2" stroke-linejoin="round" d="${smoothPath(m)}"/>`; }
  // 地域ラベル
  const labels=[['本州',36.5,137.0],['九州',32.0,130.3],['北海道',43.6,142.5],
    ['日本海',39.5,134.5],['太平洋',33.0,135.5],['東シナ海',28.0,125.5]];
  for(const[t,la,ln] of labels){const p=project(la,ln);
    g+=`<text x="${p.x.toFixed(1)}" y="${p.y.toFixed(1)}" text-anchor="middle" fill="#92b0bc" font-size="13" font-weight="700" letter-spacing="2" opacity=".9">${t}</text>`;}
  return g;
}

function drawIslandShapes(){
  // scale < 2のとき形状は描かずドットに任せる（密集した伊豆諸島の重なりを防ぐ）
  const useShapes = STATE.view.scale >= 2;
  return STATE.islands.map(is => {
    const coords = ISLAND_SHAPE_DATA[is.id];
    if (!coords || !useShapes) return '';
    const active = is.id === STATE.activeId;
    const fill   = active ? '#9ec4e0' : is.fav ? '#e0d07a' : '#bdd4a6';
    const stroke = active ? '#1e6eb8' : is.fav ? '#a09640' : '#7a9e70';
    const sw     = active ? 2.5 : 1.2;
    const c = centroid(coords);
    // グループscaleとviewBox表示倍率の両方を逆補正して画面上の文字サイズを一定に保つ
    // 目標: 12px CSS視覚サイズ = target / (group_scale × svgH/VH)
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
  // シェイプがある島はscale<2のときのみドット表示。シェイプのない島は常にドット
  return STATE.islands.map(is => {
    const hasShape = !!ISLAND_SHAPE_DATA[is.id];
    if (hasShape && STATE.view.scale >= 2) return ''; // 形状表示中はドット不要
    const p = project(is.lat, is.lng);
    const active = is.id === STATE.activeId;
    const fill   = is.fav ? '#d8c870' : '#e06040';
    return `<g class="pin${is.fav?' fav':''}${active?' active':''}" data-id="${is.id}" transform="translate(${p.x.toFixed(1)},${p.y.toFixed(1)})">
      ${active ? `<circle class="ring" r="16" fill="none" stroke="#2a7ec8" stroke-width="2" opacity=".8"/>` : ''}
      <circle class="dot" r="${active?10:8}" fill="${fill}" stroke="#fff" stroke-width="1.5"/>
      <text y="3" text-anchor="middle" fill="#fff" font-size="8" font-weight="800" pointer-events="none">${is.visits||''}</text>
      <text x="12" y="4" fill="#2a2520" font-size="11" font-weight="700" paint-order="stroke" stroke="#fff" stroke-width="3px" pointer-events="none">${esc(is.name)}</text>
    </g>`;
  }).join('');
}

function renderMap(){
  const { scale, tx, ty } = STATE.view;
  // viewBox/viewport比率をキャッシュ（drawIslandShapes内で使用）
  const svgH = svg.getBoundingClientRect().height;
  STATE.vScale = svgH > 0 ? svgH / VH : 0.73;
  svg.innerHTML = `<g transform="translate(${tx},${ty}) scale(${scale})">${drawBase()}${drawIslandShapes()}${drawDotPins()}</g>`;
  svg.querySelectorAll('.isle-shape, .pin').forEach(el => {
    el.addEventListener('click', ev => { ev.stopPropagation(); openIsland(el.dataset.id); });
  });
}

/* ---------- 詳細パネル ---------- */
function islandById(id){ return STATE.islands.find(i => i.id === id); }

async function openIsland(id){
  const is = islandById(id);
  if (!is) return;
  STATE.activeId = id;
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
  if (is.special === 'miyake' && window.renderMiyakeBody){
    await window.renderMiyakeBody(is);
  } else {
    await renderBody(is);
  }
  $('#panel').classList.add('open');
  renderMap();
}

async function renderBody(is){
  const body = $('#pBody');
  body.innerHTML = `
    ${section('photos','📷 写真', photosBlock(is))}
    ${section('logs','📖 旅日記', listLogs(is))}
    ${section('shops','🍴 お店・グルメ', listShops(is))}
    ${section('knowledge','💡 ナレッジ', listSimple(is,'knowledge','📌'))}
    ${section('tips','🎯 Tips・コツ', listSimple(is,'tips','✅'))}
  `;
  // 写真の遅延読み込み
  for (const pid of is.photos){
    const blob = await PhotoDB.get(pid);
    const img = body.querySelector(`img[data-pid="${pid}"]`);
    if (img && blob) img.src = URL.createObjectURL(blob);
  }
  bindBody(is);
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
    saveIslands(); renderMap(); openIsland(id); toast('島を追加しました');
  });
}

/* ---------- ズーム / パン ---------- */
function applyView(){ renderMap(); }
function zoomBy(factor, cx=VW/2, cy=VH/2){
  const v = STATE.view;
  const ns = Math.min(6, Math.max(1, v.scale*factor));
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
function resetView(){ STATE.view = {scale:1, tx:0, ty:0}; applyView(); }

// ドラッグでパン
let drag = null;
function svgPoint(ev){
  const r = svg.getBoundingClientRect();
  const px = (ev.touches?ev.touches[0].clientX:ev.clientX) - r.left;
  const py = (ev.touches?ev.touches[0].clientY:ev.clientY) - r.top;
  return { x: px / r.width * VW, y: py / r.height * VH };
}
svg.addEventListener('mousedown', e => { drag = {...svgPoint(e), tx:STATE.view.tx, ty:STATE.view.ty}; svg.classList.add('dragging'); });
window.addEventListener('mousemove', e => {
  if(!drag) return;
  const p = svgPoint(e);
  STATE.view.tx = drag.tx + (p.x - drag.x)*STATE.view.scale;
  STATE.view.ty = drag.ty + (p.y - drag.y)*STATE.view.scale;
  clampView(); applyView();
});
window.addEventListener('mouseup', () => { drag=null; svg.classList.remove('dragging'); });
svg.addEventListener('wheel', e => { e.preventDefault(); zoomBy(e.deltaY<0?1.15:0.87, ...Object.values(svgPoint(e))); }, {passive:false});
// タッチ（パン＋ピンチ）
let pinch = null;
svg.addEventListener('touchstart', e => {
  if(e.touches.length===1){ drag = {...svgPoint(e), tx:STATE.view.tx, ty:STATE.view.ty}; }
  else if(e.touches.length===2){ drag=null; pinch = touchDist(e); }
}, {passive:true});
svg.addEventListener('touchmove', e => {
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
  is.fav = !is.fav; saveIslands(); openIsland(is.id);
});

/* ---------- データ入出力 ---------- */
async function exportData(){
  const photos = await PhotoDB.all();
  const photoData = {};
  for (const [k,blob] of Object.entries(photos)){ photoData[k] = await blobToDataURL(blob); }
  const payload = { version:1, exportedAt:new Date().toISOString(), islands:STATE.islands, photos:photoData };
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
    STATE.islands = p.islands;
    saveIslands();
    if(p.photos){ for(const [k,durl] of Object.entries(p.photos)){ await PhotoDB.put(k, dataURLtoBlob(durl)); } }
    renderMap(); $('#dataModal').classList.remove('open'); toast('読み込み完了');
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
    saveIslands(); $('#dataModal').classList.remove('open'); $('#panel').classList.remove('open'); renderMap(); toast('初期データに戻しました');
  }
};
$('#dataModal').addEventListener('click', e => { if(e.target.id==='dataModal') e.currentTarget.classList.remove('open'); });
$('#formModal').addEventListener('click', e => { if(e.target.id==='formModal') e.currentTarget.classList.remove('open'); });

/* ---------- ユーティリティ ---------- */
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
let toastTimer;
function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'),2000); }

/* ---------- 起動 ---------- */
renderMap();
