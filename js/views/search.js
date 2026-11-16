import { html, textBlock } from '../util.js';
import { db } from '../data.js';
import { visibleUnits, unitRow } from './units.js';
import { stratagemCard, enhancementCard, katahCard, emptyState } from './parts.js';

const has = (text, words) => {
  const t = String(text || '').toLowerCase();
  return words.every((w) => t.includes(w));
};
const join = (...parts) => parts.map((p) => (Array.isArray(p) ? p.join(' ') : p || '')).join(' ');

export function runSearch(q) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const out = { units: [], abilities: [], weapons: [], strats: [], enh: [], dets: [], rules: [], katah: [] };
  if (!words.length) return out;

  visibleUnits().forEach((u) => {
    if (has(join(u.name, u.en, u.keywords, u.faction, u.core, u.factionAbilities), words)) out.units.push(u);
    u.abilities.forEach((a) => { if (has(join(a.name, a.text), words)) out.abilities.push({ u, a }); });
    [].concat(u.ranged || [], u.melee || []).forEach((w) => {
      if (has(join(w.name, w.kw), words) && !out.weapons.some((x) => x.u === u && x.w.name === w.name && x.w.range === w.range)) out.weapons.push({ u, w });
    });
  });
  db.dets.forEach((d) => {
    if (has(join(d.name, d.en, d.ability.name, d.ability.text, d.roles), words)) out.dets.push(d);
    d.stratagems.forEach((s) => { if (has(join(s.name, s.en, s.when, s.target, s.effect, s.restriction), words)) out.strats.push({ d, s }); });
    d.enhancements.forEach((e) => { if (has(join(e.name, e.text, e.after), words)) out.enh.push({ d, e }); });
  });
  db.rules.armyRules.forEach((r) => {
    if (has(join(r.name, r.en, r.text), words)) out.rules.push(r);
    (r.katah || []).forEach((k) => { if (has(join(k.name, k.en, k.when, k.target, k.effect), words)) out.katah.push(k); });
  });
  return out;
}

const CAP = 40;
function group(title, items, renderItem, wrap) {
  if (!items.length) return '';
  const shown = items.slice(0, CAP);
  return html`
    <section>
      <h2>${title}<span class="count">${items.length}</span></h2>
      ${wrap(shown.map(renderItem))}
      ${items.length > CAP ? html`<p class="muted small">只顯示前 ${CAP} 筆，請輸入更精確的關鍵字。</p>` : ''}
    </section>`;
}
const asRows = (items) => html`<ul class="rows grid">${items.map((i) => html`<li>${i}</li>`)}</ul>`;
const asCards = (items) => html`<div class="cards">${items}</div>`;

export function view(page, q) {
  const query = (q || '').trim();
  document.title = query ? `搜尋「${query}」` : '搜尋';
  const input = document.getElementById('search-input');
  if (input && document.activeElement !== input) input.value = query;

  if (!query) {
    page.innerHTML = String(html`<h1>搜尋</h1>${emptyState('輸入關鍵字開始搜尋', '可以搜尋單位、武器、技能、戰略技能、強化升級與分隊，中英文皆可。')}`);
    return;
  }
  const r = runSearch(query);
  const total = Object.keys(r).reduce((n, k) => n + r[k].length, 0);
  page.innerHTML = String(html`
    <h1>搜尋「${query}」</h1>
    ${total === 0 ? emptyState('沒有找到結果', '資料是由簡體轉成繁體的，術語維持原文；可以換個說法或只打其中幾個字試試。') : ''}
    ${group('單位', r.units, (u) => unitRow(u), asRows)}
    ${group('戰略技能', r.strats, (x) => stratagemCard(x.s, x.d), asCards)}
    ${group('強化升級', r.enh, (x) => html`<div><p class="from"><a href="#/det/${x.d.id}">${x.d.name}</a></p>${enhancementCard(x.d, x.e)}</div>`, asCards)}
    ${group('御林武藝', r.katah, (k) => katahCard(k), asCards)}
    ${group('單位技能', r.abilities, (x) => html`
      <article class="card rule">
        <p class="from"><a href="#/unit/${x.u.id}">${x.u.name}</a></p>
        <h3>${x.a.name}${x.a.limit ? html`<span class="limit">${x.a.limit}</span>` : ''}</h3>
        ${textBlock(x.a.text)}
      </article>`, asCards)}
    ${group('武器', r.weapons, (x) => html`
      <a class="row" href="#/unit/${x.u.id}">
        <span class="grow"><b>${x.w.name}</b><small>${x.u.name}・${x.w.range === '近戰' ? '近戰' : `${x.w.range}"`}　A${x.w.a}　${x.w.skill}　S${x.w.s}　AP${x.w.ap}　D${x.w.d}</small>${x.w.kw ? html`<small>${x.w.kw}</small>` : ''}</span>
      </a>`, asRows)}
    ${group('分隊', r.dets, (d) => html`<a class="row" href="#/det/${d.id}"><span class="grow"><b>${d.name}</b><small>${d.en}・分隊規則：${d.ability.name}</small></span></a>`, asRows)}
    ${group('軍隊規則', r.rules, (x) => html`<a class="row" href="#/rules/${x.id}"><span class="grow"><b>${x.name}</b><small>${x.en}</small></span></a>`, asRows)}`);
}
