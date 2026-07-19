// ===== 観光マップ風（パンフレット調）詳細地図モード =====
// 地理院タイル（地図／航空写真）に加えて、観光協会のパンフのような
// デフォルメ地図を第3の表示モードとして提供する。
// 海岸線は geo.js（OpenStreetMap ODbL）、スポットは v2 の島データ（is.spots）を使う。
// app.js のグローバル（$, STATE, visibleSpots, liveList, catStyle, spotForm,
// islandById, esc, toast）を利用する。
'use strict';
window.Kanko = (() => {

const MODE_KEY = 'island-camp/dmapmode';
let mode = false;
try { mode = localStorage.getItem(MODE_KEY) === 'kanko'; } catch(e){}
let curId = null;          // 表示中の島
let VIEW = null;           // ズーム状態 {id, z, cx, cy}
let PROJ = null;           // 現在の投影（タップ位置→緯度経度の逆変換に使う）
let pickCb = null;         // スポット位置指定のコールバック

/* ---------- 観光協会の公式マップリンク（2026-07調査） ---------- */
// パンフ自体の転載は著作権があるため、公式ページへのリンクで案内する。
const KANKO_LINKS = {
  'izu-oshima':   { org:'大島観光協会',       url:'https://oshima-navi.com/pamphlet/index.html' },
  'toshima':      { org:'利島村',             url:'https://www.gotokyo.org/book/list/5156/' },
  'niijima':      { org:'新島村観光案内所',   url:'https://niijima-info.jp/map/' },
  'shikinejima':  { org:'式根島観光協会',     url:'https://shikinejima.tokyo/learn/pamphlet/' },
  'kozushima':    { org:'神津島観光協会',     url:'https://kozushima.com/map/' },
  'miyakejima':   { org:'三宅島観光協会',     url:'https://www.miyakejima.gr.jp/map/' },
  'mikurajima':   { org:'御蔵島観光協会',     url:'https://mikura-isle.com/info-2/' },
  'hachijojima':  { org:'八丈島観光協会',     url:'https://www.hachijo.gr.jp/catalogs/' },
  'aogashima':    { org:'青ヶ島村',           url:'https://www.vill.aogashima.tokyo.jp/tourism/map.html' },
  'sado':         { org:'佐渡観光交流機構',   url:'https://www.visitsado.com/pamphlet/' },
  'yakushima':    { org:'屋久島観光協会',     url:'https://yakukan.jp/safe-travel/brochure-download.html' },
  'tanegashima':  { org:'種子島観光協会',     url:'https://tanekan.jp/allmap/' },
  'amami-oshima': { org:'あまみ大島観光物産連盟', url:'https://www.amami-tourism.org/pamphlet/' },
  'kikaijima':    { org:'喜界島観光物産協会', url:'https://www.town.kikai.lg.jp/densan/kanko-iju/panfuretto/index.html' },
  'tokunoshima':  { org:'徳之島観光連盟',     url:'https://www.tokunoshima-town.org/omotenashikanko/kanko/pamphlet/index.html' },
  'okinoerabu':   { org:'おきのえらぶ島観光協会', url:'https://okinoerabujima.info/pamphlet/tourism' },
  'yoron':        { org:'ヨロン島観光協会',   url:'https://www.yorontou.info/safe-travel/brochure-download.html' },
  'okinawa-hontou':{ org:'おきなわ物語',      url:'https://okimeguri.com/guidemap' },
  'kumejima':     { org:'久米島町観光協会',   url:'https://www.kanko-kumejima.com/tourist-brochures/' },
  'miyako':       { org:'宮古島観光協会',     url:'https://miyako-guide.net/profile/magazine/' },
  'ishigaki':     { org:'石垣市観光交流協会', url:'https://yaeyama.or.jp/our-information/document-request/' },
  'iriomote':     { org:'竹富町観光協会',     url:'https://painusima.com/goods/' },
  'yonaguni':     { org:'与那国町観光協会',   url:'https://welcome-yonaguni.jp/news/3185/' },
  'hateruma':     { org:'竹富町観光協会',     url:'https://painusima.com/goods/' },
};

/* ---------- 山・港のランドマーク（座標は検証済み） ---------- */
const POI = {
  'izu-oshima':   { peak:{name:'三原山', ele:758,  lat:34.724, lng:139.394}, port:{name:'元町港',   lat:34.750, lng:139.356} },
  'toshima':      { peak:{name:'宮塚山', ele:508,  lat:34.5196, lng:139.2792}, port:{name:'利島港', lat:34.529, lng:139.279} },
  'niijima':      { peak:{name:'宮塚山', ele:432,  lat:34.3969, lng:139.2703}, port:{name:'新島港', lat:34.372, lng:139.252} },
  'shikinejima':  { peak:{name:'神引山', ele:99,   lat:34.3261, lng:139.2029}, port:{name:'野伏港', lat:34.3352, lng:139.2137} },
  'kozushima':    { peak:{name:'天上山', ele:572,  lat:34.219, lng:139.156}, port:{name:'神津島港', lat:34.203, lng:139.134} },
  'miyakejima':   { peak:{name:'雄山',   ele:775,  lat:34.085, lng:139.5253}, port:{name:'三池港',  lat:34.100, lng:139.5555} },
  'mikurajima':   { peak:{name:'御山',   ele:851,  lat:33.874, lng:139.603}, port:{name:'御蔵島港', lat:33.9005, lng:139.5925} },
  'hachijojima':  { peak:{name:'八丈富士', ele:854, lat:33.136, lng:139.762}, port:{name:'底土港',  lat:33.113, lng:139.802} },
  'aogashima':    { peak:{name:'大凸部', ele:423,  lat:32.4583, lng:139.7592}, port:{name:'三宝港', lat:32.448, lng:139.755} },
  'sado':         { peak:{name:'金北山', ele:1172, lat:38.122, lng:138.343}, port:{name:'両津港',   lat:38.079, lng:138.437} },
  'yakushima':    { peak:{name:'宮之浦岳', ele:1936, lat:30.336, lng:130.504}, port:{name:'宮之浦港', lat:30.432, lng:130.573} },
  'tanegashima':  { port:{name:'西之表港', lat:30.7281, lng:130.9926} },
  'amami-oshima': { peak:{name:'湯湾岳', ele:694,  lat:28.294, lng:129.325}, port:{name:'名瀬港',   lat:28.3841, lng:129.497} },
  'kikaijima':    { peak:{name:'百之台', ele:203,  lat:28.298, lng:129.966}, port:{name:'湾港',     lat:28.318, lng:129.932} },
  'tokunoshima':  { peak:{name:'井之川岳', ele:645, lat:27.755, lng:128.963}, port:{name:'亀徳港',  lat:27.734, lng:129.024} },
  'okinoerabu':   { peak:{name:'大山',   ele:240,  lat:27.359, lng:128.587}, port:{name:'和泊港',   lat:27.393, lng:128.657} },
  'yoron':        { port:{name:'与論港', lat:27.034, lng:128.4035} },
  'okinawa-hontou':{ peak:{name:'与那覇岳', ele:503, lat:26.7172, lng:128.2186}, port:{name:'那覇港', lat:26.216, lng:127.672} },
  'kumejima':     { peak:{name:'宇江城岳', ele:310, lat:26.3765, lng:126.7693}, port:{name:'兼城港', lat:26.342, lng:126.739} },
  'miyako':       { port:{name:'平良港', lat:24.810, lng:125.282} },
  'ishigaki':     { peak:{name:'於茂登岳', ele:526, lat:24.422, lng:124.190}, port:{name:'石垣港',  lat:24.3372, lng:124.156} },
  'iriomote':     { peak:{name:'古見岳', ele:469,  lat:24.3583, lng:123.890}, port:{name:'大原港',  lat:24.284, lng:123.876} },
  'yonaguni':     { peak:{name:'宇良部岳', ele:231, lat:24.4528, lng:123.0056}, port:{name:'久部良港', lat:24.451, lng:122.943} },
  'hateruma':     { port:{name:'波照間港', lat:24.068, lng:123.771} },
};

/* ---------- 海岸線リング（geo.js: 高解像度detail → islands → refs） ---------- */
const REF_ALIAS = { 'okinawa-hontou':'okinawa' };
function ringFor(id){
  const G = window.GEO || {};
  if (id === 'miyakejima' && G.miyakeDetail && G.miyakeDetail.length) return G.miyakeDetail;
  if (G.isleDetail && G.isleDetail[id]) return G.isleDetail[id];
  if (G.islands && G.islands[id]) return G.islands[id];
  const rk = REF_ALIAS[id] || id;
  if (G.refs && G.refs[rk]){
    return G.refs[rk].reduce((a,b)=> a.length>=b.length ? a : b);
  }
  return null;
}
function available(is){ return !!ringFor(is.id); }

/* ---------- 投影（lat/lng → 0-100 / 逆変換つき） ---------- */
function makeProj(ring){
  let mnLa=Infinity, mxLa=-Infinity, mnLn=Infinity, mxLn=-Infinity;
  for (const [la,ln] of ring){
    if(la<mnLa)mnLa=la; if(la>mxLa)mxLa=la; if(ln<mnLn)mnLn=ln; if(ln>mxLn)mxLn=ln;
  }
  const latMid=(mnLa+mxLa)/2, kx=Math.cos(latMid*Math.PI/180);
  const w=(mxLn-mnLn)*kx, h=(mxLa-mnLa), pad=13, span=Math.max(w,h)||0.01;
  const sc=(100-2*pad)/span;
  const offx=pad+((100-2*pad)-w*sc)/2, offy=pad+((100-2*pad)-h*sc)/2;
  const f=(la,ln)=>({ x:+(offx+(ln-mnLn)*kx*sc).toFixed(2), y:+(offy+(mxLa-la)*sc).toFixed(2) });
  f.inv=(x,y)=>({ lat:+(mxLa-(y-offy)/sc).toFixed(5), lng:+(mnLn+(x-offx)/(kx*sc)).toFixed(5) });
  f.inBounds=(la,ln)=>{ const q=f(la,ln); return q.x>1 && q.x<99 && q.y>1 && q.y<99; };
  return f;
}

/* ---------- ズーム状態 ---------- */
function resetViewFor(id){
  if (!VIEW || VIEW.id !== id) VIEW = { id, z:1, cx:50, cy:50 };
}
function viewBoxStr(){
  const w = 100/VIEW.z;
  const x = Math.min(100-w, Math.max(0, VIEW.cx - w/2));
  const y = Math.min(100-w, Math.max(0, VIEW.cy - w/2));
  VIEW.cx = x + w/2; VIEW.cy = y + w/2;
  return `${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${w.toFixed(2)}`;
}

/* ---------- SVG生成（パンフレット調） ---------- */
function mapSVG(is){
  const ring = ringFor(is.id);
  if (!ring) return '';
  const proj = makeProj(ring);
  PROJ = proj;
  const pts = ring.map(([la,ln])=>proj(la,ln));
  const ptsStr = pts.map(p=>`${p.x},${p.y}`).join(' ');
  const iv = 1/VIEW.z;
  const vb = viewBoxStr();
  const [vx, vy] = vb.split(' ').map(Number);
  const poi = POI[is.id] || {};

  // 山マーカー
  let peakM = '';
  if (poi.peak && proj.inBounds(poi.peak.lat, poi.peak.lng)){
    const q = proj(poi.peak.lat, poi.peak.lng);
    peakM = `<g pointer-events="none">
      <path d="M ${q.x-2.4*iv} ${q.y+1.6*iv} L ${q.x} ${q.y-2.4*iv} L ${q.x+2.4*iv} ${q.y+1.6*iv} Z" fill="#7a5c3e" stroke="#fff" stroke-width="${0.5*iv}"/>
      <text x="${q.x}" y="${q.y+5.4*iv}" text-anchor="middle" font-size="${3.3*iv}" font-weight="800" fill="#4b3a26"
        paint-order="stroke" stroke="#fff" stroke-width="${1*iv}">${esc(poi.peak.name)} ${poi.peak.ele}m</text>
    </g>`;
  }
  // 港マーカー
  let portM = '';
  if (poi.port && proj.inBounds(poi.port.lat, poi.port.lng)){
    const q = proj(poi.port.lat, poi.port.lng);
    portM = `<g pointer-events="none" transform="translate(${q.x},${q.y})">
      <circle r="${2.6*iv}" fill="#fff" stroke="#4a6fa5" stroke-width="${0.7*iv}"/>
      <text y="${0.9*iv}" text-anchor="middle" font-size="${2.5*iv}">⚓</text>
      <text y="${-3.4*iv}" text-anchor="middle" font-size="${2.7*iv}" font-weight="800" fill="#174a5c"
        paint-order="stroke" stroke="#fff" stroke-width="${1*iv}">${esc(poi.port.name)}</text>
    </g>`;
  }
  // スポット（v2データ。カテゴリ色の大きめバッジ＋ラベル常時表示）
  const spots = visibleSpots(is).filter(s => isFinite(s.lat) && isFinite(s.lng));
  const spotsM = spots.map(s => {
    const q = proj(s.lat, s.lng);
    if (q.x < 1 || q.x > 99 || q.y < 1 || q.y > 99) return '';
    const st = catStyle(s.cat);
    return `<g class="kspot" data-sid="${esc(s.id)}" transform="translate(${q.x},${q.y})">
      <circle r="${2.8*iv}" fill="#fff" stroke="${st.color}" stroke-width="${0.7*iv}" opacity=".97"/>
      <text y="${0.9*iv}" text-anchor="middle" font-size="${2.6*iv}">${st.ico}</text>
      <text y="${-3.4*iv}" text-anchor="middle" font-size="${2.6*iv}" font-weight="800" fill="#174a5c"
        paint-order="stroke" stroke="#fff" stroke-width="${1*iv}">${esc(s.name)}</text>
    </g>`;
  }).join('');
  // 波の飾り
  const wave = (x,y) => `<path d="M ${x} ${y} q 1.6 -1.3 3.2 0 q 1.6 1.3 3.2 0" fill="none" stroke="#7db7cc" stroke-width="0.55" stroke-linecap="round" opacity=".7"/>`;
  const waves = [ [8,12],[86,9],[6,58],[90,64],[12,90],[80,92],[46,5] ].map(([x,y])=>wave(x,y)).join('');
  // タイトルリボン（画面左上に固定）
  const label = `${is.name} 観光マップ`;
  const lw = label.length * 4.1 + 8;
  const ribbon = `<g pointer-events="none" transform="translate(${vx + 2*iv} ${vy + 89.5*iv}) scale(${iv})">
    <rect x="0" y="0" width="${lw}" height="8" rx="4" fill="#ff9f43" opacity="0.96"/>
    <rect x="0.7" y="0.7" width="${lw-1.4}" height="6.6" rx="3.3" fill="none" stroke="rgba(255,255,255,.7)" stroke-width="0.5" stroke-dasharray="1.6 1.1"/>
    <text x="${lw/2}" y="5.6" text-anchor="middle" font-size="4" font-weight="900" fill="#fff">${esc(label)}</text>
  </g>`;

  return `<svg id="kmapSvg" viewBox="${vb}" preserveAspectRatio="xMidYMid meet">
    <defs>
      <linearGradient id="kSea" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#c3e9f5"/><stop offset="100%" stop-color="#9fd4e8"/>
      </linearGradient>
      <linearGradient id="kLand" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#d2ec9e"/><stop offset="100%" stop-color="#bfe28c"/>
      </linearGradient>
    </defs>
    <rect x="-60" y="-60" width="220" height="220" fill="url(#kSea)"/>
    ${waves}
    <polygon points="${ptsStr}" fill="none" stroke="#ffffff" stroke-width="${4*iv}" stroke-linejoin="round" opacity="0.9"/>
    <polygon points="${ptsStr}" fill="none" stroke="#f2cf87" stroke-width="${2*iv}" stroke-linejoin="round"/>
    <polygon points="${ptsStr}" fill="url(#kLand)" stroke="#74a85c" stroke-width="${0.5*iv}" stroke-linejoin="round"/>
    ${peakM}${portM}${spotsM}${ribbon}
    <g pointer-events="none" opacity="0.75" transform="translate(94,0)">
      <text x="0" y="8.5" text-anchor="middle" font-size="4" font-weight="900" fill="#4a7080">N</text>
      <path d="M 0 9.6 L 0 15 M -1.4 11.2 L 0 9.6 L 1.4 11.2" fill="none" stroke="#4a7080" stroke-width="0.7"/>
    </g>
  </svg>`;
}

/* ---------- 描画・モード切替 ---------- */
function render(is){
  const km = $('#kmap');
  if (!km) return;
  resetViewFor(is.id);
  curId = is.id;
  km.innerHTML = mapSVG(is) + `
    <div class="kmap-tools">
      <button data-kz="in" title="拡大">＋</button>
      <button data-kz="out" title="縮小">－</button>
      <button data-kz="reset" title="全体">⤢</button>
    </div>
    <div class="kmap-pop hidden" id="kpop"></div>`;
  wire(is);
}
function rerender(is){
  const km = $('#kmap');
  const old = km && km.querySelector('svg');
  if (old) old.outerHTML = mapSVG(is);
}
function apply(is){
  const wrap = $('#dmapwrap');
  if (!wrap) return;
  const ok = available(is);
  $('#kankoBtn').classList.toggle('hidden', !ok);
  if (!ok && mode){ mode = false; }
  wrap.classList.toggle('kanko', mode);
  $('#kmap').classList.toggle('hidden', !mode);
  $('#kankoBtn').classList.toggle('on', mode);
  if (mode) render(is);
}
function updateLink(is){
  const a = $('#kankoLink');
  if (!a) return;
  const k = KANKO_LINKS[is.id];
  a.classList.toggle('hidden', !k);
  if (k){ a.href = k.url; a.title = `${k.org}の公式マップ（パンフレット）を開く`; }
}

/* ---------- 操作（ズーム・パン・タップ） ---------- */
function wire(is){
  const km = $('#kmap');
  const zoomTo = z => { VIEW.z = Math.min(6, Math.max(1, z)); rerender(islandById(curId) || is); };
  km.querySelectorAll('[data-kz]').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    if (b.dataset.kz === 'in')  zoomTo(VIEW.z * 1.5);
    if (b.dataset.kz === 'out') zoomTo(VIEW.z / 1.5);
    if (b.dataset.kz === 'reset'){ VIEW.cx = 50; VIEW.cy = 50; zoomTo(1); }
  }));
  let dragged = false;
  km.addEventListener('click', ev => {
    if (ev.target.closest('.kmap-tools') || ev.target.closest('.kmap-pop')) return;
    if (dragged){ dragged = false; return; }
    const cur = islandById(curId) || is;
    const spotEl = ev.target.closest('.kspot');
    if (spotEl && !pickCb){ showPop(cur, spotEl.dataset.sid); return; }
    const svgEl = km.querySelector('svg');
    if (!svgEl || !ev.target.closest('svg')) return;
    hidePop();
    // SVG座標 → 緯度経度
    const rect = svgEl.getBoundingClientRect();
    const vbv = svgEl.viewBox.baseVal;
    // preserveAspectRatio meet の余白を補正
    const sc = Math.min(rect.width / vbv.width, rect.height / vbv.height);
    const ox = (rect.width  - vbv.width  * sc) / 2;
    const oy = (rect.height - vbv.height * sc) / 2;
    const x = vbv.x + (ev.clientX - rect.left - ox) / sc;
    const y = vbv.y + (ev.clientY - rect.top  - oy) / sc;
    if (pickCb && PROJ){
      const cb = pickCb; pickCb = null;
      $('#dmapwrap').classList.remove('picking');
      cb(PROJ.inv(x, y));
    }
  });
  // ホイールズーム
  km.addEventListener('wheel', ev => {
    ev.preventDefault();
    zoomTo(VIEW.z * (ev.deltaY < 0 ? 1.2 : 0.83));
  }, {passive:false});
  // ドラッグ移動（ズーム中）＋ピンチ
  let pan = null, pinchD = null;
  const pt = ev => ev.touches ? {x:ev.touches[0].clientX, y:ev.touches[0].clientY} : {x:ev.clientX, y:ev.clientY};
  const dist = ev => Math.hypot(ev.touches[0].clientX-ev.touches[1].clientX, ev.touches[0].clientY-ev.touches[1].clientY);
  const start = ev => {
    if (ev.touches && ev.touches.length === 2){ pinchD = dist(ev); pan = null; return; }
    if (VIEW.z <= 1) return;
    pan = {...pt(ev), cx:VIEW.cx, cy:VIEW.cy};
  };
  const move = ev => {
    if (ev.touches && ev.touches.length === 2 && pinchD){
      const d = dist(ev); zoomTo(VIEW.z * d/pinchD); pinchD = d; return;
    }
    if (!pan) return;
    const p = pt(ev);
    const svgEl = km.querySelector('svg');
    if (!svgEl) return;
    const rect = svgEl.getBoundingClientRect();
    const w = 100/VIEW.z;
    const dx = (p.x-pan.x)/rect.width*w, dy = (p.y-pan.y)/rect.height*w;
    if (Math.abs(p.x-pan.x) + Math.abs(p.y-pan.y) > 5) dragged = true;
    VIEW.cx = pan.cx - dx; VIEW.cy = pan.cy - dy;
    rerender(islandById(curId) || is);
  };
  const end = () => { pan = null; pinchD = null; };
  km.addEventListener('mousedown', start);
  km.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
  km.addEventListener('touchstart', start, {passive:true});
  km.addEventListener('touchmove', move, {passive:true});
  km.addEventListener('touchend', end);
}

/* ---------- スポットのポップアップ ---------- */
function hidePop(){ $('#kpop')?.classList.add('hidden'); }
function showPop(is, sid){
  const s = liveList(is.spots).find(x => x.id === sid);
  if (!s) return;
  const el = $('#kpop');
  const st = catStyle(s.cat);
  el.innerHTML = `
    <div class="kp-r1"><span class="kp-ic" style="background:${st.color}">${st.ico}</span>
      <span class="kp-nm">${esc(s.name)}<span class="kp-cat">${esc(s.cat)}</span></span>
      <button class="kp-x">✕</button></div>
    ${s.note ? `<div class="kp-note">${esc(s.note)}</div>` : ''}
    <div class="kp-r2">
      ${/^https?:\/\/\S+$/i.test(s.url||'') ? `<a class="btn accent" target="_blank" rel="noopener" href="${esc(s.url)}">🔗 Web</a>` : ''}
      <button class="btn" data-kedit>✏️ 編集</button>
    </div>`;
  el.classList.remove('hidden');
  el.querySelector('.kp-x').onclick = hidePop;
  el.querySelector('[data-kedit]').onclick = () => { hidePop(); spotForm(is, s); };
}

/* ---------- 公開API ---------- */
return {
  active: () => mode,
  onOpen(is){ pickCb = null; hidePop(); updateLink(is); apply(is); },
  refresh(is){ if (mode && is.id === curId) render(is); },
  toggle(){
    const is = islandById(STATE.activeId);
    if (!is) return;
    mode = !mode;
    try { localStorage.setItem(MODE_KEY, mode ? 'kanko' : 'gsi'); } catch(e){}
    apply(is);
    if (!mode && typeof dmap !== 'undefined' && dmap) setTimeout(() => dmap.invalidateSize(), 60);
  },
  pick(cb){
    pickCb = cb;
    $('#dmapwrap').classList.add('picking');
  },
};

})();

/* ---------- ボタン配線 ---------- */
document.querySelector('#kankoBtn')?.addEventListener('click', () => window.Kanko.toggle());
