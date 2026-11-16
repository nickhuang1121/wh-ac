// Everything the site remembers lives in this browser's localStorage.

const KEYS = {
  lists: 'whac.lists.v1',
  override: 'whac.points.override.v1',
  play: 'whac.play.v1',
  settings: 'whac.settings.v1',
};

function read(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch (e) {
    return fallback;
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ── settings ──
export const getSettings = () => Object.assign({ showLegends: true }, read(KEYS.settings, {}));
export const saveSettings = (s) => write(KEYS.settings, s);

// ── army lists ──
export const getLists = () => read(KEYS.lists, []);
export const getList = (id) => getLists().find((l) => l.id === id) || null;
export function saveList(list) {
  const lists = getLists();
  list.updated = Date.now();
  const i = lists.findIndex((l) => l.id === list.id);
  if (i >= 0) lists[i] = list; else lists.push(list);
  return write(KEYS.lists, lists);
}
export function deleteList(id) {
  write(KEYS.lists, getLists().filter((l) => l.id !== id));
  const play = read(KEYS.play, {});
  delete play[id];
  write(KEYS.play, play);
}
export function newList(defaults) {
  const list = Object.assign({
    id: uid(), name: '新軍表', limit: 2000, dpLimit: null, dets: [], warlord: null, entries: [], created: Date.now(),
  }, defaults || {});
  saveList(list);
  return list;
}
export function duplicateList(id) {
  const src = getList(id);
  if (!src) return null;
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = uid();
  copy.name = src.name + '（複本）';
  copy.created = Date.now();
  saveList(copy);
  return copy;
}

// Compact form used in share links; entry references become indexes.
export function packList(list) {
  const idx = {};
  list.entries.forEach((e, i) => { idx[e.eid] = i; });
  return {
    v: 1, n: list.name, l: list.limit, dl: list.dpLimit, d: list.dets,
    w: list.warlord in idx ? idx[list.warlord] : -1,
    e: list.entries.map((e) => [e.unit, e.models, e.opts || {}, e.enh || [], e.attach in idx ? idx[e.attach] : -1, e.note || '']),
  };
}
export function unpackList(p) {
  if (!p || p.v !== 1 || !Array.isArray(p.e)) throw new Error('bad share data');
  const entries = p.e.map((r) => ({
    eid: uid(), unit: String(r[0]), models: Number(r[1]) || 1,
    opts: r[2] && typeof r[2] === 'object' ? r[2] : {},
    enh: Array.isArray(r[3]) ? r[3].map(String) : [],
    attach: null, note: String(r[5] || ''),
  }));
  p.e.forEach((r, i) => { if (r[4] >= 0 && entries[r[4]]) entries[i].attach = entries[r[4]].eid; });
  return {
    id: uid(), name: String(p.n || '匯入的軍表'), limit: Number(p.l) || 2000,
    dpLimit: p.dl === null || p.dl === undefined ? null : Number(p.dl),
    dets: Array.isArray(p.d) ? p.d.map(String) : [],
    warlord: p.w >= 0 && entries[p.w] ? entries[p.w].eid : null,
    entries, created: Date.now(),
  };
}

// ── points override (from the points editor) ──
export const getOverride = () => read(KEYS.override, null);
export const saveOverride = (o) => write(KEYS.override, o);
export const clearOverride = () => { try { localStorage.removeItem(KEYS.override); } catch (e) { /* ignore */ } };

// ── in-game state, one per list ──
export const defaultPlay = () => ({ round: 1, cp: 0, vp: 0, vpEnemy: 0, phase: 'all', turn: 'own', lost: {}, used: {}, ready: {}, open: {} });
export function getPlay(listId) {
  const all = read(KEYS.play, {});
  return Object.assign(defaultPlay(), all[listId] || {});
}
export function savePlay(listId, state) {
  const all = read(KEYS.play, {});
  all[listId] = state;
  write(KEYS.play, all);
}
