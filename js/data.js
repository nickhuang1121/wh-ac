// Loads the JSON data once and builds lookup tables.
import { enhKey, validatePoints } from './calc.js';
import { getOverride } from './store.js';

export const db = {
  rules: null, build: {}, dets: [], units: [],
  unit: {}, det: {}, enh: {}, katah: {},
  points: null,      // the points in effect (site data, or the local override)
  sitePoints: null,  // data/points.json as published
  usingOverride: false,
  overrideStale: false,
};

async function getJson(name) {
  const res = await fetch(`data/${name}.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`讀取 data/${name}.json 失敗（HTTP ${res.status}）`);
  return res.json();
}

export const pointsStamp = (p) => `${p.version || ''}|${p.date || ''}`;

export function applyOverride() {
  const o = getOverride();
  db.usingOverride = false;
  db.overrideStale = false;
  db.points = db.sitePoints;
  if (o && o.points && validatePoints(o.points, db).length === 0) {
    db.points = o.points;
    db.usingOverride = true;
    db.overrideStale = o.base !== pointsStamp(db.sitePoints);
  }
}

export async function loadData() {
  const [rules, dets, units, points] = await Promise.all(['rules', 'detachments', 'units', 'points'].map(getJson));
  db.rules = rules;
  db.build = rules.build || {};
  db.dets = dets;
  db.units = units;
  db.sitePoints = points;
  units.forEach((u) => { db.unit[u.id] = u; });
  dets.forEach((d) => {
    db.det[d.id] = d;
    d.enhancements.forEach((e) => { db.enh[enhKey(d.id, e.id)] = { det: d, enh: e }; });
  });
  const katahRule = rules.armyRules.find((r) => r.katah);
  (katahRule ? katahRule.katah : []).forEach((k) => { db.katah[k.id] = k; });
  applyOverride();
  return db;
}

// "180 分；第 2 個起每個 200 分" for a unit's points entry
export function costLines(P) {
  if (!P) return [];
  const many = P.models.length > 1;
  const lines = [many ? `${P.models.join(' / ')} 個模型：${P.pts.join(' / ')} 分` : `${P.pts[0]} 分`];
  if (P.extra) lines.push(`你的第 ${P.extra.from} 個起，每個 ${P.extra.pts.join(' / ')} 分`);
  return lines;
}
export const minCost = (P) => (P ? Math.min.apply(null, P.pts) : 0);
