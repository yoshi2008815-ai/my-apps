// ===== 三宅島スペシャル : 横顔（火山プロファイル）＋キャンプ記録 =====
// 三宅島(miyakejima)を開いたときだけ、地図/キャンプ場/交通/記録の専用UIを表示する。
// app.js のグローバル（STATE, saveIslands, toast, modalForm, esc, section,
// photosBlock, listLogs, bindBody, PhotoDB, openIsland）を利用する。
'use strict';

/* ---------- 参考情報（編集はアプリ内で。番号は要確認） ---------- */
// 電話番号・時刻は変更されることがあります。出発前に必ず公式情報をご確認ください。
const MIYAKE_INFO = {
  campsites: [
    {
      name: '三宅村レクリエーションセンター（キャンプ）',
      area: '阿古・錆ヶ浜エリア',
      facilities: ['炊事場', 'トイレ', '駐車場', '海が近い'],
      note: '錆ヶ浜港・温泉ふるさとの湯に近く拠点にしやすい。利用は事前に村へ確認。',
      tel: '04994-5-0902'
    },
    {
      name: '大路池（たいろいけ）周辺・自然観察ゾーン',
      area: '島南部',
      facilities: ['遊歩道', '野鳥観察', 'アカコッコ館が近い'],
      note: '直接の幕営可否は要確認。バードウォッチングと森歩きの拠点。',
      tel: ''
    }
  ],
  // ① 公共交通：村営バス（環状路線）— 時刻は代表例。最新は村営バス時刻表で要確認
  bus: {
    name: '三宅村営バス（島内環状）',
    note: '島を一周する路線。便数が少ないため事前に時刻確認を。',
    lines: [
      { route: '三池港 → 阿古（坪田まわり）', times: ['7:10', '9:40', '13:20', '16:30'] },
      { route: '阿古 → 三池港（伊豆まわり）', times: ['8:05', '11:15', '14:40', '17:50'] }
    ]
  },
  // ② 交通機関・連絡先（要確認）
  phones: [
    { label: '東海汽船（船・予約）', tel: '03-5472-9999', tag: '船' },
    { label: '新中央航空（飛行機・調布）', tel: '0422-31-4191', tag: '空' },
    { label: '三宅島空港', tel: '04994-2-0204', tag: '空' },
    { label: '三宅村観光協会', tel: '04994-5-1144', tag: '観光' },
    { label: '三宅村役場', tel: '04994-5-0981', tag: '行政' },
    { label: 'タクシー（島内）', tel: '04994-2-0181', tag: 'タクシー' }
  ],
  // ③ 地図上のスポットは geo.js の実座標（GEO.miyakeSpots）を使用
};

/* ---------- 三宅島 実輪郭の投影（lat/lng → 0-100 ビューボックス） ---------- */
function mykProject(){
  const ring = (window.GEO && GEO.miyakeDetail) || [];
  if (!ring.length) return null;
  let mnLa=Infinity, mxLa=-Infinity, mnLn=Infinity, mxLn=-Infinity;
  for (const [la,ln] of ring){
    if(la<mnLa)mnLa=la; if(la>mxLa)mxLa=la; if(ln<mnLn)mnLn=ln; if(ln>mxLn)mxLn=ln;
  }
  const latMid=(mnLa+mxLa)/2, kx=Math.cos(latMid*Math.PI/180);
  const w=(mxLn-mnLn)*kx, h=(mxLa-mnLa), pad=12, span=Math.max(w,h)||0.01;
  const sc=(100-2*pad)/span;
  const offx=pad+((100-2*pad)-w*sc)/2, offy=pad+((100-2*pad)-h*sc)/2;
  const f=(la,ln)=>({ x:+(offx+(ln-mnLn)*kx*sc).toFixed(2), y:+(offy+(mxLa-la)*sc).toFixed(2) });
  f.ring=ring;
  return f;
}

/* ---------- メイン描画 ---------- */
window.renderMiyakeBody = async function(is){
  if (!Array.isArray(is.miyakeVisited)) is.miyakeVisited = [];
  if (!Array.isArray(is.miyakePlaces)) is.miyakePlaces = [];
  const body = document.querySelector('#pBody');
  const tab = is._mykTab || 'map';

  body.innerHTML = `
    ${heroHTML()}
    <div class="myk-tabs" id="mykTabs">
      <button data-t="map"     class="${tab==='map'?'on':''}">🗺 地図</button>
      <button data-t="camp"    class="${tab==='camp'?'on':''}">⛺ キャンプ場</button>
      <button data-t="traffic" class="${tab==='traffic'?'on':''}">🚌 交通</button>
      <button data-t="record"  class="${tab==='record'?'on':''}">📷 記録</button>
    </div>
    <div class="myk-panel" id="mykPanel">${panelHTML(is, tab)}</div>
  `;

  wireTabs(is);
  wireParallax();
  if (tab === 'map') wireMap(is);
  if (tab === 'record') await wireRecord(is);
};

/* ---------- ヒーロー（横顔・パララックス） ---------- */
function heroHTML(){
  // 上から見た円盤(top)と、横から見た火山シルエット(side)を重ね、
  // スクロール量に応じて top→side へ切り替える。
  return `
  <div class="myk-hero" id="mykHero">
    <div class="myk-sky"></div>
    <div class="myk-stage">
      <!-- 上から見た図（スクロール0で表示） -->
      <svg class="myk-top" viewBox="0 0 200 200" aria-hidden="true">
        <defs>
          <radialGradient id="mTop" cx="50%" cy="45%" r="60%">
            <stop offset="0%" stop-color="#8c6a45"/>
            <stop offset="55%" stop-color="#5f8a55"/>
            <stop offset="100%" stop-color="#3f6f48"/>
          </radialGradient>
        </defs>
        <circle cx="100" cy="100" r="86" fill="url(#mTop)" stroke="#2e5238" stroke-width="3"/>
        <circle cx="100" cy="100" r="60" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="2" stroke-dasharray="4 5"/>
        <circle cx="100" cy="92"  r="16" fill="#6b4a2e" stroke="#43301c" stroke-width="2"/>
        <text x="100" y="170" text-anchor="middle" fill="#fff" font-size="11" font-weight="700" opacity=".85">上から見た三宅島</text>
      </svg>
      <!-- 横から見た図（スクロールで立ち上がる） -->
      <svg class="myk-side" viewBox="0 0 400 220" aria-hidden="true">
        <defs>
          <linearGradient id="mVol" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#7d5a3a"/>
            <stop offset="70%" stop-color="#5a8050"/>
            <stop offset="100%" stop-color="#3f6f48"/>
          </linearGradient>
        </defs>
        <!-- 火山本体 -->
        <path d="M0 200 L120 110 L150 96 Q200 80 250 96 L280 110 L400 200 Z" fill="url(#mVol)" stroke="#2e5238" stroke-width="2"/>
        <!-- 火口の窪み -->
        <path d="M150 96 Q200 116 250 96" fill="none" stroke="#3a2b1c" stroke-width="3" opacity=".7"/>
        <!-- 噴気 -->
        <path class="myk-smoke" d="M200 92 q-10 -22 4 -40 q14 -16 2 -36" fill="none" stroke="rgba(255,255,255,.6)" stroke-width="6" stroke-linecap="round"/>
        <text x="200" y="60" text-anchor="middle" fill="#fff" font-size="13" font-weight="800" opacity=".9" paint-order="stroke" stroke="rgba(0,0,0,.25)" stroke-width="3">雄山 775m</text>
      </svg>
      <div class="myk-sea"></div>
    </div>
    <div class="myk-hero-cap">周囲約30km・火山の島／<b>スクロールで横顔</b></div>
  </div>`;
}

function wireParallax(){
  const body = document.querySelector('#pBody');
  const hero = document.querySelector('#mykHero');
  if (!body || !hero) return;
  const onScroll = () => {
    const max = 240;
    const p = Math.max(0, Math.min(1, body.scrollTop / max)); // 0=上から 1=横から
    hero.style.setProperty('--p', p.toFixed(3));
  };
  body.removeEventListener('scroll', body._mykScroll || (()=>{}));
  body._mykScroll = onScroll;
  body.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/* ---------- タブ ---------- */
function wireTabs(is){
  document.querySelectorAll('#mykTabs button').forEach(b => {
    b.addEventListener('click', async () => {
      is._mykTab = b.dataset.t;
      await window.renderMiyakeBody(is);
      // タブ切替時は記録の頭出しのためスクロール維持しつつ少し下げる
      const body = document.querySelector('#pBody');
      if (body && body.scrollTop < 60) body.scrollTop = 0;
    });
  });
}

function panelHTML(is, tab){
  if (tab === 'camp')    return campHTML();
  if (tab === 'traffic') return trafficHTML();
  if (tab === 'record')  return recordHTML(is);
  return mapHTML(is);
}

/* ---------- ① 地図 ＋ ④ 行った場所登録 ---------- */
function mykSpots(){ return (window.GEO && GEO.miyakeSpots) || []; }

function mapHTML(is){
  const proj = mykProject();
  const spots = mykSpots();
  const visited = new Set(is.miyakeVisited);
  // 実海岸線ポリゴン
  const pts = proj ? proj.ring.map(([la,ln])=>proj(la,ln)) : [];
  const islandPts = pts.map(p=>`${p.x},${p.y}`).join(' ');
  // 重心（等高線・地形グラデーションの基準点）
  let gcx=50, gcy=50;
  if (pts.length){
    gcx = pts.reduce((s,p)=>s+p.x,0)/pts.length;
    gcy = pts.reduce((s,p)=>s+p.y,0)/pts.length;
  }
  // 雄山カルデラ（山頂位置）
  const oy = spots.find(s=>s.id==='oyama');
  const cald = (oy && proj) ? proj(oy.lat,oy.lng) : {x:gcx,y:gcy};
  // 等高線（重心→外周へ段階的に縮小した輪郭で立体感を出す）
  const contour = (k) => pts.map(p=>`${(cald.x+(p.x-cald.x)*k).toFixed(2)},${(cald.y+(p.y-cald.y)*k).toFixed(2)}`).join(' ');
  const pins = spots.map(s => {
    const q = proj ? proj(s.lat,s.lng) : {x:50,y:50};
    const on = visited.has(s.id);
    return `<g class="myk-pin${on?' on':''}" data-spot="${s.id}" transform="translate(${q.x},${q.y})">
      <circle r="2.4" fill="${on?'#ffcc4d':'#fff'}" stroke="${on?'#b8860b':'#2e5238'}" stroke-width="0.9"/>
      <text x="3.2" y="1.5" font-size="3.4" fill="#22324b" font-weight="700" paint-order="stroke" stroke="#fff" stroke-width="0.9px">${esc(s.ic)} ${esc(s.name)}</text>
    </g>`;
  }).join('');
  const custom = is.miyakePlaces.map((p,i) =>
    `<g class="myk-pin on custom" data-custom="${i}" transform="translate(${p.x},${p.y})">
      <circle r="2.4" fill="#4fd1c5" stroke="#1b6b63" stroke-width="0.9"/>
      <text x="3.2" y="1.5" font-size="3.4" fill="#22324b" font-weight="700" paint-order="stroke" stroke="#fff" stroke-width="0.9px">📍 ${esc(p.name)}</text>
    </g>`).join('');
  const visitedList = spots.filter(s => visited.has(s.id))
    .map(s => `<li><span class="ic">${s.ic}</span><span class="txt">${esc(s.name)}</span><span class="x" data-unvisit="${s.id}">✕</span></li>`).join('')
    + is.miyakePlaces.map((p,i) => `<li><span class="ic">📍</span><span class="txt">${esc(p.name)}</span><span class="x" data-delplace="${i}">✕</span></li>`).join('');

  return `
    <p class="myk-help">スポットをタップで「行った！」記録。地図の海をタップすると自由な場所を追加できます。</p>
    <div class="myk-map">
      <svg id="mykMap" viewBox="0 0 100 100">
        <defs>
          <radialGradient id="mykTerrain" cx="${cald.x}" cy="${cald.y}" r="55" gradientUnits="userSpaceOnUse">
            <stop offset="0%"  stop-color="#8a7350"/>
            <stop offset="30%" stop-color="#74995a"/>
            <stop offset="70%" stop-color="#a8cd86"/>
            <stop offset="100%" stop-color="#d6e7bd"/>
          </radialGradient>
          <radialGradient id="mykSea" cx="50%" cy="35%" r="75%">
            <stop offset="0%"  stop-color="#e9f7fa"/>
            <stop offset="100%" stop-color="#bfe0ea"/>
          </radialGradient>
        </defs>
        <rect x="0" y="0" width="100" height="100" fill="url(#mykSea)"/>
        <!-- 砂浜（実海岸線をわずかに拡大して縁取り） -->
        <polygon points="${contour(1.035)}" fill="#ecdfb0" opacity="0.9"/>
        <!-- 島本体（実海岸線 / OpenStreetMap・地形グラデーション） -->
        <polygon points="${islandPts}" fill="url(#mykTerrain)" stroke="#5f7e46" stroke-width="0.8" stroke-linejoin="round"/>
        <!-- 等高線（立体感） -->
        <polygon points="${contour(0.74)}" fill="none" stroke="#5f7e46" stroke-width="0.35" opacity="0.5" stroke-linejoin="round"/>
        <polygon points="${contour(0.46)}" fill="none" stroke="#43603a" stroke-width="0.35" opacity="0.55" stroke-linejoin="round"/>
        <polygon points="${contour(0.22)}" fill="none" stroke="#37502f" stroke-width="0.35" opacity="0.6" stroke-linejoin="round"/>
        <!-- 雄山カルデラ（山頂・噴火口） -->
        <circle cx="${cald.x}" cy="${cald.y}" r="6.4" fill="#9c8262" stroke="#705a3e" stroke-width="0.7"/>
        <circle cx="${cald.x}" cy="${cald.y}" r="3.6" fill="#5f4a30" stroke="#43321f" stroke-width="0.6"/>
        ${pins}
        ${custom}
      </svg>
    </div>
    <h3 class="myk-h">✅ 行った場所（${visited.size + is.miyakePlaces.length}）</h3>
    ${(visited.size + is.miyakePlaces.length)
      ? `<ul class="list myk-list">${visitedList}</ul>`
      : `<p class="empty">まだ記録がありません。地図のスポットをタップ！</p>`}
  `;
}

function wireMap(is){
  const svg = document.querySelector('#mykMap');
  if (!svg) return;
  // スポットのトグル
  svg.querySelectorAll('.myk-pin[data-spot]').forEach(g => {
    g.addEventListener('click', ev => {
      ev.stopPropagation();
      const id = g.dataset.spot;
      const set = new Set(is.miyakeVisited);
      set.has(id) ? set.delete(id) : set.add(id);
      is.miyakeVisited = [...set];
      saveIslands();
      const s = mykSpots().find(x => x.id === id) || {name:id};
      toast(set.has(id) ? `「${s.name}」を記録しました` : `「${s.name}」を取消しました`);
      refresh(is);
    });
  });
  // 海（地図の空き）をタップ → 自由スポット追加
  svg.addEventListener('click', ev => {
    if (ev.target.closest('.myk-pin')) return;
    const r = svg.getBoundingClientRect();
    const x = +(( (ev.clientX - r.left) / r.width ) * 100).toFixed(1);
    const y = +(( (ev.clientY - r.top ) / r.height) * 100).toFixed(1);
    modalForm('行った場所を追加', [
      { name:'name', label:'場所の名前', ph:'例：温泉、ビーチ、展望台…' }
    ], v => {
      if (!v.name) return false;
      is.miyakePlaces.push({ name:v.name, x, y });
      saveIslands(); toast('場所を追加しました'); refresh(is);
    });
  });
  // 削除
  document.querySelectorAll('#mykPanel [data-unvisit]').forEach(b =>
    b.addEventListener('click', () => {
      is.miyakeVisited = is.miyakeVisited.filter(id => id !== b.dataset.unvisit);
      saveIslands(); refresh(is);
    }));
  document.querySelectorAll('#mykPanel [data-delplace]').forEach(b =>
    b.addEventListener('click', () => {
      is.miyakePlaces.splice(+b.dataset.delplace, 1);
      saveIslands(); refresh(is);
    }));
}

/* ---------- ② キャンプ場 ---------- */
function campHTML(){
  const cards = MIYAKE_INFO.campsites.map(c => `
    <div class="myk-card">
      <div class="myk-card-h">⛺ ${esc(c.name)}</div>
      <div class="myk-card-area">📍 ${esc(c.area)}</div>
      <div class="myk-fac">${c.facilities.map(f => `<span class="myk-chip">${esc(f)}</span>`).join('')}</div>
      <p class="myk-card-note">${esc(c.note)}</p>
      ${c.tel ? `<a class="myk-tel" href="tel:${esc(c.tel.replace(/[^0-9]/g,''))}">📞 ${esc(c.tel)}</a>` : ''}
    </div>`).join('');
  return `<p class="myk-help">設備・受付可否は変わることがあります。予約時にご確認ください。</p>${cards}`;
}

/* ---------- ③ 交通（バス時刻表＋電話） ---------- */
function trafficHTML(){
  const b = MIYAKE_INFO.bus;
  const buses = b.lines.map(l => `
    <div class="myk-bus">
      <div class="myk-bus-r">🚏 ${esc(l.route)}</div>
      <div class="myk-bus-t">${l.times.map(t => `<span>${esc(t)}</span>`).join('')}</div>
    </div>`).join('');
  const phones = MIYAKE_INFO.phones.map(p => `
    <a class="myk-tel row" href="tel:${esc(p.tel.replace(/[^0-9]/g,''))}">
      <span class="myk-chip mini">${esc(p.tag)}</span>
      <span class="myk-tel-l">${esc(p.label)}</span>
      <span class="myk-tel-n">📞 ${esc(p.tel)}</span>
    </a>`).join('');
  return `
    <h3 class="myk-h">🚌 ${esc(b.name)}</h3>
    <p class="myk-help">${esc(b.note)} 時刻は代表例です。最新の村営バス時刻表をご確認ください。</p>
    ${buses}
    <h3 class="myk-h" style="margin-top:20px">📞 交通機関・連絡先（要確認）</h3>
    <div class="myk-phones">${phones}</div>
  `;
}

/* ---------- 記録（写真・旅日記。app.js の部品を再利用） ---------- */
function recordHTML(is){
  return `
    ${section('photos','📷 写真', photosBlock(is))}
    ${section('logs','📖 旅日記', listLogs(is))}
  `;
}
async function wireRecord(is){
  // 写真の遅延読み込み
  const body = document.querySelector('#pBody');
  for (const pid of is.photos){
    const blob = await PhotoDB.get(pid);
    const img = body.querySelector(`img[data-pid="${pid}"]`);
    if (img && blob) img.src = URL.createObjectURL(blob);
  }
  bindBody(is); // 写真/旅日記の追加・削除を配線
}

/* ---------- 再描画（スクロール位置とタブを保ったまま） ---------- */
async function refresh(is){
  const body = document.querySelector('#pBody');
  const top = body ? body.scrollTop : 0;
  await window.renderMiyakeBody(is);
  const b2 = document.querySelector('#pBody');
  if (b2) b2.scrollTop = top;
}
