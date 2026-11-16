import { html, textBlock } from '../util.js';
import { db } from '../data.js';
import { katahCard, stratagemCard, enhancementCard, detachmentMeta, emptyState } from './parts.js';

export function armyRule(r) {
  return html`
    <article class="card rule" id="rule-${r.id}">
      <h3>${r.name}<span class="en">${r.en}</span></h3>
      ${textBlock(r.text)}
      ${r.katah ? html`<div class="cards">${r.katah.map((k) => katahCard(k))}</div>` : ''}
      <p class="muted small src">來源：PDF 第 ${r.page} 頁</p>
    </article>`;
}

export function index(page, focusId) {
  document.title = '規則 · 帝皇禁軍';
  page.innerHTML = String(html`
    <h1>規則</h1>
    <nav class="chips scroll jump" aria-label="快速跳轉">
      ${db.rules.armyRules.map((r) => html`<a class="chip" href="#/rules/${r.id}">${r.name}</a>`)}
      <a class="chip" href="#/rules/detachments">分隊</a>
    </nav>

    <section>
      <h2>軍隊規則</h2>
      ${db.rules.armyRules.map(armyRule)}
    </section>

    <section id="rule-detachments">
      <h2>分隊<span class="count">${db.dets.length}</span></h2>
      <ul class="rows grid">
        ${db.dets.map((d) => html`<li><a class="row det" href="#/det/${d.id}">
          <span class="grow">
            <b>${d.name}</b><small>${d.en}</small>
            ${detachmentMeta(d)}
            <small>分隊規則：${d.ability.name}${d.katah ? `・武藝專長：${d.katah.name}` : ''}</small>
          </span>
        </a></li>`)}
      </ul>
    </section>`);

  if (focusId) {
    const el = page.querySelector(`#rule-${CSS.escape(focusId)}`);
    // wait for the page to be attached before scrolling
    if (el) setTimeout(() => el.scrollIntoView({ block: 'start' }), 0);
  }
}

export function detachmentBody(d) {
  return html`
    <section>
      <h2>分隊規則</h2>
      <article class="card rule"><h3>${d.ability.name}</h3>${textBlock(d.ability.text)}</article>
    </section>
    ${d.katah ? html`
      <section>
        <h2>武藝專長</h2>
        <div class="cards">${katahCard(d.katah, d.katah.extra)}</div>
      </section>` : ''}
    <section>
      <h2>強化升級<span class="count">${d.enhancements.length}</span></h2>
      <div class="cards">${d.enhancements.map((e) => enhancementCard(d, e))}</div>
    </section>
    <section>
      <h2>戰略技能<span class="count">${d.stratagems.length}</span></h2>
      <div class="cards">${d.stratagems.map((s) => stratagemCard(s))}</div>
    </section>`;
}

export function detachment(page, id) {
  const d = db.det[id];
  if (!d) {
    page.innerHTML = String(emptyState('找不到這個分隊', html`<a class="btn" href="#/rules">回規則</a>`));
    return;
  }
  document.title = `${d.name} · 分隊`;
  const i = db.dets.indexOf(d);
  const prev = db.dets[i - 1];
  const next = db.dets[i + 1];
  page.innerHTML = String(html`
    <nav class="crumbs"><a href="#/rules/detachments">‹ 分隊</a></nav>
    <header class="det-head">
      <h1>${d.name}</h1>
      <p class="en">${d.en}</p>
      ${detachmentMeta(d)}
    </header>
    ${detachmentBody(d)}
    <p class="muted small src">來源：PDF 第 ${d.page} 頁</p>
    <nav class="pager">
      ${prev ? html`<a href="#/det/${prev.id}"><small>上一個</small>${prev.name}</a>` : html`<span></span>`}
      ${next ? html`<a class="next" href="#/det/${next.id}"><small>下一個</small>${next.name}</a>` : html`<span></span>`}
    </nav>`);
}
