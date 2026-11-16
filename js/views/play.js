// In-game companion for one list: trackers, phase-filtered stratagems and Ka'tah, unit cards.
import { html, on, textBlock, toast, fmtPts } from '../util.js';
import { db } from '../data.js';
import { computeList } from '../calc.js';
import { getList, getLists, getPlay, savePlay, defaultPlay } from '../store.js';
import { sortedRows, enhNames } from '../listops.js';
import { PHASES, matchTiming, datasheet, stratagemCard, katahCard, enhancementCard, emptyState } from './parts.js';
import { listRow } from './lists.js';
import { armyRule } from './rules.js';

const TABS = [['units', '單位'], ['strats', '戰略技能'], ['katah', '武藝'], ['det', '分隊']];
const COUNTERS = [['round', '戰鬥輪', 1], ['cp', 'CP', 0], ['vp', '我方 VP', 0], ['vpEnemy', '敵方 VP', 0]];

// ── keep the screen awake while playing ──
let wakeLock = null;
let wantWake = false;
async function acquireWake() {
  if (!wantWake || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return false;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    return true;
  } catch (e) {
    return false;
  }
}
function releaseWake() {
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}

function chooser(page) {
  document.title = '遊玩 · 帝皇禁軍';
  const lists = getLists().sort((a, b) => (b.updated || 0) - (a.updated || 0));
  page.innerHTML = String(html`
    <h1>遊玩模式</h1>
    ${lists.length ? html`
      <p class="muted">選一份軍表開始。</p>
      <ul class="rows">${lists.map((l) => html`<li>${listRow(l, `#/play/${l.id}`)}</li>`)}</ul>`
    : html`${emptyState('還沒有軍表', '先組一份軍表，遊玩模式會依照軍表顯示你的單位、分隊的戰略技能與武藝。')}<p><a class="btn primary" href="#/lists">去組軍表</a></p>`}
    <p class="muted small">只想查規則的話，可以直接看<a href="#/rules">規則</a>或<a href="#/units">單位</a>。</p>`);
}

export function view(page, id) {
  if (!id) return chooser(page);
  const list = getList(id);
  if (!list) {
    page.innerHTML = String(html`${emptyState('找不到這份軍表', '')}<p><a class="btn" href="#/play">選擇軍表</a></p>`);
    return undefined;
  }
  document.title = `遊玩：${list.name}`;
  const c = computeList(list, db);
  const rows = sortedRows(c.rows).filter((r) => !r.missing);
  let st = getPlay(id);
  if (!st.tab) st.tab = 'units';
  const save = () => savePlay(id, st);

  const katahRule = db.rules.armyRules.find((r) => r.katah);
  const seen = new Set();
  const units = [];
  rows.forEach((r) => {
    if (seen.has(r.u.id)) return;
    seen.add(r.u.id);
    units.push(r.u);
  });

  const strats = () => {
    const out = [];
    c.dets.forEach((d) => d.stratagems.forEach((s) => { if (matchTiming(s.t, st.phase, st.turn)) out.push({ d, s }); }));
    return out;
  };
  const katahs = () => (katahRule ? katahRule.katah.filter((k) => matchTiming(k.t, st.phase, st.turn)) : []);

  function body() {
    if (st.tab === 'units') {
      if (!units.length) return emptyState('這份軍表還沒有單位', html`<a class="btn" href="#/list/${list.id}">去加入單位</a>`);
      return html`<div class="play-sheets">${units.map((u) => datasheet(u, { build: false }))}</div>`;
    }
    if (st.tab === 'strats') {
      if (!c.dets.length) return emptyState('這份軍表還沒有選分隊', html`<a class="btn" href="#/list/${list.id}">去選分隊</a>`);
      const hit = strats();
      return html`
        ${hit.length ? html`<div class="cards">${hit.map((x) => stratagemCard(x.s, c.dets.length > 1 ? x.d : null, html`
          <div class="actions"><button type="button" class="btn small" data-act="spend" data-cp="${x.s.cp}" data-name="${x.s.name}">使用（−${x.s.cp} CP）</button></div>`))}</div>`
        : emptyState('這個時機沒有分隊戰略技能', '換個階段或回合看看。')}
        <p class="muted small">這裡只列出分隊的戰略技能；核心規則的通用戰略技能不在原文件中。</p>`;
    }
    if (st.tab === 'katah') {
      if (!katahRule) return emptyState('沒有武藝資料', '');
      const hit = katahs();
      return html`
        ${hit.length ? html`<div class="cards">${hit.map((k) => {
          const spec = c.dets.find((d) => d.katah && d.katah.ref === k.id);
          return spec ? html`<div><p class="from">${spec.name} 的武藝專長</p>${katahCard(spec.katah, spec.katah.extra)}</div>` : katahCard(k);
        })}</div>` : emptyState('這個時機沒有可用的武藝', '換個階段或回合看看。')}`;
    }
    const held = rows.filter((r) => (r.e.enh || []).length);
    return html`
      ${c.dets.length ? c.dets.map((d) => html`
        <article class="card rule">
          <p class="from"><a href="#/det/${d.id}">${d.name}</a>・分隊規則</p>
          <h3>${d.ability.name}</h3>
          ${textBlock(d.ability.text)}
        </article>`) : emptyState('這份軍表還沒有選分隊', '')}
      ${held.length ? html`
        <h2>強化升級</h2>
        <div class="cards">${held.map((r) => enhNames(r).filter((x) => x.info).map((x) => html`<div><p class="from">${r.u.name}</p>${enhancementCard(x.info.det, x.info.enh)}</div>`))}</div>` : ''}
      <h2>軍隊規則</h2>
      ${db.rules.armyRules.filter((r) => !r.katah).map(armyRule)}`;
  }

  const draw = () => {
    const nStrats = c.dets.length ? strats().length : 0;
    const nKatah = katahs().length;
    const badge = { strats: nStrats, katah: nKatah };
    page.innerHTML = String(html`
      <nav class="crumbs"><a href="#/list/${list.id}">‹ 編輯軍表</a></nav>
      <h1 class="play-title">${list.name}<small>${fmtPts(c.total)} 分・${c.dets.map((d) => d.name).join('、') || '未選分隊'}</small></h1>

      <div class="trackers">
        ${[COUNTERS.slice(0, 2), COUNTERS.slice(2)].map((group) => html`
          <div class="tracker">
            ${group.map(([k, label]) => html`
              <div class="counter">
                <button type="button" data-act="count" data-k="${k}" data-d="-1" aria-label="${label} 減 1">−</button>
                <span class="cv"><small>${label}</small><b data-count="${k}">${st[k]}</b></span>
                <button type="button" data-act="count" data-k="${k}" data-d="1" aria-label="${label} 加 1">＋</button>
              </div>`)}
          </div>`)}
      </div>

      <div class="actions wrap">
        <button type="button" class="btn small" data-act="next-round">下一輪</button>
        ${'wakeLock' in navigator ? html`<button type="button" class="btn small" data-act="wake" aria-pressed="${wantWake ? 'true' : 'false'}">螢幕常亮：${wantWake ? '開' : '關'}</button>` : ''}
        <button type="button" class="btn small danger" data-act="reset">新的一局</button>
      </div>

      <div class="phasebar">
        <div class="seg" role="group" aria-label="回合">
          <button type="button" data-turn="own" aria-pressed="${st.turn === 'own' ? 'true' : 'false'}">我方回合</button>
          <button type="button" data-turn="enemy" aria-pressed="${st.turn === 'enemy' ? 'true' : 'false'}">敵方回合</button>
        </div>
        <div class="chips scroll" role="group" aria-label="階段">
          <button type="button" class="chip" data-phase="all" aria-pressed="${st.phase === 'all' ? 'true' : 'false'}">全部階段</button>
          ${PHASES.map((p) => html`<button type="button" class="chip" data-phase="${p.id}" aria-pressed="${st.phase === p.id ? 'true' : 'false'}">${p.label}</button>`)}
        </div>
      </div>

      <div class="seg tabsel" role="tablist">
        ${TABS.map(([k, label]) => html`<button type="button" role="tab" data-tab="${k}" aria-selected="${st.tab === k ? 'true' : 'false'}">${label}${badge[k] !== undefined ? html`<i>${badge[k]}</i>` : ''}</button>`)}
      </div>

      <div class="play-body">${body()}</div>`);
  };

  on(page, 'click', '[data-turn]', (ev, el) => { st.turn = el.dataset.turn; save(); draw(); });
  on(page, 'click', '[data-phase]', (ev, el) => { st.phase = el.dataset.phase; save(); draw(); });
  on(page, 'click', '[data-tab]', (ev, el) => { st.tab = el.dataset.tab; save(); draw(); });

  on(page, 'click', '[data-act]', (ev, el) => {
    const act = el.dataset.act;
    if (act === 'count') {
      const k = el.dataset.k;
      const min = (COUNTERS.find((x) => x[0] === k) || [])[2] || 0;
      st[k] = Math.max(min, (Number(st[k]) || 0) + Number(el.dataset.d));
    } else if (act === 'next-round') {
      st.round = (Number(st.round) || 1) + 1;
      Object.keys(st.used).forEach((k) => { if (k.startsWith('r|')) delete st.used[k]; });
      toast(`第 ${st.round} 戰鬥輪`);
    } else if (act === 'spend') {
      const cost = Number(el.dataset.cp) || 0;
      if (st.cp < cost) { toast(`CP 不足（需要 ${cost}，目前 ${st.cp}）`); return; }
      st.cp -= cost;
      toast(`已使用「${el.dataset.name}」，剩 ${st.cp} CP`);
    } else if (act === 'wake') {
      wantWake = !wantWake;
      if (wantWake) acquireWake().then((ok) => { if (!ok) { wantWake = false; toast('這個瀏覽器目前無法保持螢幕常亮'); draw(); } });
      else releaseWake();
    } else if (act === 'reset') {
      if (!confirm('開始新的一局？戰鬥輪、CP 與 VP 都會歸零。')) return;
      st = Object.assign(defaultPlay(), { tab: st.tab });
    } else {
      return;
    }
    save();
    draw();
  });

  const onVisible = () => { if (document.visibilityState === 'visible') acquireWake(); };
  document.addEventListener('visibilitychange', onVisible);
  if (wantWake) acquireWake();

  draw();
  return () => {
    document.removeEventListener('visibilitychange', onVisible);
    releaseWake();
  };
}
