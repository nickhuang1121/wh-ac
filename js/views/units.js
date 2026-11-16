import { html, on, fmtPts, toast } from '../util.js';
import { db, minCost } from '../data.js';
import { computeList } from '../calc.js';
import { getLists, getSettings, saveList, newList } from '../store.js';
import { addUnit } from '../listops.js';
import { openDialog } from '../ui.js';
import { datasheet, unitThumb, emptyState } from './parts.js';

let filter = { q: '', group: '' };

export function visibleUnits() {
  return getSettings().showLegends ? db.units : db.units.filter((u) => !u.legends);
}

function matches(u, q) {
  if (!q) return true;
  const hay = [u.name, u.en, u.keywords.join(' '), u.group, u.section].join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
}

export function unitRow(u, extra) {
  const P = db.points.units[u.id];
  const s = u.stats;
  return html`
    <a class="row unit" href="#/unit/${u.id}">
      ${unitThumb(u)}
      <span class="grow">
        <b>${u.name}${u.legends ? html` <span class="tag legends">傳奇</span>` : ''}</b>
        <small>${u.en}</small>
        <small class="mini">M${s.M}　T${s.T}　SV${s.SV}　W${s.W}　OC${s.OC}</small>
      </span>
      <span class="pts">${P ? fmtPts(minCost(P)) : '—'}<small>${P && P.pts.length > 1 ? ' 起' : ' 分'}</small>${extra || ''}</span>
    </a>`;
}

function results() {
  const all = visibleUnits().filter((u) => matches(u, filter.q) && (!filter.group || u.group === filter.group));
  if (!all.length) return emptyState('沒有符合的單位', '試試其他關鍵字，或清除篩選。');
  const sections = [];
  all.forEach((u) => {
    let sec = sections.find((x) => x.name === u.section);
    if (!sec) sections.push(sec = { name: u.section, units: [] });
    sec.units.push(u);
  });
  return html`${sections.map((sec) => html`
    <section>
      <h2>${sec.name}<span class="count">${sec.units.length}</span></h2>
      <ul class="rows grid">${sec.units.map((u) => html`<li>${unitRow(u)}</li>`)}</ul>
    </section>`)}`;
}

export function list(page) {
  document.title = '單位 · 帝皇禁軍';
  const groups = [];
  visibleUnits().forEach((u) => { if (!groups.includes(u.group)) groups.push(u.group); });
  if (filter.group && !groups.includes(filter.group)) filter.group = '';

  page.innerHTML = String(html`
    <h1>單位</h1>
    <div class="filters">
      <input type="search" id="unit-filter" placeholder="篩選名稱或關鍵詞，例如：步兵、JETBIKE" value="${filter.q}" aria-label="篩選單位" autocomplete="off">
      <div class="chips scroll" role="group" aria-label="類別">
        <button type="button" class="chip" data-group="" aria-pressed="${filter.group === '' ? 'true' : 'false'}">全部</button>
        ${groups.map((g) => html`<button type="button" class="chip" data-group="${g}" aria-pressed="${filter.group === g ? 'true' : 'false'}">${g}</button>`)}
      </div>
    </div>
    <div id="unit-results">${results()}</div>
    ${getSettings().showLegends ? '' : html`<p class="muted small">傳奇單位已隱藏，可在首頁的設定開啟。</p>`}`);

  const out = page.querySelector('#unit-results');
  on(page, 'input', '#unit-filter', (ev, el) => {
    filter.q = el.value.trim();
    out.innerHTML = String(results());
  });
  on(page, 'click', '[data-group]', (ev, el) => {
    filter.group = el.dataset.group;
    page.querySelectorAll('[data-group]').forEach((b) => b.setAttribute('aria-pressed', b === el ? 'true' : 'false'));
    out.innerHTML = String(results());
  });
}

// "加入軍表" from a datasheet
function addToListDialog(u) {
  const lists = getLists().sort((a, b) => (b.updated || 0) - (a.updated || 0));
  const d = openDialog({
    title: `把「${u.name}」加入軍表`,
    body: html`
      <ul class="rows">
        ${lists.map((l) => html`<li><button type="button" class="row" data-list="${l.id}">
          <span class="grow"><b>${l.name}</b><small>${l.entries.length} 個單位</small></span>
          <span class="pts">${fmtPts(computeList(l, db).total)}<small> / ${fmtPts(l.limit)}</small></span>
        </button></li>`)}
        <li><button type="button" class="row add" data-list="new"><span class="grow"><b>＋ 建立新軍表</b></span></button></li>
      </ul>`,
  });
  on(d, 'click', '[data-list]', (ev, el) => {
    const l = el.dataset.list === 'new' ? newList({ limit: db.build.defaultPoints || 2000 }) : getLists().find((x) => x.id === el.dataset.list);
    if (!l) return;
    addUnit(l, u.id);
    saveList(l);
    d.close();
    toast(`已加入「${l.name}」`);
    if (el.dataset.list === 'new') location.hash = `#/list/${l.id}`;
  });
}

export function detail(page, id) {
  const u = db.unit[id];
  if (!u) {
    page.innerHTML = String(emptyState('找不到這個單位', html`<a class="btn" href="#/units">回單位列表</a>`));
    return;
  }
  document.title = `${u.name} · 帝皇禁軍`;
  const all = visibleUnits();
  const i = all.indexOf(u);
  const prev = i > 0 ? all[i - 1] : null;
  const next = i >= 0 && i < all.length - 1 ? all[i + 1] : null;

  page.innerHTML = String(html`
    <nav class="crumbs"><a href="#/units">‹ 單位</a></nav>
    ${datasheet(u)}
    <div class="actions">
      <button type="button" class="btn primary" data-act="add">＋ 加入軍表</button>
    </div>
    <nav class="pager">
      ${prev ? html`<a href="#/unit/${prev.id}"><small>上一個</small>${prev.name}</a>` : html`<span></span>`}
      ${next ? html`<a class="next" href="#/unit/${next.id}"><small>下一個</small>${next.name}</a>` : html`<span></span>`}
    </nav>`);

  on(page, 'click', '[data-act="add"]', () => addToListDialog(u));
}
