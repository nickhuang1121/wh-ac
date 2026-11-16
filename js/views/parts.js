// Shared building blocks: datasheet, weapon tables, stratagem / enhancement / Ka'tah cards.
import { html, raw, textBlock, inline, fmtPts } from '../util.js';
import { db, costLines } from '../data.js';
import { enhKey } from '../calc.js';

export const PHASES = [
  { id: 'command', label: '指揮' },
  { id: 'movement', label: '移動' },
  { id: 'shooting', label: '射擊' },
  { id: 'charge', label: '衝鋒' },
  { id: 'fight', label: '近戰' },
];

// timing tokens look like "fight:any" or "shooting:enemy"
// phase 'all' keeps everything usable in that player's turn
export function matchTiming(tokens, phase, turn) {
  return (tokens || []).some((t) => {
    const [p, w] = t.split(':');
    return (phase === 'all' || p === 'any' || p === phase) && (w === 'any' || w === turn);
  });
}

const ROLE_CLASS = ['重要資產', '肅清敵人', '佔領與堅守', '偵查', '干擾'];
export const roleTag = (r) => html`<span class="tag role r${ROLE_CLASS.indexOf(r)}">${r}</span>`;

export const ruleIdByName = (name) => {
  const r = db.rules.armyRules.find((x) => x.name === name);
  return r ? r.id : null;
};

function weaponRows(list, skillLabel) {
  if (!list || !list.length) return '';
  return html`
    <table class="weapons">
      <thead><tr><th class="wname">武器</th><th>範圍</th><th>A</th><th>${skillLabel}</th><th>S</th><th>AP</th><th>D</th></tr></thead>
      <tbody>
        ${list.map((w) => html`<tr>
          <td class="wname"><span class="wn">${w.name}</span>${w.kw ? html`<span class="wkw">${w.kw}</span>` : ''}</td>
          <td>${w.range}</td><td>${w.a}</td><td>${w.skill}</td><td>${w.s}</td><td>${w.ap}</td><td>${w.d}</td>
        </tr>`)}
      </tbody>
    </table>`;
}

export function weaponTables(u) {
  return html`
    ${u.ranged && u.ranged.length ? html`<h4 class="wt ranged">射擊武器</h4>${weaponRows(u.ranged, 'BS')}` : ''}
    ${u.melee && u.melee.length ? html`<h4 class="wt melee">格鬥武器</h4>${u.meleeNote ? html`<p class="muted small">${u.meleeNote}</p>` : ''}${weaponRows(u.melee, 'WS')}` : ''}`;
}

export function statBar(u) {
  const s = u.stats;
  return html`
    <div class="stats" role="group" aria-label="屬性">
      ${['M', 'T', 'SV', 'W', 'LD', 'OC'].map((k) => html`<div class="stat"><span>${k}</span><b>${s[k]}</b></div>`)}
      ${u.invuln ? html`<div class="stat inv"><span>特保</span><b>${u.invuln}</b></div>` : ''}
    </div>`;
}

export function abilityList(u) {
  const chip = (name) => {
    const id = ruleIdByName(name);
    return id ? html`<a class="tag link" href="#/rules/${id}">${name}</a>` : html`<span class="tag">${name}</span>`;
  };
  return html`
    <div class="abil">
      ${u.invuln ? html`<p class="tb">本模型擁有 <b>${u.invuln} 特殊保護</b></p>` : ''}
      ${u.core && u.core.length ? html`<p class="chips"><span class="lbl">核心技能</span>${u.core.map((c) => html`<span class="tag">${c}</span>`)}</p>` : ''}
      ${u.factionAbilities && u.factionAbilities.length ? html`<p class="chips"><span class="lbl">陣營技能</span>${u.factionAbilities.map(chip)}</p>` : ''}
      ${(u.abilities || []).map((a) => html`
        <div class="ability">
          <h5>${a.name}${a.limit ? html`<span class="limit">${a.limit}</span>` : ''}</h5>
          ${textBlock(a.text)}
        </div>`)}
    </div>`;
}

export function unitThumb(u, cls) {
  return u.image
    ? html`<img class="${cls || 'thumb'}" src="${u.image}" alt="" loading="lazy" decoding="async">`
    : html`<span class="${cls || 'thumb'} noimg" aria-hidden="true">${u.name.slice(0, 1)}</span>`;
}

// Printed wargear lines plus any choice that costs points
function wargear(u) {
  const P = db.points.units[u.id] || {};
  const priced = [];
  (u.options || []).forEach((o) => {
    if (o.toggle) {
      const c = (P.wargear || {})[`${o.id}:on`];
      if (c) priced.push(`${o.label}：+${c} 分`);
    } else {
      o.choices.forEach((ch) => {
        const c = (P.wargear || {})[`${o.id}:${ch.id}`];
        if (c) priced.push(`${ch.label}：+${c} 分`);
      });
    }
  });
  return html`
    ${textBlock(u.gear)}
    ${priced.length ? html`<p class="tb priced"><span class="lbl">裝備分數</span>${priced.join('；')}</p>` : ''}`;
}

export function leaderInfo(u) {
  const link = (id) => (db.unit[id] ? html`<li><a href="#/unit/${id}">${db.unit[id].name}</a></li>` : '');
  return html`
    ${u.leads && u.leads.length ? html`<dt>領袖</dt><dd>本單位可以加入以下單位：<ul class="plain">${u.leads.map(link)}</ul>${u.leadsNote ? html`<span class="muted small">${u.leadsNote}</span>` : ''}</dd>` : ''}
    ${u.ledBy && u.ledBy.length ? html`<dt>領袖</dt><dd>以下單位可以加入本單位：<ul class="plain">${u.ledBy.map(link)}</ul></dd>` : ''}`;
}

export function datasheet(u, opts) {
  const o = Object.assign({ photo: true, title: true, build: true }, opts || {});
  const P = db.points.units[u.id];
  return html`
    <article class="sheet">
      ${o.title ? html`
        <header class="sheet-head">
          ${o.photo && u.image ? html`<img class="photo" src="${u.image}" alt="${u.name} 模型照片" loading="lazy" decoding="async">` : ''}
          <div>
            <h2>${u.name}</h2>
            <p class="en">${u.en}</p>
            <p class="chips">
              <span class="tag">${u.section}</span><span class="tag">${u.group}</span>
              ${u.legends ? html`<span class="tag legends">傳奇</span>` : ''}
              ${P ? html`<span class="tag pts">${fmtPts(Math.min.apply(null, P.pts))} 分${P.pts.length > 1 || P.extra ? '起' : ''}</span>` : ''}
            </p>
          </div>
        </header>` : ''}
      ${statBar(u)}
      ${weaponTables(u)}
      <h4 class="wt">技能</h4>
      ${abilityList(u)}
      ${o.build ? html`
        <h4 class="wt comp">軍表構成</h4>
        <dl class="comp">
          <dt>單位構成</dt><dd>${u.comp}${P ? html`<br>${costLines(P).map((l) => html`<span class="cost">${l}</span>`)}` : ''}</dd>
          <dt>單位裝備</dt><dd>${wargear(u)}</dd>
          ${leaderInfo(u)}
          <dt>底盤</dt><dd>${u.base}</dd>
          <dt>陣營關鍵詞</dt><dd>${u.faction}</dd>
          <dt>關鍵詞</dt><dd>${u.keywords.join('，')}</dd>
        </dl>` : ''}
      ${u.note && u.note.length ? html`<aside class="note"><b>原文註記</b>${u.note.map((n) => html`<p>${n}</p>`)}</aside>` : ''}
      ${o.build ? html`<p class="muted small src">來源：PDF 第 ${u.page} 頁</p>` : ''}
    </article>`;
}

export function stratagemCard(s, det, footer) {
  return html`
    <article class="strat">
      <header><div><h4>${s.name}</h4><p class="en">${s.en}</p></div><span class="cp">${s.cp}CP</span></header>
      <dl>
        ${det ? html`<dt>分隊</dt><dd><a href="#/det/${det.id}">${det.name}</a></dd>` : html`<dt>來源</dt><dd>${s.source}</dd>`}
        <dt>時機</dt><dd>${inline(s.when)}</dd>
        <dt>對象</dt><dd>${inline(s.target)}</dd>
        <dt>效果</dt><dd>${textBlock(s.effect)}</dd>
        ${s.restriction ? html`<dt>限制</dt><dd>${s.restriction}</dd>` : ''}
      </dl>
      ${s.note ? html`<p class="note small"><b>原文註記</b> ${s.note}</p>` : ''}
      ${footer || ''}
    </article>`;
}

export function katahCard(k, extra) {
  return html`
    <article class="strat katah">
      <header><div><h4>${k.name}</h4><p class="en">${k.en}</p></div>${extra ? html`<span class="cp spec">專長</span>` : ''}</header>
      <dl>
        <dt>時機</dt><dd>${inline(k.when)}</dd>
        <dt>目標</dt><dd>${inline(k.target)}</dd>
        <dt>效果</dt><dd>${inline(k.effect)}</dd>
        ${extra ? html`<dt class="hl">額外</dt><dd class="hl">${inline(extra)}</dd>` : ''}
      </dl>
      ${k.note ? html`<p class="note small"><b>原文註記</b> ${k.note}</p>` : ''}
    </article>`;
}

export function enhancementCard(det, e) {
  const p = db.points.enhancements[enhKey(det.id, e.id)];
  return html`
    <article class="enh">
      <header><h4>${e.name}</h4><span class="cp">${p ? p.pts : '?'} 分</span></header>
      ${textBlock(e.text)}
      ${e.weapons ? html`
        <table class="weapons">
          <thead><tr><th class="wname">武器</th><th>範圍</th><th>A</th><th>BS/WS</th><th>S</th><th>AP</th><th>D</th></tr></thead>
          <tbody>${e.weapons.map((w) => html`<tr><td class="wname"><span class="wn">${w.name}</span>${w.kw ? html`<span class="wkw">${w.kw}</span>` : ''}</td><td>${w.range}</td><td>${w.a}</td><td>${w.skill}</td><td>${w.s}</td><td>${w.ap}</td><td>${w.d}</td></tr>`)}</tbody>
        </table>` : ''}
      ${e.after ? textBlock(e.after) : ''}
    </article>`;
}

export function detachmentMeta(d) {
  const p = db.points.detachments[d.id];
  return html`
    <p class="chips">
      <span class="tag dp">${p ? p.dp : '?'} DP</span>
      ${d.roles.map(roleTag)}
      ${d.unique ? html`<span class="tag uniq">唯一：${d.unique}</span>` : ''}
    </p>`;
}

export const emptyState = (title, body) => html`<div class="empty"><h3>${title}</h3>${body ? html`<p>${body}</p>` : ''}</div>`;
export { raw };
