// ===== アルバム（LINE風）・動画・ドキュメント =====
// 📸 アルバム: アルバムを作成 → 一覧（カード） → 開くと写真・動画のグリッド → タップで拡大/再生。
//   追加は「＋追加」（複数選択OK）と PC のドラッグ&ドロップに対応。
// 📁 ドキュメント: PDF・Word・Excel などのファイルを貼って一覧・閲覧・DLできるページ。
// app.js のグローバル（STATE, PhotoDB, MediaDB, FileDB, makeZip, modalForm,
// saveIslands, islandById, toast, esc）を利用する。
'use strict';
(function(){

const $ = s => document.querySelector(s);
const uid = p => p + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
const fmtSize = n => n >= 1048576 ? (n/1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(n/1024)) + 'KB';
const fmtDate = iso => (iso || '').slice(0, 10).replace(/-/g, '/');
const EXT = { 'image/jpeg':'.jpg', 'image/png':'.png', 'image/gif':'.gif', 'image/webp':'.webp',
  'video/mp4':'.mp4', 'video/quicktime':'.mov', 'video/webm':'.webm' };
const extOf = mime => EXT[mime] || '';

/* ---------- メタ情報（localStorage。blobはIndexedDB） ---------- */
const ALBUMS_KEY = 'island-camp/albums-v1';
const DOCS_KEY   = 'island-camp/docs-v1';
function loadJSON(key){ try { return JSON.parse(localStorage.getItem(key)) || []; } catch(e){ return []; } }
function saveJSON(key, v){ try { localStorage.setItem(key, JSON.stringify(v)); } catch(e){ toast('保存に失敗しました（容量超過の可能性）'); } }
let albums = loadJSON(ALBUMS_KEY);
let docs   = loadJSON(DOCS_KEY);
const saveAlbums = () => saveJSON(ALBUMS_KEY, albums);
const saveDocs   = () => saveJSON(DOCS_KEY, docs);
// バックアップ入出力（app.js）から使う
window.Albums = { list: () => albums, replace: v => { albums = Array.isArray(v) ? v : []; saveAlbums(); } };
window.Docs   = { list: () => docs,   replace: v => { docs = Array.isArray(v) ? v : []; saveDocs(); } };

/* ---------- サムネイル生成（グリッド表示を軽くする） ---------- */
function loadImage(url){
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
}
async function imgThumb(blob, max = 480){
  const url = URL.createObjectURL(blob);
  try {
    const im = await loadImage(url);
    const k = max / Math.max(im.naturalWidth, im.naturalHeight);
    if (k >= 1) return null; // 元が小さければサムネ不要
    const cv = document.createElement('canvas');
    cv.width = Math.round(im.naturalWidth * k); cv.height = Math.round(im.naturalHeight * k);
    cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
    return await new Promise(res => cv.toBlob(res, 'image/jpeg', 0.82));
  } catch(e){ return null; }
  finally { URL.revokeObjectURL(url); }
}
async function videoThumb(blob, max = 480){
  const url = URL.createObjectURL(blob);
  const v = document.createElement('video');
  try {
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
    await new Promise((res, rej) => {
      v.onloadeddata = res; v.onerror = rej; setTimeout(rej, 8000);
    });
    try {
      v.currentTime = Math.min(0.5, (v.duration || 1) / 2);
      await new Promise(res => { v.onseeked = res; setTimeout(res, 1500); });
    } catch(e){}
    const w = v.videoWidth || 320, h = v.videoHeight || 240;
    const k = Math.min(1, max / Math.max(w, h));
    const cv = document.createElement('canvas');
    cv.width = Math.round(w * k) || 320; cv.height = Math.round(h * k) || 240;
    cv.getContext('2d').drawImage(v, 0, 0, cv.width, cv.height);
    return await new Promise(res => cv.toBlob(res, 'image/jpeg', 0.8));
  } catch(e){ return null; }
  finally { v.removeAttribute('src'); URL.revokeObjectURL(url); }
}

/* ---------- 画面状態 ---------- */
// view: 'home'（アルバム一覧） | 'detail'（アルバムの中身）
// homeView: 'albums'（LINE風アルバム一覧） | 'years'（年別）
// kind: 'album'（マイアルバム） | 'island'（島の写真）
const HOMEVIEW_KEY = 'island-camp/albumview';
const UI = { view: 'home', homeView: localStorage.getItem(HOMEVIEW_KEY) || 'albums',
  kind: null, cur: null, sel: new Set(), selMode: false, urls: new Set() };
function objURL(blob){ const u = URL.createObjectURL(blob); UI.urls.add(u); return u; }
function revokeAll(){ for (const u of UI.urls) URL.revokeObjectURL(u); UI.urls.clear(); }
const curAlbum = () => albums.find(a => a.id === UI.cur);

/* ---------- アルバム一覧（ホーム） ---------- */
async function openAlbums(){
  $('#album').classList.remove('hidden');
  await renderHome();
}
function closeAlbums(){
  revokeAll();
  hideSheet();
  $('#album').classList.add('hidden');
}
async function renderHome(){
  UI.view = 'home'; UI.kind = null; UI.cur = null; UI.sel.clear(); UI.selMode = false;
  hideSheet();
  revokeAll();
  $('#albumHome').classList.remove('hidden');
  $('#albumDetail').classList.add('hidden');
  // 表示切替タブと選択ボタンの状態
  document.querySelectorAll('#albumViewSwitch button').forEach(b =>
    b.classList.toggle('on', b.dataset.v === UI.homeView));
  $('#homeSelBtn').classList.toggle('hidden', UI.homeView !== 'years');
  updateHomeSelBar();
  if (UI.homeView === 'years'){ await renderHomeYears(); return; }
  const body = $('#albumHomeBody');
  let html = `<div class="alb-grid">`;
  html += `<div class="alb-card new" id="albNew"><div class="alb-cover">＋</div>
    <div class="alb-info"><div class="alb-name">新しいアルバム</div><div class="alb-meta">写真・動画をまとめる</div></div></div>`;
  for (const al of albums){
    const vids = al.items.filter(i => i.type === 'video').length;
    const cover = al.items.length ? al.items[al.items.length - 1] : null;
    html += `<div class="alb-card" data-al="${al.id}">
      <div class="alb-cover"${cover ? ` data-cover="${cover.id}" data-ctype="${cover.type}"` : ''}>📷</div>
      <div class="alb-info"><div class="alb-name">${esc(al.name)}</div>
      <div class="alb-meta">${al.items.length}件${vids ? `・🎬${vids}` : ''}・${fmtDate(al.updated || al.created)}</div></div></div>`;
  }
  html += `</div>`;
  const isles = STATE.islands.filter(i => (i.photos || []).length);
  if (isles.length){
    html += `<div class="alb-sec-h">🏝 島の写真</div><div class="alb-grid">`;
    for (const is of isles){
      html += `<div class="alb-card" data-isl="${is.id}">
        <div class="alb-cover" data-cover="${is.photos[is.photos.length - 1]}" data-ctype="image">🏝</div>
        <div class="alb-info"><div class="alb-name">${esc(is.name)}</div><div class="alb-meta">${is.photos.length}枚</div></div></div>`;
    }
    html += `</div>`;
  }
  if (!albums.length && !isles.length){
    html += `<div class="album-empty">まだアルバムがありません。<br>「＋新しいアルバム」から作成して、写真や動画をまとめて入れられます。</div>`;
  }
  body.innerHTML = html;
  body.querySelector('#albNew')?.addEventListener('click', createAlbum);
  body.querySelectorAll('[data-al]').forEach(c => c.addEventListener('click', () => openDetail('album', c.dataset.al)));
  body.querySelectorAll('[data-isl]').forEach(c => c.addEventListener('click', () => openDetail('island', c.dataset.isl)));
  // カバー画像の遅延読み込み（サムネ優先）
  for (const el of body.querySelectorAll('[data-cover]')){
    const id = el.dataset.cover;
    const blob = (await MediaDB.get(id + '_t')) || (await MediaDB.get(id)) || (await PhotoDB.get(id));
    if (blob && blob.type && blob.type.startsWith('video/')){
      el.innerHTML = `<video src="${objURL(blob)}" muted playsinline preload="metadata"></video><span class="vd">▶</span>`;
    } else if (blob){
      el.innerHTML = `<img src="${objURL(blob)}" alt="" loading="lazy">`;
    }
  }
}
function createAlbum(){
  modalForm('新しいアルバム', [
    { name:'name', label:'アルバムの名前', ph:'例：2026 三宅島キャンプ' }
  ], v => {
    if (!v.name) return false;
    const al = { id: uid('al'), name: v.name, created: new Date().toISOString(), updated: new Date().toISOString(), items: [] };
    albums.unshift(al);
    saveAlbums();
    openDetail('album', al.id);
  });
}

/* ---------- サムネの遅延読み込み（グリッド共通） ---------- */
async function fillThumb(ph){
  const id = ph.dataset.id;
  const thumb = await MediaDB.get(id + '_t');
  const blob = thumb || (await MediaDB.get(id)) || (await PhotoDB.get(id));
  if (!blob) return;
  const el = document.createElement(blob.type && blob.type.startsWith('video/') ? 'video' : 'img');
  if (el.tagName === 'VIDEO'){ el.muted = true; el.playsInline = true; el.preload = 'metadata'; }
  else { el.alt = ''; el.loading = 'lazy'; }
  el.src = objURL(blob);
  ph.prepend(el);
}

/* ---------- 年別ビュー（アルバム＋島の写真を横断して年ごとに） ---------- */
function tsFromId(pid){
  const m = /^(?:ph|im|vd)_(\d{10,})/.exec(pid);
  return m ? new Date(+m[1]).toISOString() : null;
}
function allMediaItems(){
  const out = [];
  for (const al of albums)
    for (const it of al.items)
      out.push({ id: it.id, type: it.type, name: it.name, date: it.added || tsFromId(it.id),
        cap: `📁 ${al.name}`, src: 'album', albumId: al.id });
  for (const is of STATE.islands)
    for (const pid of (is.photos || []))
      out.push({ id: pid, type: 'image', name: pid, date: tsFromId(pid),
        cap: `🏝 ${is.name}`, src: 'island', islandId: is.id });
  return out;
}
let YEAR_ITEMS = {}; // year -> items（描画中の年別リスト）
async function renderHomeYears(){
  const body = $('#albumHomeBody');
  const items = allMediaItems();
  if (!items.length){
    body.innerHTML = `<div class="album-empty">まだ写真・動画がありません。<br>アルバムや島の写真に追加すると、ここに年ごとに並びます。</div>`;
    return;
  }
  const byYear = new Map();
  for (const it of items){
    const y = it.date ? it.date.slice(0, 4) : '年不明';
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(it);
  }
  const years = [...byYear.keys()].sort((a, b) => b.localeCompare(a)); // 新しい年から
  YEAR_ITEMS = {};
  let html = '';
  for (const y of years){
    const arr = byYear.get(y).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    YEAR_ITEMS[y] = arr;
    const vids = arr.filter(i => i.type === 'video').length;
    html += `<div class="yr-sec">
      <div class="yr-h"><span class="y">${esc(y)}${/^\d+$/.test(y) ? '年' : ''}</span>
        <span class="n">${arr.length}件${vids ? `・🎬${vids}` : ''}</span><span class="ln"></span>
        <button class="btn mini" data-ysel="${esc(y)}">この年を選択</button>
        <button class="btn mini" data-ydl="${esc(y)}">⬇ この年をDL</button></div>
      <div class="album-grid">${arr.map(it =>
        `<div class="album-ph" data-id="${it.id}" data-y="${esc(y)}" data-type="${it.type}">
          <span class="ck">✓</span>${it.type === 'video' ? '<span class="vd">▶ 動画</span>' : ''}
        </div>`).join('')}</div></div>`;
  }
  body.innerHTML = html;
  // タップ: 選択モードならトグル / 通常はビューア
  body.querySelectorAll('.album-ph').forEach(ph => {
    ph.addEventListener('click', () => {
      if (UI.selMode){ toggleHomeSel(ph); return; }
      const y = ph.dataset.y, arr = YEAR_ITEMS[y];
      openViewer(arr, arr.findIndex(x => x.id === ph.dataset.id), `📅 ${y}${/^\d+$/.test(y) ? '年' : ''}`);
    });
  });
  // この年を選択 / この年をDL
  body.querySelectorAll('[data-ysel]').forEach(b => b.addEventListener('click', () => {
    UI.selMode = true;
    for (const it of YEAR_ITEMS[b.dataset.ysel]) UI.sel.add(it.id);
    body.querySelectorAll('.album-ph').forEach(p => p.classList.toggle('sel', UI.sel.has(p.dataset.id)));
    updateHomeSelBar();
  }));
  body.querySelectorAll('[data-ydl]').forEach(b => b.addEventListener('click', () =>
    dlItems(YEAR_ITEMS[b.dataset.ydl], `island-camp-${b.dataset.ydl}`)));
  // サムネ読み込み
  for (const ph of body.querySelectorAll('.album-ph')) await fillThumb(ph);
}
function toggleHomeSel(ph){
  const id = ph.dataset.id;
  UI.sel.has(id) ? UI.sel.delete(id) : UI.sel.add(id);
  ph.classList.toggle('sel', UI.sel.has(id));
  updateHomeSelBar();
}
function updateHomeSelBar(){
  $('#albumHome').classList.toggle('selmode', UI.selMode && UI.homeView === 'years');
  $('#homeSelBar').classList.toggle('hidden', !(UI.selMode && UI.homeView === 'years'));
  $('#homeSelBtn').textContent = UI.selMode ? 'キャンセル' : '選択';
  $('#hSelCount').textContent = `${UI.sel.size}件を選択中`;
  const all = document.querySelectorAll('#albumHomeBody .album-ph');
  $('#hSelAll').textContent = (UI.sel.size && UI.sel.size === all.length) ? '全解除' : '全選択';
}
function selectedYearItems(){
  const out = [];
  for (const arr of Object.values(YEAR_ITEMS))
    for (const it of arr) if (UI.sel.has(it.id)) out.push(it);
  return out;
}
async function delYearSelected(){
  const items = selectedYearItems();
  if (!items.length){ toast('削除するものを選択してください'); return; }
  if (!confirm(`選択した${items.length}件を削除します。アルバム・島の写真からも消えます。よろしいですか？`)) return;
  for (const it of items){
    if (it.src === 'album'){
      const al = albums.find(a => a.id === it.albumId);
      if (al){ al.items = al.items.filter(x => x.id !== it.id); al.updated = new Date().toISOString(); }
      MediaDB.del(it.id); MediaDB.del(it.id + '_t');
    } else {
      const is = islandById(it.islandId);
      if (is) is.photos = is.photos.filter(p => p !== it.id);
      PhotoDB.del(it.id);
    }
  }
  saveAlbums(); saveIslands();
  UI.sel.clear(); UI.selMode = false;
  toast('削除しました');
  await renderHome();
}

/* ---------- アルバム詳細（写真・動画グリッド） ---------- */
async function openDetail(kind, id){
  UI.view = 'detail'; UI.kind = kind; UI.cur = id; UI.sel.clear(); UI.selMode = false;
  $('#albumHome').classList.add('hidden');
  $('#albumDetail').classList.remove('hidden');
  $('#albumMenuBtn').classList.toggle('hidden', kind !== 'album');
  $('#mediaInput').accept = kind === 'album' ? 'image/*,video/*' : 'image/*';
  await renderDetail();
}
function detailItems(){
  if (UI.kind === 'album'){
    const al = curAlbum();
    return al ? al.items.slice().reverse() : []; // 新しい順
  }
  const is = islandById(UI.cur);
  return is ? is.photos.map(pid => ({ id: pid, type: 'image', name: pid })).slice().reverse() : [];
}
function detailTitle(){
  if (UI.kind === 'album') return curAlbum()?.name || 'アルバム';
  return `🏝 ${islandById(UI.cur)?.name || ''}の写真`;
}
async function renderDetail(){
  hideSheet();
  revokeAll();
  const items = detailItems();
  $('#albumDetailName').innerHTML = `${esc(detailTitle())} <span>${items.length}件</span>`;
  updateSelBar();
  const body = $('#albumDetailBody');
  if (!items.length){
    body.innerHTML = `<div class="album-empty">まだ何もありません。<br>「＋追加」から写真${UI.kind==='album' ? '・動画' : ''}をまとめて選べます。<br>PCならこの画面にドラッグ&ドロップでもOK。</div>`;
    return;
  }
  body.innerHTML = `<div class="album-grid">` + items.map(it =>
    `<div class="album-ph" data-id="${it.id}" data-type="${it.type}">
      <span class="ck">✓</span>${it.type === 'video' ? '<span class="vd">▶ 動画</span>' : ''}
    </div>`).join('') + `</div>`;
  body.querySelectorAll('.album-ph').forEach(ph => {
    ph.addEventListener('click', () => {
      if (UI.selMode){ toggleSel(ph); return; }
      const list = detailItems();
      openViewer(list, list.findIndex(x => x.id === ph.dataset.id), detailTitle());
    });
  });
  // サムネの遅延読み込み
  for (const ph of body.querySelectorAll('.album-ph')) await fillThumb(ph);
}

/* ---------- 追加（複数選択・ドラッグ&ドロップ共通） ---------- */
async function addFiles(files){
  const isAlbum = UI.kind === 'album';
  const list = [...files].filter(f =>
    f.type.startsWith('image/') || (isAlbum && f.type.startsWith('video/')));
  if (!list.length){ toast(isAlbum ? '画像・動画ファイルを選んでください' : '画像ファイルを選んでください'); return; }
  toast(`${list.length}件を追加中…`);
  let done = 0;
  if (isAlbum){
    const al = curAlbum();
    if (!al) return;
    for (const f of list){
      const type = f.type.startsWith('video/') ? 'video' : 'image';
      const id = uid(type === 'video' ? 'vd' : 'im');
      try {
        await MediaDB.put(id, f);
        const th = type === 'video' ? await videoThumb(f) : await imgThumb(f);
        if (th) await MediaDB.put(id + '_t', th);
        al.items.push({ id, type, name: f.name || id, size: f.size || 0, added: new Date().toISOString() });
        done++;
      } catch(e){}
    }
    al.updated = new Date().toISOString();
    saveAlbums();
  } else {
    const is = islandById(UI.cur);
    if (!is) return;
    for (const f of list){
      if (!f.type.startsWith('image/')) continue;
      const pid = uid('ph');
      try { await PhotoDB.put(pid, f); is.photos.push(pid); done++; } catch(e){}
    }
    saveIslands();
  }
  toast(done ? `${done}件を追加しました` : '追加に失敗しました');
  await renderDetail();
}

/* ---------- 選択モード（まとめてDL・削除） ---------- */
function updateSelBar(){
  $('#albumDetail').classList.toggle('selmode', UI.selMode);
  $('#albumSelBar').classList.toggle('hidden', !UI.selMode);
  $('#albumSelBtn').textContent = UI.selMode ? 'キャンセル' : '選択';
  $('#selCount').textContent = `${UI.sel.size}件を選択中`;
  const all = document.querySelectorAll('#albumDetailBody .album-ph');
  $('#selAll').textContent = (UI.sel.size && UI.sel.size === all.length) ? '全解除' : '全選択';
}
function toggleSel(ph){
  const id = ph.dataset.id;
  UI.sel.has(id) ? UI.sel.delete(id) : UI.sel.add(id);
  ph.classList.toggle('sel', UI.sel.has(id));
  updateSelBar();
}
// 任意のアイテム集合をZIPでDL（アルバム内・年別・選択のすべてで共用）
async function dlItems(items, base){
  if (!items || !items.length){ toast('ダウンロードするものがありません'); return; }
  toast('ZIPを作成中…');
  const files = [];
  const counters = {};
  for (const it of items){
    const blob = (await MediaDB.get(it.id)) || (await PhotoDB.get(it.id));
    if (!blob) continue;
    // フォルダ分け: 年別DLでは「出どころ（アルバム名/島名）」ごとにまとめる
    const folder = it.cap ? it.cap.replace(/^[📁🏝]\s*/, '').replace(/[\\/:*?"<>|]/g, '') : '';
    counters[folder] = (counters[folder] || 0) + 1;
    const nm = it.name && it.name.includes('.') ? it.name
      : `${String(counters[folder]).padStart(3, '0')}${extOf(blob.type) || '.jpg'}`;
    files.push({ name: folder ? `${folder}/${nm}` : nm, blob });
  }
  if (!files.length){ toast('ダウンロードできるファイルがありません'); return; }
  const zip = await makeZip(files);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(zip);
  a.download = `${base}-${new Date().toISOString().slice(0, 10)}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  toast(`${files.length}件をZIPでダウンロードしました`);
}
async function dlSelected(){
  const base = (detailTitle().replace(/[🏝\s]/g, '') || 'album');
  const items = detailItems().filter(it => !UI.sel.size || UI.sel.has(it.id))
    .map(it => ({ ...it, cap: '' }));
  await dlItems(items, base);
}
async function delSelected(){
  if (!UI.sel.size){ toast('削除するものを選択してください'); return; }
  if (!confirm(`選択した${UI.sel.size}件を削除します。よろしいですか？`)) return;
  if (UI.kind === 'album'){
    const al = curAlbum();
    al.items = al.items.filter(it => {
      if (!UI.sel.has(it.id)) return true;
      MediaDB.del(it.id); MediaDB.del(it.id + '_t');
      return false;
    });
    al.updated = new Date().toISOString();
    saveAlbums();
  } else {
    const is = islandById(UI.cur);
    is.photos = is.photos.filter(pid => {
      if (!UI.sel.has(pid)) return true;
      PhotoDB.del(pid);
      return false;
    });
    saveIslands();
  }
  UI.sel.clear(); UI.selMode = false;
  toast('削除しました');
  await renderDetail();
}

/* ---------- アルバムのメニュー（名前変更・削除） ---------- */
function hideSheet(){ $('#albumSheet')?.classList.add('hidden'); }
function showSheet(){
  const sh = $('#albumSheet');
  sh.classList.toggle('hidden');
}
function renameAlbum(){
  hideSheet();
  const al = curAlbum();
  if (!al) return;
  modalForm('アルバム名を変更', [
    { name:'name', label:'アルバムの名前', value: al.name }
  ], v => {
    if (!v.name) return false;
    al.name = v.name;
    al.updated = new Date().toISOString();
    saveAlbums();
    renderDetail();
  });
}
async function deleteAlbum(){
  hideSheet();
  const al = curAlbum();
  if (!al) return;
  if (!confirm(`アルバム「${al.name}」を削除します。中の写真・動画（${al.items.length}件）も消えます。よろしいですか？`)) return;
  for (const it of al.items){ MediaDB.del(it.id); MediaDB.del(it.id + '_t'); }
  albums = albums.filter(a => a.id !== al.id);
  saveAlbums();
  toast('アルバムを削除しました');
  await renderHome();
}

/* ---------- ビューア（拡大表示・動画再生・前後送り） ---------- */
const VIEWER = { list: [], idx: 0, cap: '', src: null };
async function openViewer(list, idx, cap){
  if (!list.length) return;
  VIEWER.list = list; VIEWER.idx = Math.max(0, idx); VIEWER.cap = cap || '';
  $('#lightbox').classList.remove('hidden');
  await showViewer();
}
function closeViewer(){
  $('#lightbox').classList.add('hidden');
  $('#lbStage').innerHTML = '';
  if (VIEWER.src){ URL.revokeObjectURL(VIEWER.src); VIEWER.src = null; }
}
async function showViewer(){
  const it = VIEWER.list[VIEWER.idx];
  if (!it) return;
  const stage = $('#lbStage');
  stage.innerHTML = '<span class="lb-loading">読み込み中…</span>';
  const blob = (await MediaDB.get(it.id)) || (await PhotoDB.get(it.id));
  if (VIEWER.src){ URL.revokeObjectURL(VIEWER.src); VIEWER.src = null; }
  if (!blob){ stage.innerHTML = '<span class="lb-loading">読み込めませんでした</span>'; return; }
  VIEWER.src = URL.createObjectURL(blob);
  if (it.type === 'video' || (blob.type && blob.type.startsWith('video/'))){
    stage.innerHTML = `<video src="${VIEWER.src}" controls autoplay playsinline></video>`;
  } else {
    stage.innerHTML = `<img src="${VIEWER.src}" alt="">`;
  }
  $('#lbCap').textContent = `${it.cap || VIEWER.cap}（${VIEWER.idx + 1}/${VIEWER.list.length}）`;
  const dl = $('#lbDl');
  dl.href = VIEWER.src;
  dl.download = it.name && it.name.includes('.') ? it.name : (it.name || 'media') + (extOf(blob.type) || '.jpg');
  $('#lbPrev').classList.toggle('off', VIEWER.idx <= 0);
  $('#lbNext').classList.toggle('off', VIEWER.idx >= VIEWER.list.length - 1);
}
function stepViewer(d){
  const ni = VIEWER.idx + d;
  if (ni < 0 || ni >= VIEWER.list.length) return;
  VIEWER.idx = ni;
  showViewer();
}

/* ---------- 島の写真タブ → タップで拡大（ビューア） ---------- */
document.addEventListener('click', e => {
  const img = e.target.closest('#pBody .gallery .ph img');
  if (!img) return;
  const is = islandById(STATE.activeId);
  if (!is) return;
  const items = is.photos.map(pid => ({ id: pid, type: 'image', name: pid }));
  openViewer(items, is.photos.indexOf(img.dataset.pid), `🏝 ${is.name}`);
});

/* ---------- ドキュメント（PDF・Word・Excel など） ---------- */
function docIcon(type, name){
  const n = (name || '').toLowerCase();
  const t = type || '';
  if (t === 'application/pdf' || n.endsWith('.pdf')) return '📕';
  if (/sheet|excel/.test(t) || /\.(xlsx?|csv)$/.test(n)) return '📊';
  if (/word/.test(t) || /\.docx?$/.test(n)) return '📘';
  if (/presentation|powerpoint/.test(t) || /\.pptx?$/.test(n)) return '📙';
  if (t.startsWith('text/') || /\.(txt|md)$/.test(n)) return '📄';
  if (t.startsWith('image/')) return '🖼';
  return '📎';
}
function openDocs(){
  $('#docs').classList.remove('hidden');
  renderDocs();
}
function renderDocs(){
  const body = $('#docsBody');
  $('#docsCount').textContent = docs.length ? `${docs.length}件` : '';
  if (!docs.length){
    body.innerHTML = `<div class="album-empty">まだドキュメントがありません。<br>「＋追加」またはPCからのドラッグ&ドロップで貼れます。<br>PDF・Word・Excel・PowerPoint・テキストなどOK。</div>`;
    return;
  }
  body.innerHTML = `<div class="doc-list">` + docs.slice().reverse().map(d => `
    <div class="doc-item" data-id="${d.id}">
      <span class="doc-ic">${docIcon(d.type, d.name)}</span>
      <span class="doc-nm">${esc(d.name)}<span class="doc-meta">${fmtSize(d.size || 0)}・${fmtDate(d.added)}</span></span>
      <span class="doc-act">
        <button title="ダウンロード" data-dl="${d.id}">⬇</button>
        <button title="削除" data-del="${d.id}">✕</button>
      </span>
    </div>`).join('') + `</div>`;
  body.querySelectorAll('.doc-item').forEach(el => el.addEventListener('click', ev => {
    if (ev.target.closest('.doc-act')) return;
    openDocFile(el.dataset.id);
  }));
  body.querySelectorAll('[data-dl]').forEach(b => b.addEventListener('click', () => dlDocFile(b.dataset.dl)));
  body.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => delDocFile(b.dataset.del)));
}
async function docBlob(id){
  const d = docs.find(x => x.id === id);
  let blob = await FileDB.get(id);
  if (blob && d && !blob.type) blob = new Blob([blob], { type: d.type || 'application/octet-stream' });
  return blob;
}
async function openDocFile(id){
  const blob = await docBlob(id);
  if (!blob){ toast('ファイルを読み込めませんでした'); return; }
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
  if (!w) dlDocFile(id); // ポップアップ不可ならDLにフォールバック
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
async function dlDocFile(id){
  const d = docs.find(x => x.id === id);
  const blob = await docBlob(id);
  if (!blob){ toast('ファイルを読み込めませんでした'); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = d ? d.name : 'document';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}
async function delDocFile(id){
  const d = docs.find(x => x.id === id);
  if (!d) return;
  if (!confirm(`「${d.name}」を削除しますか？`)) return;
  await FileDB.del(id).catch(() => {});
  docs = docs.filter(x => x.id !== id);
  saveDocs();
  toast('削除しました');
  renderDocs();
}
async function addDocs(files){
  const list = [...files];
  if (!list.length) return;
  toast(`${list.length}件を追加中…`);
  let done = 0;
  for (const f of list){
    const id = uid('doc');
    try {
      await FileDB.put(id, f);
      docs.push({ id, name: f.name || id, type: f.type || '', size: f.size || 0, added: new Date().toISOString() });
      done++;
    } catch(e){}
  }
  saveDocs();
  toast(done ? `${done}件を追加しました` : '追加に失敗しました');
  renderDocs();
}

/* ---------- ドラッグ&ドロップ（アルバム詳細・ドキュメント） ---------- */
function wireDrop(el, onFiles, canDrop){
  let depth = 0;
  el.addEventListener('dragenter', e => {
    if (!canDrop() || !e.dataTransfer) return;
    e.preventDefault(); depth++;
    el.classList.add('dragging');
  });
  el.addEventListener('dragover', e => {
    if (!canDrop()) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  el.addEventListener('dragleave', () => {
    if (--depth <= 0){ depth = 0; el.classList.remove('dragging'); }
  });
  el.addEventListener('drop', e => {
    e.preventDefault(); depth = 0;
    el.classList.remove('dragging');
    if (!canDrop()) return;
    if (e.dataTransfer?.files?.length) onFiles(e.dataTransfer.files);
  });
}
wireDrop($('#album'), f => addFiles(f), () => UI.view === 'detail');
wireDrop($('#docs'), f => addDocs(f), () => true);

/* ---------- UI配線 ---------- */
$('#albumBtn').onclick = openAlbums;
$('#albumClose').onclick = closeAlbums;
$('#albumBack').onclick = renderHome;
$('#albumAddBtn').onclick = () => $('#mediaInput').click();
$('#mediaInput').onchange = e => { if (e.target.files.length) addFiles(e.target.files); e.target.value = ''; };
$('#albumSelBtn').onclick = () => {
  UI.selMode = !UI.selMode;
  if (!UI.selMode){
    UI.sel.clear();
    document.querySelectorAll('#albumDetailBody .album-ph.sel').forEach(p => p.classList.remove('sel'));
  }
  updateSelBar();
};
$('#selAll').onclick = () => {
  const all = [...document.querySelectorAll('#albumDetailBody .album-ph')];
  if (UI.sel.size === all.length){ UI.sel.clear(); all.forEach(p => p.classList.remove('sel')); }
  else { all.forEach(p => { UI.sel.add(p.dataset.id); p.classList.add('sel'); }); }
  updateSelBar();
};
$('#selDl').onclick = dlSelected;
$('#selDel').onclick = delSelected;
$('#albumMenuBtn').onclick = showSheet;
$('#sheetRename').onclick = renameAlbum;
$('#sheetDelete').onclick = deleteAlbum;
$('#sheetDlAll').onclick = () => { hideSheet(); UI.sel.clear(); dlSelected(); };

// 表示切替（アルバム / 年別）と年別ビューの選択・DL・削除
document.querySelectorAll('#albumViewSwitch button').forEach(b => b.addEventListener('click', () => {
  if (UI.homeView === b.dataset.v) return;
  UI.homeView = b.dataset.v;
  try { localStorage.setItem(HOMEVIEW_KEY, UI.homeView); } catch(e){}
  UI.sel.clear(); UI.selMode = false;
  renderHome();
}));
$('#homeSelBtn').onclick = () => {
  UI.selMode = !UI.selMode;
  if (!UI.selMode){
    UI.sel.clear();
    document.querySelectorAll('#albumHomeBody .album-ph.sel').forEach(p => p.classList.remove('sel'));
  }
  updateHomeSelBar();
};
$('#hSelAll').onclick = () => {
  const all = [...document.querySelectorAll('#albumHomeBody .album-ph')];
  if (UI.sel.size === all.length){ UI.sel.clear(); all.forEach(p => p.classList.remove('sel')); }
  else { all.forEach(p => { UI.sel.add(p.dataset.id); p.classList.add('sel'); }); }
  updateHomeSelBar();
};
$('#hSelDl').onclick = () => {
  const items = selectedYearItems();
  dlItems(items.length ? items : Object.values(YEAR_ITEMS).flat(), 'island-camp-photos');
};
$('#hSelDel').onclick = delYearSelected;

$('#docsBtn').onclick = openDocs;
$('#docsClose').onclick = () => $('#docs').classList.add('hidden');
$('#docsAddBtn').onclick = () => $('#docsInput').click();
$('#docsInput').onchange = e => { if (e.target.files.length) addDocs(e.target.files); e.target.value = ''; };

$('#lbClose').onclick = closeViewer;
$('#lbPrev').onclick = () => stepViewer(-1);
$('#lbNext').onclick = () => stepViewer(1);
$('#lightbox').addEventListener('click', e => { if (e.target.id === 'lightbox') closeViewer(); });
document.addEventListener('keydown', e => {
  if ($('#lightbox').classList.contains('hidden')) return;
  if (e.key === 'Escape') closeViewer();
  if (e.key === 'ArrowLeft') stepViewer(-1);
  if (e.key === 'ArrowRight') stepViewer(1);
});
// スワイプで前後送り（携帯）
let swipeX = null;
$('#lightbox').addEventListener('touchstart', e => { swipeX = e.touches[0].clientX; }, { passive: true });
$('#lightbox').addEventListener('touchend', e => {
  if (swipeX == null) return;
  const dx = e.changedTouches[0].clientX - swipeX;
  swipeX = null;
  if (Math.abs(dx) > 48) stepViewer(dx > 0 ? -1 : 1);
}, { passive: true });

})();
