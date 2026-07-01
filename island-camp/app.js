// ===== 島キャンプ思い出マップ : アプリ本体 =====
'use strict';

/* ---------- 投影（緯度経度 → SVG座標） ---------- */
// 日本の島々が収まる範囲
const BOUNDS = { latN: 46, latS: 23.5, lngW: 122, lngE: 146 };
const VW = 800, VH = 1000;
const MAX_SCALE = 18; // 地図の最大拡大率（大きいほどぐっと寄れる）
function project(lat, lng){
  const x = (lng - BOUNDS.lngW) / (BOUNDS.lngE - BOUNDS.lngW) * VW;
  const y = (BOUNDS.latN - lat) / (BOUNDS.latN - BOUNDS.latS) * VH;
  return { x, y };
}

/* ---------- 永続化 ---------- */
const LS_KEY = 'island-camp/islands-v1';

function loadIslands(){
  let list;
  try {
    const raw = localStorage.getItem(LS_KEY);
    list = raw ? JSON.parse(raw) : null;
  } catch(e){ list = null; }
  if (!list) return deepClone(window.SEED_ISLANDS || []);
  // 保存済みデータに無い「シードの島（新規ロスター等）」を補完（ユーザー編集は維持）
  const have = new Set(list.map(i => i.id));
  for (const seed of (window.SEED_ISLANDS || [])){
    if (!have.has(seed.id)) list.push(deepClone(seed));
  }
  return list;
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
// 島の基本サイズ（viewBox単位・画面固定）。訪問が多いほど大きく、未訪問は小さめ。
function islandRadius(is){
  const v = is.visits||0;
  if(!v) return 11;
  return 13 + Math.min(10, v*0.7);
}

/* ---------- 「行った島」マーク（シュノーケル＝ロゴのモチーフ） ---------- */
// 訪問済みの島に付ける小さなシュノーケルマスクのバッジ。cx,cy=中心、k=大きさ倍率。
function snorkelBadge(cx, cy, k=1){
  const t = `translate(${(+cx).toFixed(1)},${(+cy).toFixed(1)}) scale(${k})`;
  return `<g class="snorkel-badge" transform="${t}" style="pointer-events:none">
    <ellipse cx="0" cy="1" rx="12" ry="10.5" fill="#fff" opacity=".95" stroke="#bcd3d8" stroke-width="1"/>
    <path d="M-8 -6 q-4.5 0 -4.5 4.5 l0 7.5" fill="none" stroke="#ff7a59" stroke-width="2.6" stroke-linecap="round"/>
    <circle cx="-12.5" cy="6.2" r="1.7" fill="#ff7a59"/>
    <rect x="-8" y="-5" width="16" height="9" rx="4.2" fill="#0d3340" stroke="#06222b" stroke-width="1"/>
    <rect x="-6.6" y="-3.4" width="5.6" height="6" rx="2.6" fill="#4fd1c5"/>
    <rect x="1" y="-3.4" width="5.6" height="6" rx="2.6" fill="#4fd1c5"/>
  </g>`;
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
  // 海の背景
  let g = `<rect width="${VW}" height="${VH}" fill="#c0d8e8"/>`;
  // グリッド（薄く）
  for(let lat=24;lat<=46;lat+=2){const y=project(lat,0).y; g+=`<line stroke="rgba(255,255,255,.45)" stroke-width=".6" x1="0" y1="${y.toFixed(1)}" x2="${VW}" y2="${y.toFixed(1)}">`+'</line>';}
  for(let lng=124;lng<=144;lng+=4){const x=project(0,lng).x; g+=`<line stroke="rgba(255,255,255,.45)" stroke-width=".6" x1="${x.toFixed(1)}" y1="0" x2="${x.toFixed(1)}" y2="${VH}">`+'</line>';}
  // 参考地形（対馬のみ：実海岸線。位置の手がかりに薄く。他は島イラストで描く）
  for(const [key, rings] of Object.entries(GEO.refs)){
    if (PROMOTED_REFS.has(key)) continue;
    for(const ring of rings){
      g+=`<polygon points="${polyPoints(ring)}" fill="#e4e0d4" stroke="#c0bab0" stroke-width="1" stroke-linejoin="round"/>`;
    }
    const big = rings.reduce((a,b)=> a.length>=b.length?a:b);
    const c = centroid(big);
    g+=`<text x="${c.x.toFixed(1)}" y="${c.y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle"
          fill="#a09890" font-size="10" font-weight="600" paint-order="stroke" stroke="#e8e4d8" stroke-width="3px">${esc(REF_NAMES[key]||'')}</text>`;
  }
  // 陸地（本州・北海道・九州・四国：実海岸線）
  for(const rings of Object.values(GEO.land)){
    for(const ring of rings){
      g+=`<polygon points="${polyPoints(ring)}" fill="#e4e0d4" stroke="#b8b2a6" stroke-width="1.2" stroke-linejoin="round"/>`;
    }
  }
  // 地域ラベル
  const labels=[['本州',36.5,137.0],['九州',32.0,130.3],['北海道',43.6,142.5],
    ['日本海',39.5,134.5],['太平洋',33.0,135.5],['東シナ海',28.0,125.5]];
  for(const[t,la,ln] of labels){const p=project(la,ln);
    g+=`<text x="${p.x.toFixed(1)}" y="${p.y.toFixed(1)}" text-anchor="middle" fill="#92b0bc" font-size="13" font-weight="700" letter-spacing="2" opacity=".9">${t}</text>`;}
  return g;
}

/* ---------- 島の描画（画面固定サイズ＋ズームで横顔に立ち上がる） ---------- */
// 0 = 真上から、1 = 横から。ズームするほど横顔に。
function standUp(){ return Math.max(0, Math.min(1, (STATE.view.scale - 1) / 2.2)); }
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
  if (sx < -80 || sx > VW+80 || sy < -80 || sy > VH+140) return ''; // 画面外は省略
  const active  = is.id === STATE.activeId;
  const visited = (is.visits||0) > 0;
  const r  = islandRadius(is) * (active ? 1.12 : 1);
  const op = visited ? 1 : 0.5;                       // 未訪問は薄く
  const sand  = is.fav ? '#f3d98a' : visited ? '#efe0b0' : '#dcd8c8';
  const grass = active ? '#7fc97a' : is.fav ? '#8ec862' : visited ? '#74b65c' : '#a6bd9f';
  const grassD= active ? '#3f8e47' : visited ? '#4f9a44' : '#7e9579';
  const H  = r * (0.55 + 1.30*t);                    // 立ち上がり高さ
  const ry = r * (0.52 - 0.20*t);                    // 海面楕円の縦（立つほど薄く）
  const shadow = `<ellipse cx="${sx}" cy="${(sy+ry*0.55).toFixed(1)}" rx="${(r*1.06).toFixed(1)}" ry="${(ry*0.7).toFixed(1)}" fill="rgba(20,40,60,.16)"/>`;
  const beach  = `<ellipse cx="${sx}" cy="${sy}" rx="${r.toFixed(1)}" ry="${ry.toFixed(1)}" fill="${sand}" stroke="#d9c587" stroke-width="1"/>`;
  const land   = landShape(is, sx, sy, r, H, grass, grassD);
  const ring   = active ? `<ellipse cx="${sx}" cy="${sy}" rx="${(r+5).toFixed(1)}" ry="${(ry+3).toFixed(1)}" fill="none" stroke="#2a7ec8" stroke-width="2.4"/>` : '';
  const showLabel = STATE.view.scale >= 1.45 || is.fav || active;
  const ly = +(sy + ry + 12).toFixed(1);
  // 「行った島」マーク＝シュノーケルのバッジ。お気に入りは★を右肩に重ねる。
  const badgeY = +(sy - H - 13).toFixed(1);
  const mark = visited ? snorkelBadge(sx, badgeY, 0.6 + (active?0.08:0)) : '';
  const fav = is.fav
    ? `<text x="${(sx + (visited?9:0)).toFixed(1)}" y="${(badgeY - (visited?7:-2)).toFixed(1)}" text-anchor="middle" font-size="13">★</text>`
    : '';
  const visitsB = (visited && showLabel) ? `<text x="${sx}" y="${(ly+12).toFixed(1)}" text-anchor="middle" fill="#3a6a30" font-size="9.5" font-weight="800">${is.visits}回</text>` : '';
  const label = showLabel ? `<text class="isle-lbl" x="${sx}" y="${ly}" text-anchor="middle" font-size="11.5" font-weight="700">${esc(is.name)}</text>${visitsB}` : '';
  return `<g class="isle${visited?'':' unseen'}${active?' active':''}" data-id="${is.id}" style="opacity:${op}">${shadow}${beach}${land}${ring}${mark}${fav}${label}</g>`;
}
// 種類ごとの陸地シルエット。sx,sy=海面中心、Hだけ上へ立ち上がる。
function landShape(is, sx, sy, r, H, grass, grassD){
  const kind = islandKind(is);
  const w = r*0.84, peak = sy - H;
  const fillPath = (d, f) => `<path d="${d}" fill="${f}" stroke="${grassD}" stroke-width="0.8" stroke-linejoin="round"/>`;
  const n = v => (+v).toFixed(1);
  if (kind === 'cone' || kind === 'forest'){
    const body  = `M ${n(sx-w)} ${n(sy)} Q ${n(sx-w*0.55)} ${n(sy-H*0.5)} ${n(sx)} ${n(peak)} Q ${n(sx+w*0.55)} ${n(sy-H*0.5)} ${n(sx+w)} ${n(sy)} Z`;
    const shade = `M ${n(sx)} ${n(peak)} Q ${n(sx+w*0.55)} ${n(sy-H*0.5)} ${n(sx+w)} ${n(sy)} L ${n(sx)} ${n(sy)} Z`;
    let extra = '';
    if (kind === 'cone'){ // 火口のくぼみ
      extra = `<path d="M ${n(sx-w*0.2)} ${n(peak+2)} Q ${n(sx)} ${n(peak+6)} ${n(sx+w*0.2)} ${n(peak+2)}" fill="none" stroke="${grassD}" stroke-width="1"/>`;
    } else { // 森のもこもこ
      extra = `<circle cx="${n(sx-w*0.3)}" cy="${n(peak+H*0.3)}" r="${n(r*0.17)}" fill="${grassD}" opacity=".55"/><circle cx="${n(sx+w*0.26)}" cy="${n(peak+H*0.2)}" r="${n(r*0.19)}" fill="${grassD}" opacity=".55"/>`;
    }
    return fillPath(body, grass) + `<path d="${shade}" fill="rgba(0,40,10,.12)"/>` + extra;
  }
  if (kind === 'twin'){ // ふたこぶ（八丈島）
    const h2 = H*0.8, w2 = w*0.6;
    const right = `M ${n(sx-w*0.05)} ${n(sy)} Q ${n(sx+w*0.45)} ${n(sy-H)} ${n(sx+w)} ${n(sy)} Z`;
    const left  = `M ${n(sx-w)} ${n(sy)} Q ${n(sx-w*0.55)} ${n(sy-h2)} ${n(sx-w*0.1)} ${n(sy)} Z`;
    return fillPath(right, grass) + fillPath(left, grass) +
      `<path d="${right}" fill="rgba(0,40,10,.10)"/>`;
  }
  if (kind === 'flat'){ // 平らな隆起サンゴ＋ヤシ
    const fh = H*0.45, pw = w, cr = r*0.16;
    const body = `M ${n(sx-pw)} ${n(sy)} L ${n(sx-pw)} ${n(sy-fh+cr)} Q ${n(sx-pw)} ${n(sy-fh)} ${n(sx-pw+cr)} ${n(sy-fh)} L ${n(sx+pw-cr)} ${n(sy-fh)} Q ${n(sx+pw)} ${n(sy-fh)} ${n(sx+pw)} ${n(sy-fh+cr)} L ${n(sx+pw)} ${n(sy)} Z`;
    const px = sx+w*0.15, py = sy-fh, th = H*0.75;
    const palm = `<path d="M ${n(px)} ${n(py)} q ${n(r*0.06)} ${n(-th*0.6)} 0 ${n(-th)}" stroke="#9a7b4f" stroke-width="1.4" fill="none"/>`+
      `<g fill="#5fae54" stroke="${grassD}" stroke-width="0.4">`+
      `<ellipse cx="${n(px-r*0.2)}" cy="${n(py-th)}" rx="${n(r*0.24)}" ry="${n(r*0.09)}" transform="rotate(-20 ${n(px-r*0.2)} ${n(py-th)})"/>`+
      `<ellipse cx="${n(px+r*0.2)}" cy="${n(py-th)}" rx="${n(r*0.24)}" ry="${n(r*0.09)}" transform="rotate(20 ${n(px+r*0.2)} ${n(py-th)})"/>`+
      `<ellipse cx="${n(px)}" cy="${n(py-th-r*0.08)}" rx="${n(r*0.09)}" ry="${n(r*0.24)}"/></g>`;
    return fillPath(body, grass) + palm;
  }
  // dome（丸い丘・既定）
  const body  = `M ${n(sx-w)} ${n(sy)} Q ${n(sx)} ${n(sy-H*1.5)} ${n(sx+w)} ${n(sy)} Z`;
  const shade = `M ${n(sx)} ${n(sy-H*1.12)} Q ${n(sx+w*0.7)} ${n(sy-H*0.5)} ${n(sx+w)} ${n(sy)} L ${n(sx)} ${n(sy)} Z`;
  return fillPath(body, grass) + `<path d="${shade}" fill="rgba(0,40,10,.10)"/>`;
}

function renderMap(){
  const { scale, tx, ty } = STATE.view;
  const svgH = svg.getBoundingClientRect().height;
  STATE.vScale = svgH > 0 ? svgH / VH : 0.73;
  // 陸地は拡大グループ内、島イラストは画面固定サイズで上に重ねる
  svg.innerHTML =
    `<g transform="translate(${tx},${ty}) scale(${scale})">${drawBase()}</g>` +
    `<g class="isles">${drawIslands()}</g>`;
  svg.querySelectorAll('.isle').forEach(el => {
    el.addEventListener('click', ev => { ev.stopPropagation(); openIsland(el.dataset.id); });
  });
}

/* ---------- 左ペイン：年次別インデックス ---------- */
function idxItemHTML(is){
  const active  = is.id === STATE.activeId;
  const visited = (is.visits||0) > 0;
  const ic = is.fav ? '★' : (visited ? '🤿' : '○');
  return `<button class="idx-item${visited?'':' unseen'}${active?' active':''}" data-id="${is.id}">
    <span class="ic">${ic}</span><span class="nm">${esc(is.name)}</span>
    <span class="vc">${visited ? is.visits+'回' : '未訪問'}</span>
  </button>`;
}
function renderIndexPanel(){
  const body = $('#idxBody');
  if (!body) return;
  const withYear = STATE.islands.filter(i => i.firstVisit);
  const noYear   = STATE.islands.filter(i => !i.firstVisit);
  const years = [...new Set(withYear.map(i => i.firstVisit))].sort((a,b) => +a - +b);
  let html = '';
  for (const y of years){
    const items = withYear.filter(i => i.firstVisit === y);
    html += `<div class="idx-year"><div class="idx-year-h"><span class="y">${esc(y)}年</span><span class="n">${items.length}島</span></div>
      <div class="idx-list">${items.map(idxItemHTML).join('')}</div></div>`;
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
  focusIsland(is);
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
      ? `<textarea data-f="${f.name}" rows="3" placeholder="${f.ph||''}">${esc(f.value||'')}</textarea>`
      : `<input data-f="${f.name}" type="${f.type||'text'}" placeholder="${f.ph||''}" value="${esc(f.value||'')}">`)
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
function resetView(){ STATE.view = {scale:1, tx:0, ty:0}; applyView(); }

// 島を選んだとき、その島へ地図をズーム＆センタリング（index↔地図の連携）
function focusIsland(is, targetScale=3.6){
  if(!is) return;
  const p = project(is.lat, is.lng);
  const ns = Math.min(MAX_SCALE, Math.max(1, targetScale));
  const v = STATE.view;
  // 表示領域の中心(VW/2,VH/2)に島が来るように平行移動
  v.scale = ns;
  v.tx = VW/2 - p.x * ns;
  v.ty = VH/2 - p.y * ns;
  clampView(); applyView();
}

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
  is.fav = !is.fav; saveIslands(); renderIndexPanel(); openIsland(is.id);
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
