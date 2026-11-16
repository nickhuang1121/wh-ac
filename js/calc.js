// Army list maths and checks. Pure functions: no DOM, no storage.
//
// db = { unit: {id -> unit}, det: {id -> detachment}, enh: {key -> {det, enh}}, points, build }

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export const enhKey = (detId, enhId) => `${detId}/${enhId}`;

// Does a unit satisfy an enhancement's printed restriction ("僅限…")?
export function enhEligible(enh, unit) {
  const r = enh.req || {};
  const kw = unit.keywords || [];
  if (r.units && !r.units.includes(unit.id)) return false;
  if (r.faction && unit.faction !== r.faction) return false;
  if (r.kw && !r.kw.every((k) => kw.includes(k))) return false;
  if (r.kwAny && !r.kwAny.some((k) => kw.includes(k))) return false;
  if (r.notKw && r.notKw.some((k) => kw.includes(k))) return false;
  return true;
}

// Leader datasheets list the units they can join; some Legends units list their leaders instead.
export function canAttach(leader, unit) {
  if (!leader || !unit || leader.id === unit.id) return false;
  return (leader.leads || []).includes(unit.id) || (unit.ledBy || []).includes(leader.id);
}
export const isLeader = (unit, db) => (unit.leads || []).length > 0 || Object.values(db.unit).some((u) => (u.ledBy || []).includes(unit.id));

// The wargear key a list entry's choice maps to in points.units[id].wargear
export function wargearKey(option, value) {
  if (option.toggle) return value ? `${option.id}:on` : null;
  if (value === 'mixed') return null;
  return `${option.id}:${value || option.choices[0].id}`;
}

export function computeList(list, db) {
  const pts = db.points;
  const build = db.build || {};
  const warnings = [];
  const warn = (level, text) => warnings.push({ level, text });

  const rows = (list.entries || []).map((e) => {
    const u = db.unit[e.unit];
    const P = pts.units[e.unit];
    const row = { e, u, P, si: 0, models: e.models, base: 0, wargear: 0, enh: 0, repeat: false, total: 0, missing: false };
    if (!u || !P || !Array.isArray(P.models) || !P.models.length) {
      row.missing = true;
      return row;
    }
    row.si = Math.max(0, P.models.indexOf(e.models));
    row.models = P.models[row.si];
    row.base = num(P.pts[row.si]);
    for (const o of u.options || []) {
      const key = wargearKey(o, (e.opts || {})[o.id]);
      if (key && P.wargear && P.wargear[key]) row.wargear += num(P.wargear[key]);
    }
    for (const k of e.enh || []) {
      const pe = pts.enhancements[k];
      if (pe) row.enh += num(pe.pts);
    }
    return row;
  });

  // "你的第 N+個本單位每個 X 分": the first N-1 copies pay the normal price, the rest pay the
  // repeat price. When sizes differ the normal price goes to the copies that save the most.
  const groups = {};
  rows.forEach((r) => {
    if (!r.missing && r.P.extra && Array.isArray(r.P.extra.pts)) (groups[r.e.unit] = groups[r.e.unit] || []).push(r);
  });
  Object.keys(groups).forEach((id) => {
    const g = groups[id];
    const ex = g[0].P.extra;
    const free = Math.max(0, num(ex.from) - 1);
    if (g.length <= free) return;
    const premium = (r) => (ex.pts[r.si] === undefined ? 0 : num(ex.pts[r.si]) - r.base);
    g.map((r, i) => ({ r, i, p: premium(r) }))
      .sort((a, b) => b.p - a.p || a.i - b.i)
      .slice(free)
      .forEach((x) => { x.r.base += x.p; x.r.repeat = true; });
  });

  let total = 0;
  rows.forEach((r) => { r.total = r.base + r.wargear + r.enh; total += r.total; });

  // ── detachments ──
  const dets = (list.dets || []).map((id) => db.det[id]).filter(Boolean);
  let dp = 0;
  dets.forEach((d) => { dp += num((pts.detachments[d.id] || {}).dp); });
  if (!dets.length) warn('warn', '尚未選擇分隊');
  if (list.dpLimit !== null && list.dpLimit !== undefined && dp > list.dpLimit) warn('error', `分隊消耗 ${dp} DP，超過設定的上限 ${list.dpLimit} DP`);
  const tags = {};
  dets.forEach((d) => { if (d.unique) (tags[d.unique] = tags[d.unique] || []).push(d.name); });
  Object.keys(tags).forEach((t) => {
    if (tags[t].length > 1) warn('error', `標示「唯一：${t}」的分隊只能選一個（目前選了 ${tags[t].join('、')}）`);
  });

  // ── points ──
  if (list.limit && total > list.limit) warn('error', `超過分數上限 ${total - list.limit} 分`);

  // ── per unit ──
  const enhCount = {};
  const uniqueCount = {};
  rows.forEach((r) => {
    if (r.missing) {
      warn('error', `找不到單位資料或分數：${r.e.unit}`);
      return;
    }
    const u = r.u;
    const chosen = r.e.enh || [];
    chosen.forEach((k) => {
      const info = db.enh[k];
      if (!info) {
        warn('error', `${u.name}：找不到強化升級 ${k}`);
        return;
      }
      enhCount[k] = (enhCount[k] || 0) + 1;
      if (!(list.dets || []).includes(info.det.id)) warn('error', `${u.name} 的「${info.enh.name}」來自未選擇的分隊「${info.det.name}」`);
      if (!enhEligible(info.enh, u)) warn('error', `${u.name} 不符合「${info.enh.name}」的限制`);
      if (build.enhancementsNeedCharacter && !info.enh.upgrade && !u.keywords.includes(build.characterKeyword)) {
        warn('warn', `「${info.enh.name}」未標示（升級），${u.name} 不是${build.characterKeyword}模型`);
      }
    });
    if (build.maxEnhancementsPerUnit && chosen.length > build.maxEnhancementsPerUnit) warn('warn', `${u.name} 選了 ${chosen.length} 個強化升級`);
    (build.uniqueKeywords || []).forEach((k) => {
      if (u.keywords.includes(k)) {
        uniqueCount[u.id] = uniqueCount[u.id] || { n: 0, name: u.name, k };
        uniqueCount[u.id].n++;
      }
    });
    if (r.e.attach) {
      const target = rows.find((x) => x.e.eid === r.e.attach);
      if (!target || target.missing) warn('warn', `${u.name} 要加入的單位已不在軍表中`);
      else if (!canAttach(u, target.u)) warn('error', `${u.name} 不能加入 ${target.u.name}`);
    }
  });
  Object.keys(enhCount).forEach((k) => {
    if (enhCount[k] > 1) warn('error', `強化升級「${db.enh[k].enh.name}」被選了 ${enhCount[k]} 次`);
  });
  Object.keys(uniqueCount).forEach((id) => {
    const c = uniqueCount[id];
    if (c.n > 1) warn('error', `${c.name} 是${c.k}，軍表中有 ${c.n} 個`);
  });

  // ── warlord ──
  const ok = rows.filter((r) => !r.missing);
  const wl = ok.find((r) => r.e.eid === list.warlord);
  const must = ok.filter((r) => r.u.mustBeWarlord);
  if (must.length && (!wl || !wl.u.mustBeWarlord)) warn('error', `軍隊中包含 ${must[0].u.name} 時，他必須是主將`);
  else if (ok.length && !wl) warn('warn', '尚未指定主將');
  if (wl && build.sistersFaction && wl.u.faction === build.sistersFaction && !dets.some((d) => d.allowsSistersWarlord)) {
    warn('error', `${build.sistersFaction}模型不能作為主將（選擇允許的分隊時除外）`);
  }
  if (ok.some((r) => r.u.legends)) warn('info', '軍表含傳奇單位，使用前請先與對手協商');

  return { rows, total, dp, dets, warnings };
}

// points.json text, one unit / detachment / enhancement per line so that git diffs stay readable.
const oneLine = (v) => {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(oneLine).join(', ') + ']';
  const keys = Object.keys(v);
  return keys.length ? '{ ' + keys.map((k) => JSON.stringify(k) + ': ' + oneLine(v[k])).join(', ') + ' }' : '{}';
};
export function formatPoints(p) {
  const units = {};
  Object.keys(p.units).forEach((id) => {
    const s = p.units[id];
    const u = { name: s.name, models: s.models, pts: s.pts };
    if (s.extra) u.extra = { from: s.extra.from, pts: s.extra.pts };
    if (s.wargear && Object.keys(s.wargear).length) u.wargear = s.wargear;
    units[id] = u;
  });
  const src = Object.assign({}, p, { units });
  const keys = Object.keys(src);
  const lines = ['{'];
  keys.forEach((k, i) => {
    const comma = i < keys.length - 1 ? ',' : '';
    const v = src[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const ids = Object.keys(v);
      lines.push(`  ${JSON.stringify(k)}: {`);
      ids.forEach((id, j) => lines.push(`    ${JSON.stringify(id)}: ${oneLine(v[id])}${j < ids.length - 1 ? ',' : ''}`));
      lines.push(`  }${comma}`);
    } else {
      lines.push(`  ${JSON.stringify(k)}: ${oneLine(v)}${comma}`);
    }
  });
  lines.push('}');
  return lines.join('\n') + '\n';
}

// Shape check for a points file (site data, local override, or an imported file).
export function validatePoints(p, db) {
  const out = [];
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  if (!p || typeof p !== 'object') return ['不是有效的分數檔'];
  for (const k of ['units', 'detachments', 'enhancements']) if (!p[k] || typeof p[k] !== 'object') out.push(`缺少 ${k}`);
  if (out.length) return out;
  Object.keys(db.unit).forEach((id) => {
    const P = p.units[id];
    if (!P) { out.push(`缺少單位 ${id}`); return; }
    if (!Array.isArray(P.models) || !Array.isArray(P.pts) || !P.models.length || P.models.length !== P.pts.length) out.push(`${id}：models 與 pts 的數量不一致`);
    else if (!P.models.every(isNum) || !P.pts.every(isNum)) out.push(`${id}：models 或 pts 含有非數字`);
    if (P.extra) {
      if (!isNum(P.extra.from) || P.extra.from < 2) out.push(`${id}：extra.from 必須是 2 以上的數字`);
      if (!Array.isArray(P.extra.pts) || !Array.isArray(P.pts) || P.extra.pts.length !== P.pts.length || !P.extra.pts.every(isNum)) out.push(`${id}：extra.pts 必須與 pts 數量相同`);
    }
    if (P.wargear && !Object.values(P.wargear).every(isNum)) out.push(`${id}：wargear 含有非數字`);
  });
  Object.keys(db.det).forEach((id) => {
    if (!p.detachments[id] || !isNum(p.detachments[id].dp)) out.push(`分隊 ${id} 缺少 dp`);
  });
  Object.keys(db.enh).forEach((k) => {
    if (!p.enhancements[k] || !isNum(p.enhancements[k].pts)) out.push(`強化升級 ${k} 缺少 pts`);
  });
  return out;
}
