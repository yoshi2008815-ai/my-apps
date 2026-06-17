// store.js - localStorage CRUD wrapper

const Store = (() => {
  const PREFIX = 'harmony_';

  function _key(name) { return PREFIX + name; }

  function init() {
    if (localStorage.getItem(_key('initialized'))) return;
    Object.keys(SEED_DATA).forEach(k => {
      localStorage.setItem(_key(k), JSON.stringify(SEED_DATA[k]));
    });
    localStorage.setItem(_key('initialized'), '1');
  }

  function reset() {
    Object.keys(localStorage).filter(k => k.startsWith(PREFIX)).forEach(k => localStorage.removeItem(k));
    init();
  }

  function get(name) {
    const raw = localStorage.getItem(_key(name));
    if (raw === null) return SEED_DATA[name] ?? null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  function set(name, data) {
    localStorage.setItem(_key(name), JSON.stringify(data));
  }

  function getById(name, id) {
    const list = get(name);
    if (!Array.isArray(list)) return null;
    return list.find(item => item.id === id) ?? null;
  }

  function update(name, id, updates) {
    const list = get(name);
    if (!Array.isArray(list)) return false;
    const idx = list.findIndex(item => item.id === id);
    if (idx === -1) return false;
    list[idx] = { ...list[idx], ...updates };
    set(name, list);
    return list[idx];
  }

  function create(name, item) {
    const list = get(name) ?? [];
    list.push(item);
    set(name, list);
    return item;
  }

  function remove(name, id) {
    const list = get(name);
    if (!Array.isArray(list)) return false;
    const filtered = list.filter(item => item.id !== id);
    set(name, filtered);
    return true;
  }

  function query(name, predicateFn) {
    const list = get(name);
    if (!Array.isArray(list)) return [];
    return list.filter(predicateFn);
  }

  function nextId(name, prefix) {
    const list = get(name) ?? [];
    const nums = list.map(i => parseInt((i.id || '').replace(prefix, '')) || 0);
    const max = nums.length ? Math.max(...nums) : 0;
    return prefix + String(max + 1).padStart(3, '0');
  }

  return { init, reset, get, set, getById, update, create, remove, query, nextId };
})();
