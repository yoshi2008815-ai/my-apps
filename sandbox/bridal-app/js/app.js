// app.js - UI Utilities

const App = (() => {

  // ── Avatar ──────────────────────────────────────────────
  function avatar(name, gender, size = 56) {
    const ch = name ? name.replace(/\s/g, '').charAt(0) : '?';
    const femaleColors = ['#C45C82','#E8667A','#D4709A','#CC7AB0','#E07CAC'];
    const maleColors   = ['#5B9BD5','#4A90D9','#3D7DC8','#2A6BB5','#4477BB'];
    const palette = gender === 'female' ? femaleColors : maleColors;
    const bg   = palette[Math.abs(hashStr(name)) % palette.length];
    const fg   = '#ffffff';
    const fs   = Math.round(size * 0.42);
    const svg  = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size/2}" cy="${size/2}" r="${size/2}" fill="${bg}"/><text x="${size/2}" y="${size/2 + fs*0.36}" text-anchor="middle" font-size="${fs}" font-family="'Noto Sans JP',sans-serif" fill="${fg}" font-weight="700">${ch}</text></svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function hashStr(s) {
    if (!s) return 0;
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    return h;
  }

  function avatarImg(name, gender, size = 56, cls = '') {
    return `<img src="${avatar(name, gender, size)}" width="${size}" height="${size}" alt="${name}" class="${cls}" style="border-radius:50%;flex-shrink:0;">`;
  }

  // ── Date / Age ───────────────────────────────────────────
  function age(birthdate) {
    const b = new Date(birthdate), t = new Date();
    let a = t.getFullYear() - b.getFullYear();
    if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) a--;
    return a;
  }

  function fmtDate(isoStr, opts = {}) {
    if (!isoStr) return '—';
    const d = new Date(isoStr);
    const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
    if (opts.short) return `${m}/${day}`;
    if (opts.monthDay) return `${m}月${day}日`;
    if (opts.yearMonthDay) return `${y}年${m}月${day}日`;
    return `${y}/${String(m).padStart(2,'0')}/${String(day).padStart(2,'0')}`;
  }

  function fmtDatetime(isoStr) {
    if (!isoStr) return '—';
    const d = new Date(isoStr);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000)     return 'たった今';
    if (diff < 3600000)   return `${Math.floor(diff/60000)}分前`;
    if (diff < 86400000)  return `${Math.floor(diff/3600000)}時間前`;
    if (diff < 604800000) return `${Math.floor(diff/86400000)}日前`;
    return fmtDate(isoStr, { yearMonthDay: true });
  }

  function fmtMoney(n) {
    return '¥' + Number(n).toLocaleString('ja-JP');
  }

  // ── Toast ────────────────────────────────────────────────
  function toast(msg, type = 'default', duration = 3000) {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;';
      document.body.appendChild(container);
    }
    const colors = { default:'#333', success:'#4CAF50', error:'#F44336', warning:'#FF9800', info:'#2196F3' };
    const t = document.createElement('div');
    t.style.cssText = `background:${colors[type]||colors.default};color:#fff;padding:12px 18px;border-radius:10px;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,.2);animation:slideIn .3s ease;max-width:280px;`;
    t.textContent = msg;
    container.appendChild(t);
    setTimeout(() => { t.style.opacity='0'; t.style.transform='translateX(100%)'; t.style.transition='all .3s'; setTimeout(()=>t.remove(), 300); }, duration);
  }

  // ── Modal ────────────────────────────────────────────────
  function modal(html, opts = {}) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal">${html}</div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay && !opts.persistent) close(); });
    function close() { overlay.style.animation = 'fadeOut .2s'; setTimeout(() => overlay.remove(), 200); }
    return { el: overlay, close };
  }

  // ── Loading ──────────────────────────────────────────────
  function setLoading(el, on) {
    if (on) {
      el.dataset.origText = el.innerHTML;
      el.innerHTML = '<span class="spinner" style="width:18px;height:18px;border-width:2px;display:inline-block;border-color:rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .8s linear infinite;vertical-align:middle;"></span>';
      el.disabled = true;
    } else {
      if (el.dataset.origText) el.innerHTML = el.dataset.origText;
      el.disabled = false;
    }
  }

  // ── Bottom Nav ───────────────────────────────────────────
  function initNav(activeId) {
    document.querySelectorAll('.nav-item[data-nav]').forEach(el => {
      if (el.dataset.nav === activeId) el.classList.add('active');
    });
    const unread = (Store.query('notifications', n => n.memberId === (Auth.getMemberSession()?.id) && !n.read) ?? []).length;
    const badge = document.getElementById('nav-badge-home');
    if (badge && unread > 0) { badge.textContent = unread > 9 ? '9+' : unread; badge.style.display='flex'; }
  }

  // ── Member Card HTML ─────────────────────────────────────
  function memberCard(m, opts = {}) {
    const a = age(m.birthdate);
    const tags = [m.prefecture, m.occupation].filter(Boolean);
    return `
    <div class="member-card" onclick="${opts.onclick || ''}">
      <div class="member-card-img">${avatarImg(m.name, m.gender, 80, '')}</div>
      <div class="member-card-body">
        <div class="member-card-name">${m.name}</div>
        <div class="member-card-age">${a}歳 / ${m.height}cm</div>
        <div class="member-card-meta">
          ${tags.map(t=>`<span class="member-card-tag">${t}</span>`).join('')}
        </div>
      </div>
    </div>`;
  }

  // ── Confirm Dialog ───────────────────────────────────────
  function confirm(msg, onOk, onCancel) {
    const m = modal(`
      <div class="modal-header"><h3 style="font-size:16px;">確認</h3></div>
      <div class="modal-body"><p style="font-size:14px;color:#444;">${msg}</p></div>
      <div class="modal-footer">
        <button class="btn btn-secondary btn-full" id="mCancel">キャンセル</button>
        <button class="btn btn-primary btn-full" id="mOk">OK</button>
      </div>`);
    m.el.querySelector('#mOk').addEventListener('click', () => { m.close(); if (onOk) onOk(); });
    m.el.querySelector('#mCancel').addEventListener('click', () => { m.close(); if (onCancel) onCancel(); });
  }

  // ── Gender label ─────────────────────────────────────────
  function genderLabel(g) { return g === 'female' ? '女性' : '男性'; }
  function genderIcon(g)  { return g === 'female' ? '👩' : '👨'; }

  // ── Status label ─────────────────────────────────────────
  function statusLabel(s) {
    const map = { active:'活動中', suspended:'休止中', withdrawn:'退会', pending:'審査中' };
    return map[s] ?? s;
  }

  function appStatus(s) {
    const map = { pending:'返事待ち', accepted:'OK', rejected:'NG', expired:'期限切れ' };
    return map[s] ?? s;
  }

  // ── Inject global CSS anim ────────────────────────────────
  (function injectCss() {
    if (document.getElementById('app-anim-css')) return;
    const s = document.createElement('style');
    s.id = 'app-anim-css';
    s.textContent = `@keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}} @keyframes fadeOut{to{opacity:0}} @keyframes spin{to{transform:rotate(360deg)}}`;
    document.head.appendChild(s);
  })();

  return { avatar, avatarImg, age, fmtDate, fmtDatetime, fmtMoney, toast, modal, setLoading, initNav, memberCard, confirm, genderLabel, genderIcon, statusLabel, appStatus };
})();

// Auto-init store
document.addEventListener('DOMContentLoaded', () => { Store.init(); });

// ── PWA: Service Worker registration ──────────────────────────
// Only register on http/https — file:// protocol does not support SW.
// GitHub Pages 対応：ルート(/) でも サブパス(/<repo>/) でも動くよう、
// 現在ページから見たアプリ基底URLを算出して登録する。
if ('serviceWorker' in navigator && (location.protocol === 'http:' || location.protocol === 'https:')) {
  window.addEventListener('load', () => {
    // 末尾セグメントが /member/ または /admin/ ならその親ディレクトリ、
    // それ以外はカレントディレクトリをアプリ基底とする。
    const path = location.pathname;
    const segs = path.replace(/\/$/, '').split('/');
    segs.pop(); // ファイル名
    let baseSegs = segs;
    if (baseSegs[baseSegs.length - 1] === 'member' || baseSegs[baseSegs.length - 1] === 'admin') {
      baseSegs = baseSegs.slice(0, -1);
    }
    const base = baseSegs.join('/') + '/';
    const swUrl = base + 'sw.js';
    navigator.serviceWorker.register(swUrl, { scope: base }).then(
      (reg) => console.log('[SW] registered, scope:', reg.scope),
      (err) => console.warn('[SW] registration failed:', err)
    );
  });
}
