// ===== 島キャンプ思い出マップ : 5人共有同期（GitHub Gist バックエンド） =====
// データは代表者アカウントの非公開 Gist（islands.json）に保存される。
// 共有コード形式: "ic1.<gistId>.<token>"（token 省略時は受信のみ可能）
'use strict';

const Sync = (() => {
  const GIST_FILE = 'islands.json';
  const CFG_KEY = 'island-camp/sync-v1';
  const API = 'https://api.github.com';

  let cfg = { name: '', gistId: '', token: '' };
  try {
    const raw = localStorage.getItem(CFG_KEY);
    if (raw) cfg = { ...cfg, ...JSON.parse(raw) };
  } catch (e) {}

  const status = { lastSync: 0, error: '', busy: false };

  function saveCfg() {
    try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) {}
  }

  function parseCode(code) {
    const m = String(code || '').trim().match(/^ic1\.([A-Za-z0-9]+)(?:\.(.+))?$/);
    if (!m) return null;
    return { gistId: m[1], token: m[2] || '' };
  }
  function formatCode(gistId, token) {
    return 'ic1.' + gistId + (token ? '.' + token : '');
  }

  function headers(withAuth) {
    const h = { 'Accept': 'application/vnd.github+json' };
    if (withAuth && cfg.token) h['Authorization'] = 'Bearer ' + cfg.token;
    return h;
  }

  async function pull() {
    if (!cfg.gistId) throw new Error('未設定');
    const r = await fetch(`${API}/gists/${cfg.gistId}`, { headers: headers(true), cache: 'no-store' });
    if (!r.ok) throw new Error('受信に失敗 (' + r.status + ')');
    const g = await r.json();
    const f = g.files && g.files[GIST_FILE];
    if (!f) return { islands: [] };
    let text = f.content;
    if (f.truncated) {
      const rr = await fetch(f.raw_url, { cache: 'no-store' });
      if (!rr.ok) throw new Error('受信に失敗 (raw ' + rr.status + ')');
      text = await rr.text();
    }
    try {
      const doc = JSON.parse(text);
      return (doc && Array.isArray(doc.islands)) ? doc : { islands: [] };
    } catch (e) { return { islands: [] }; }
  }

  async function push(islands) {
    if (!cfg.gistId) throw new Error('未設定');
    if (!cfg.token) throw new Error('共有コードにトークンが含まれていないため送信できません');
    const content = JSON.stringify({ version: 2, updatedAt: new Date().toISOString(), islands });
    const r = await fetch(`${API}/gists/${cfg.gistId}`, {
      method: 'PATCH',
      headers: { ...headers(true), 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: { [GIST_FILE]: { content } } })
    });
    if (!r.ok) throw new Error('送信に失敗 (' + r.status + ')' + (r.status === 401 || r.status === 403 ? ' — トークンを確認してください' : ''));
  }

  // 代表者用: 新しい共有グループ（非公開 Gist）を作成し共有コードを返す
  async function createGroup(token, islands) {
    const content = JSON.stringify({ version: 2, updatedAt: new Date().toISOString(), islands: islands || [] });
    const r = await fetch(`${API}/gists`, {
      method: 'POST',
      headers: { 'Accept': 'application/vnd.github+json', 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: 'island-camp 共有データ（島キャンプ思い出マップ）',
        public: false,
        files: { [GIST_FILE]: { content } }
      })
    });
    if (!r.ok) throw new Error('作成に失敗 (' + r.status + ')' + (r.status === 401 ? ' — トークンが無効です' : r.status === 403 ? ' — gist スコープを確認してください' : ''));
    const g = await r.json();
    cfg.gistId = g.id;
    cfg.token = token;
    saveCfg();
    return formatCode(g.id, token);
  }

  return {
    pull, push, createGroup, parseCode, formatCode,
    status,
    enabled: () => !!cfg.gistId,
    canPush: () => !!(cfg.gistId && cfg.token),
    cfg: () => ({ ...cfg }),
    setCfg: (patch) => { cfg = { ...cfg, ...patch }; saveCfg(); },
  };
})();
