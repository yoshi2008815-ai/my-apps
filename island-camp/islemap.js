// ===== 島の詳細地図（観光マップ風・全島共通） =====
// 実海岸線（geo.js / OpenStreetMap ODbL）＋ 観光スポット（キャンプ場・港・空港・名所・食事処）。
// ズーム（＋/−・ホイール・ピンチ）、ドラッグ移動、スポットタップ→Googleマップへのリンク付き。
// app.js のグローバル（modalForm, saveIslands, openIsland, esc, toast）を利用する。
'use strict';
(function(){

/* ---------- ランドマーク（山・港）位置は目安 ---------- */
const POI = {
  'izu-oshima':   { peak:{name:'三原山', ele:758,  lat:34.724, lng:139.394}, port:{name:'元町港',   lat:34.750, lng:139.356} },
  'toshima':      { peak:{name:'宮塚山', ele:508,  lat:34.5196, lng:139.2792}, port:{name:'利島港', lat:34.529, lng:139.279} },
  'niijima':      { peak:{name:'宮塚山', ele:432,  lat:34.3969, lng:139.2703}, port:{name:'新島港', lat:34.372, lng:139.252} },
  'shikinejima':  { peak:{name:'神引山', ele:99,   lat:34.3261, lng:139.2029}, port:{name:'野伏港', lat:34.3352, lng:139.2137} },
  'kozushima':    { peak:{name:'天上山', ele:572,  lat:34.219, lng:139.156}, port:{name:'神津島港', lat:34.203, lng:139.134} },
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

/* ---------- 海岸線リングの取得（高解像度detail → islands → refs） ---------- */
const REF_ALIAS = { 'okinawa-hontou':'okinawa', 'miyako':'miyako', 'tanegashima':'tanegashima' };
function ringFor(id){
  const G = window.GEO || {};
  if (G.isleDetail && G.isleDetail[id]) return G.isleDetail[id]; // パンフ級の細かさ
  if (G.islands && G.islands[id]) return G.islands[id];
  const rk = REF_ALIAS[id];
  if (rk && G.refs && G.refs[rk]){
    const rings = G.refs[rk];
    return rings.reduce((a,b)=> a.length>=b.length ? a : b);
  }
  return null;
}

/* ---------- 投影（lat/lng → 0-100 ビューボックス） ---------- */
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
  f.inBounds=(la,ln)=>{ const q=f(la,ln); return q.x>2 && q.x<98 && q.y>2 && q.y<98; };
  return f;
}

/* ---------- スポット（港＋ジオコーディング済み観光地） ---------- */
function spotsFor(is){
  const out = [];
  const poi = POI[is.id] || {};
  if (poi.port) out.push({name:poi.port.name, ic:'⚓', lat:poi.port.lat, lng:poi.port.lng});
  const ex = (window.GEO && GEO.isleSpots && GEO.isleSpots[is.id]) || [];
  return out.concat(ex);
}
function gmapsURL(name, islandName){
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(name + ' ' + islandName);
}

/* ---------- ズーム状態（島ごとにリセット） ---------- */
let VIEW = null;
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

/* ---------- SVG生成 ---------- */
function mapSVG(is){
  const ring = ringFor(is.id);
  if (!ring) return '';
  const proj = makeProj(ring);
  const pts = ring.map(([la,ln])=>proj(la,ln));
  const ptsStr = pts.map(p=>`${p.x},${p.y}`).join(' ');
  const iv = 1/VIEW.z; // マーカー・文字はズームしても画面上で同じ大きさに
  const poi = POI[is.id] || {};
  let cx = pts.reduce((s,p)=>s+p.x,0)/pts.length;
  let cy = pts.reduce((s,p)=>s+p.y,0)/pts.length;
  if (poi.peak && proj.inBounds(poi.peak.lat, poi.peak.lng)){
    const q = proj(poi.peak.lat, poi.peak.lng); cx=q.x; cy=q.y;
  }
  const contour = k => pts.map(p=>`${(cx+(p.x-cx)*k).toFixed(2)},${(cy+(p.y-cy)*k).toFixed(2)}`).join(' ');
  const hasPeak = !!poi.peak;

  // 山マーカー
  let peakM = '';
  if (hasPeak && proj.inBounds(poi.peak.lat, poi.peak.lng)){
    const q = proj(poi.peak.lat, poi.peak.lng);
    peakM = `<g pointer-events="none">
      <path d="M ${q.x-2.4*iv} ${q.y+1.6*iv} L ${q.x} ${q.y-2.4*iv} L ${q.x+2.4*iv} ${q.y+1.6*iv} Z" fill="#7a5c3e" stroke="#fff" stroke-width="${0.5*iv}"/>
      <text x="${q.x}" y="${q.y+5.4*iv}" text-anchor="middle" font-size="${3.3*iv}" font-weight="800" fill="#4b3a26"
        paint-order="stroke" stroke="#fff" stroke-width="${1*iv}">${esc(poi.peak.name)} ${poi.peak.ele}m</text>
    </g>`;
  }
  // 観光スポット（⚓港 ⛺キャンプ ✈空港 🏞名所 🍴食事）
  const showAllLabels = VIEW.z >= 1.7;
  const spotsM = spotsFor(is).map((s,i) => {
    const q = proj(s.lat, s.lng);
    if (q.x < 1 || q.x > 99 || q.y < 1 || q.y > 99) return '';
    const label = (showAllLabels || '⚓⛺✈'.includes(s.ic))
      ? `<text y="${-3.1*iv}" text-anchor="middle" font-size="${2.9*iv}" font-weight="800" fill="#33534a" paint-order="stroke" stroke="#fff" stroke-width="${1*iv}">${esc(s.name)}</text>` : '';
    return `<g class="imap-spot" data-si="${i}" transform="translate(${q.x},${q.y})">
      <circle r="${2.3*iv}" fill="#fff" stroke="#8aa86e" stroke-width="${0.35*iv}" opacity=".95"/>
      <text y="${0.9*iv}" text-anchor="middle" font-size="${2.5*iv}">${s.ic}</text>${label}
    </g>`;
  }).join('');
  // ユーザー登録スポットのピン（オレンジ縁＝自分の登録）
  const places = (is.places||[]).map((p,i)=>`<g class="imap-pin" data-pi="${i}" transform="translate(${p.x},${p.y})">
      <circle r="${2.3*iv}" fill="#fff" stroke="#ef8c2c" stroke-width="${0.55*iv}"/>
      <text y="${0.9*iv}" text-anchor="middle" font-size="${2.5*iv}">${p.ic||'📍'}</text>
      <text x="${3.2*iv}" y="${1.1*iv}" font-size="${3*iv}" font-weight="800" fill="#8a5210"
        paint-order="stroke" stroke="#fff" stroke-width="${1*iv}">${esc(p.name)}</text>
    </g>`).join('');

  return `<svg id="imapSvg" viewBox="${viewBoxStr()}">
    <defs>
      <radialGradient id="imSea" cx="50%" cy="38%" r="75%">
        <stop offset="0%" stop-color="#eaf7fa"/><stop offset="100%" stop-color="#c6e4ef"/>
      </radialGradient>
      <radialGradient id="imLand" cx="${cx}" cy="${cy}" r="52" gradientUnits="userSpaceOnUse">
        ${hasPeak
          ? '<stop offset="0%" stop-color="#8fae6a"/><stop offset="55%" stop-color="#b5d48d"/><stop offset="100%" stop-color="#d9e9be"/>'
          : '<stop offset="0%" stop-color="#c2dc99"/><stop offset="100%" stop-color="#dcebc2"/>'}
      </radialGradient>
    </defs>
    <rect x="-30" y="-30" width="160" height="160" fill="url(#imSea)"/>
    <polygon points="${ptsStr}" fill="none" stroke="#ffffff" stroke-width="${3.2*iv}" stroke-linejoin="round" opacity="0.9"/>
    <polygon points="${ptsStr}" fill="none" stroke="#ecd9a4" stroke-width="${1.5*iv}" stroke-linejoin="round"/>
    <polygon points="${ptsStr}" fill="url(#imLand)" stroke="#8aa86e" stroke-width="${0.5*iv}" stroke-linejoin="round"/>
    ${hasPeak ? `<polygon points="${contour(0.62)}" fill="none" stroke="#7d9a5e" stroke-width="${0.3*iv}" opacity="0.55" stroke-linejoin="round"/>
    <polygon points="${contour(0.32)}" fill="none" stroke="#6a8850" stroke-width="${0.3*iv}" opacity="0.6" stroke-linejoin="round"/>` : ''}
    ${peakM}${spotsM}${places}
    <g pointer-events="none" opacity="0.75" transform="translate(${94 - (VIEW.z>1 ? 0 : 0)},0)">
      <text x="0" y="8.5" text-anchor="middle" font-size="4" font-weight="900" fill="#69868c">N</text>
      <path d="M 0 9.6 L 0 15 M -1.4 11.2 L 0 9.6 L 1.4 11.2" fill="none" stroke="#69868c" stroke-width="0.7"/>
    </g>
  </svg>`;
}

/* ---------- 公開API ---------- */
window.isleMapHTML = function(is){
  if (!Array.isArray(is.places)) is.places = [];
  resetViewFor(is.id);
  const svgHTML = mapSVG(is);
  if (!svgHTML) return '';
  const list = is.places.length
    ? `<ul class="list" style="margin-top:12px">${is.places.map((p,i)=>
        `<li><span class="ic">${p.ic||'📍'}</span><span class="txt"><b>${esc(p.name)}</b>${p.note?`<span class="pnote">${esc(p.note)}</span>`:''}${p.by?`<span class="pby">👤 登録：${esc(p.by)}</span>`:''}</span><span class="x" data-del="places:${i}">✕</span></li>`).join('')}</ul>`
    : '';
  return `<div class="sec" data-sec="islemap"><h3>🗺 島マップ</h3>
    <div class="imap" id="imapBox">
      ${svgHTML}
      <div class="imap-tools">
        <button data-iz="in" title="拡大">＋</button>
        <button data-iz="out" title="縮小">－</button>
        <button data-iz="reset" title="全体">⤢</button>
      </div>
      <div class="imap-pop hidden" id="imapPop"></div>
    </div>
    <div class="imap-cap"><span>🔍 ＋/−・ピンチで拡大</span><span>スポットをタップ／空きをタップで追加</span></div>
    ${list}</div>`;
};

window.wireIsleMap = function(is){
  const box = document.querySelector('#imapBox');
  if (!box) return;
  const pop = () => box.querySelector('#imapPop');
  let dragged = false;

  const rerender = () => {
    const old = box.querySelector('svg');
    if (old) old.outerHTML = mapSVG(is);
  };
  const zoomTo = z => { VIEW.z = Math.min(5, Math.max(1, z)); rerender(); };

  // スポット情報ポップアップ（おすすめ・登録者・URLリンク付き）
  const showPop = (o) => {
    const el = pop();
    const url = o.url || gmapsURL(o.name, is.name);
    el.innerHTML = `
      <div class="pop-r1"><span class="pic">${o.ic||'📍'}</span><span class="nm">${esc(o.name)}</span><button class="pclose">✕</button></div>
      ${o.note ? `<div class="pop-note">${esc(o.note)}</div>` : ''}
      <div class="pop-r2"><span class="pop-by">${o.by ? `👤 登録：${esc(o.by)}` : ''}</span>
        <a class="btn accent" target="_blank" rel="noopener" href="${esc(url)}">🌐 ${o.url ? 'サイトを見る' : '地図で見る'}</a></div>`;
    el.classList.remove('hidden');
    el.querySelector('.pclose').onclick = () => el.classList.add('hidden');
  };

  // クリック（スポット詳細 / スポット登録）
  box.addEventListener('click', ev => {
    if (ev.target.closest('.imap-tools') || ev.target.closest('.imap-pop')) return;
    if (dragged){ dragged = false; return; }
    const spotEl = ev.target.closest('.imap-spot');
    if (spotEl){
      const s = spotsFor(is)[+spotEl.dataset.si];
      if (s) showPop(s);
      return;
    }
    const pinEl = ev.target.closest('.imap-pin');
    if (pinEl){
      const p = is.places[+pinEl.dataset.pi];
      if (p) showPop(p);
      return;
    }
    const svgEl = box.querySelector('svg');
    if (!svgEl || !ev.target.closest('svg')) return;
    pop().classList.add('hidden');
    const rect = svgEl.getBoundingClientRect();
    const vb = svgEl.viewBox.baseVal;
    const x = +(vb.x + (ev.clientX-rect.left)/rect.width  * vb.width ).toFixed(1);
    const y = +(vb.y + (ev.clientY-rect.top) /rect.height * vb.height).toFixed(1);
    modalForm('スポットを登録', [
      {name:'name', label:'名所の名前', ph:'例：中の浦海水浴場'},
      {name:'ic', label:'アイコン', type:'select', options:[
        {v:'🏞', l:'🏞 名所・景色'}, {v:'🏖', l:'🏖 ビーチ'}, {v:'♨', l:'♨ 温泉'},
        {v:'🍴', l:'🍴 食事処'}, {v:'⛺', l:'⛺ キャンプ場'}, {v:'🏪', l:'🏪 お店'}, {v:'📍', l:'📍 その他'}]},
      {name:'note', label:'何がおすすめ？', type:'textarea', ph:'例：透明度がすごい。シュノーケルは午前が◎'},
      {name:'url', label:'URL（あれば）', ph:'https://…'},
      {name:'by', label:'登録者', ph:'例：よしざわ'}
    ], v => {
      if (!v.name) return false;
      is.places.push({x, y, name:v.name, ic:v.ic||'📍', note:v.note||'', url:v.url||'', by:v.by||''});
      saveIslands(); toast(`「${v.name}」を登録しました`); openIsland(is.id);
    });
  });

  // ズームボタン
  box.querySelectorAll('[data-iz]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.iz === 'in')  zoomTo(VIEW.z * 1.5);
    if (b.dataset.iz === 'out') zoomTo(VIEW.z / 1.5);
    if (b.dataset.iz === 'reset'){ VIEW.cx = 50; VIEW.cy = 50; zoomTo(1); }
  }));

  // ホイールズーム
  box.addEventListener('wheel', ev => {
    ev.preventDefault();
    zoomTo(VIEW.z * (ev.deltaY < 0 ? 1.2 : 0.83));
  }, {passive:false});

  // ドラッグ移動（ズーム中のみ）＋ ピンチズーム
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
    const rect = box.querySelector('svg').getBoundingClientRect();
    const w = 100/VIEW.z;
    const dx = (p.x-pan.x)/rect.width*w, dy = (p.y-pan.y)/rect.height*w;
    if (Math.abs(p.x-pan.x) + Math.abs(p.y-pan.y) > 5) dragged = true;
    VIEW.cx = pan.cx - dx; VIEW.cy = pan.cy - dy;
    rerender();
  };
  const end = () => { pan = null; pinchD = null; };
  box.addEventListener('mousedown', start);
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
  box.addEventListener('touchstart', start, {passive:true});
  box.addEventListener('touchmove', move, {passive:true});
  box.addEventListener('touchend', end);
};

})();
