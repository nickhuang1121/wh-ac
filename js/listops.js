// Editing army lists and turning them into text.
import { db } from './data.js';
import { computeList } from './calc.js';
import { uid } from './store.js';
import { fmtPts } from './util.js';

export function makeEntry(unitId) {
  const u = db.unit[unitId];
  const P = db.points.units[unitId];
  const opts = {};
  (u.options || []).forEach((o) => { opts[o.id] = o.toggle ? false : o.choices[0].id; });
  return { eid: uid(), unit: unitId, models: P ? P.models[0] : 1, opts, enh: [], attach: null, note: '' };
}

export function addUnit(list, unitId) {
  const e = makeEntry(unitId);
  list.entries.push(e);
  if (db.unit[unitId].mustBeWarlord) list.warlord = e.eid;
  return e;
}

export function removeEntry(list, eid) {
  list.entries = list.entries.filter((e) => e.eid !== eid);
  list.entries.forEach((e) => { if (e.attach === eid) e.attach = null; });
  if (list.warlord === eid) list.warlord = null;
}

export function cloneEntry(list, eid) {
  const src = list.entries.find((e) => e.eid === eid);
  if (!src) return null;
  const copy = JSON.parse(JSON.stringify(src));
  copy.eid = uid();
  copy.enh = [];      // an enhancement can only be taken once
  copy.attach = null;
  list.entries.splice(list.entries.indexOf(src) + 1, 0, copy);
  return copy;
}

// Entries in codex order (characters first), keeping list order within the same unit
export function sortedRows(rows) {
  const order = {};
  db.units.forEach((u, i) => { order[u.id] = i; });
  return rows.map((r, i) => ({ r, i }))
    .sort((a, b) => ((order[a.r.e.unit] === undefined ? 999 : order[a.r.e.unit]) - (order[b.r.e.unit] === undefined ? 999 : order[b.r.e.unit])) || a.i - b.i)
    .map((x) => x.r);
}

// The chosen wargear as short text, e.g. ["武器：堡主戰斧", "一個模型額外裝備一面禁衛旌旗"]
export function optionLines(row) {
  const out = [];
  if (row.missing) return out;
  (row.u.options || []).forEach((o) => {
    const v = (row.e.opts || {})[o.id];
    if (o.toggle) {
      if (v) out.push(o.label);
    } else if (v === 'mixed') {
      out.push(`${o.label}：混搭`);
    } else {
      const c = o.choices.find((x) => x.id === v) || o.choices[0];
      out.push(`${o.label}：${c.label}`);
    }
  });
  return out;
}

export function enhNames(row) {
  return (row.e.enh || []).map((k) => {
    const info = db.enh[k];
    const p = db.points.enhancements[k];
    return info ? { key: k, name: info.enh.name, det: info.det.name, pts: p ? p.pts : 0, info } : { key: k, name: k, det: '', pts: 0, info: null };
  });
}

export function attachedTo(row, rows) {
  if (!row.e.attach) return null;
  return rows.find((x) => x.e.eid === row.e.attach) || null;
}

export function listText(list) {
  const c = computeList(list, db);
  const L = [];
  L.push(`${list.name}`);
  L.push(`${fmtPts(c.total)} / ${fmtPts(list.limit)} 分`);
  L.push(`分隊：${c.dets.length ? c.dets.map((d) => `${d.name}（${(db.points.detachments[d.id] || {}).dp || 0} DP）`).join('、') : '未選擇'}`);
  let section = null;
  sortedRows(c.rows).forEach((r) => {
    if (r.missing) return;
    if (r.u.group !== section) {
      section = r.u.group;
      L.push('', `【${section}】`);
    }
    const size = r.P.models.length > 1 || r.models > 1 ? ` ×${r.models}` : '';
    L.push(`• ${r.u.name}${size} — ${fmtPts(r.total)} 分${list.warlord === r.e.eid ? '［主將］' : ''}`);
    optionLines(r).forEach((s) => L.push(`    ${s}`));
    enhNames(r).forEach((x) => L.push(`    強化升級：${x.name}（+${x.pts}）`));
    const t = attachedTo(r, c.rows);
    if (t && !t.missing) L.push(`    加入：${t.u.name}`);
    if (r.e.note) L.push(`    備註：${r.e.note}`);
  });
  L.push('', `分數版本：${db.points.version || ''}（${db.points.date || ''}）${db.usingOverride ? '・本機自訂' : ''}`);
  return L.join('\n');
}
