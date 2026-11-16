// In-game companion for one list: trackers, phase-filtered stratagems and Ka'tah, unit cards.
import { html, on, textBlock, toast, fmtPts } from '../util.js';
import { db } from '../data.js';
import { computeList } from '../calc.js';
import { getList, getLists, getPlay, savePlay, defaultPlay } from '../store.js';
import { sortedRows, optionLines, enhNames } from '../listops.js';
import { PHASES, matchTiming, statBar, weaponTables, abilityList, stratagemCard, katahCard, enhancementCard, emptyState } from './parts.js';
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
  const hasKatah = (u) => Boolean(katahRule) && u.factionAbilities.includes(katahRule.name);
  const wounds = (r) => {
    const per = parseInt(r.u.stats.W, 10) || 1;
    const total = per * r.models;
    const lost = Math.min(total, Math.max(0, st.lost[r.e.eid] || 0));
    return { per, total, lost, remain: total - lost, alive: Math.ceil((total - lost) / per) };
  };
  // once-per-battle / once-per-round abilities; army-wide ones are shared by every copy of the unit
  const onceKey = (r, a, i) => `${a.once === 'round' ? 'r' : 'b'}|${a.limit && a.limit.includes('全軍') ? r.u.id : r.e.eid}|${i}`;

  // leaders are shown together with the unit they joined
  const groups = [];
  rows.forEach((r) => {
    if (r.e.attach && rows.some((x) => x.e.eid === r.e.attach)) return;
    groups.push([].concat(rows.filter((x) => x.e.attach === r.e.eid), [r]));
  });

  const strats = () => {
    const out = [];
    c.dets.forEach((d) => d.stratagems.forEach((s) => { if (matchTiming(s.t, st.phase, st.turn)) out.push({ d, s }); }));
    return out;
  };
  const katahs = () => (katahRule ? katahRule.katah.filter((k) => matchTiming(k.t, st.phase, st.turn)) : []);

  function unitCard(r) {
    const u = r.u;
    const eid = r.e.eid;
    const w = wounds(r);
    const enh = enhNames(r);
    const sub = optionLines(r).concat(enh.map((x) => `強化：${x.name}`));
    const once = u.abilities.map((a, i) => ({ a, i })).filter((x) => x.a.once);
    return html`
      <article class="pu ${w.remain === 0 ? 'dead' : ''}" data-eid="${eid}">
        <header>
          <div class="grow">
            <h3>${u.name}${list.warlord === eid ? html` <span class="tag warlord">主將</span>` : ''}${w.remain === 0 ? html` <span class="tag dead">已全滅</span>` : ''}</h3>
            ${sub.length ? html`<small>${sub.join('・')}</small>` : ''}
            ${r.e.note ? html`<small class="unote">${r.e.note}</small>` : ''}
          </div>
          ${hasKatah(u) ? html`<button type="button" class="chip ready" data-act="ready" aria-pressed="${st.ready[eid] ? 'true' : 'false'}">${st.ready[eid] ? '備戰中' : '未備戰'}</button>` : ''}
        </header>
        ${statBar(u)}
        <div class="wounds">
          <button type="button" class="btn icon" data-act="dmg" data-d="1" aria-label="失去 1 點耐傷" ${w.remain === 0 ? 'disabled' : ''}>−</button>
          <span class="wnum"><b>${w.remain}</b> / ${w.total} W${r.models > 1 ? html`<small>${w.alive} / ${r.models} 個模型</small>` : ''}</span>
          <button type="button" class="btn icon" data-act="dmg" data-d="-1" aria-label="回復 1 點耐傷" ${w.lost === 0 ? 'disabled' : ''}>＋</button>
        </div>
        ${once.length ? html`
          <div class="once">
            ${once.map((x) => html`<label class="check ${st.used[onceKey(r, x.a, x.i)] ? 'used' : ''}">
              <input type="checkbox" data-once="${onceKey(r, x.a, x.i)}" ${st.used[onceKey(r, x.a, x.i)] ? 'checked' : ''}>
              <span>${x.a.name}<small>${x.a.limit || (x.a.once === 'round' ? '每輪一次' : '每場一次')}</small></span>
            </label>`)}
          </div>` : ''}
        <details data-open="${eid}" ${st.open[eid] ? 'open' : ''}>
          <summary>武器與技能</summary>
          ${weaponTables(u)}
          ${abilityList(u)}
          ${enh.filter((x) => x.info).map((x) => html`<h4 class="wt">強化升級</h4>${enhancementCard(x.info.det, x.info.enh)}`)}
          <p><a href="#/unit/${u.id}">完整數據卡 ›</a></p>
        </details>
      </article>`;
  }

  function body() {
    if (st.tab === 'units') {
      if (!rows.length) return emptyState('這份軍表還沒有單位', html`<a class="btn" href="#/list/${list.id}">去加入單位</a>`);
      return html`<div class="pgroups">${groups.map((g) => html`<div class="pgroup ${g.length > 1 ? 'joined' : ''}">
        ${g.length > 1 ? html`<p class="joined-label">合併單位</p>` : ''}${g.map(unitCard)}</div>`)}</div>`;
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
      const readyCount = rows.filter((r) => hasKatah(r.u) && st.ready[r.e.eid]).length;
      return html`
        <p class="muted small">${readyCount} 個單位備戰中。單位使用武藝後不再處於備戰狀態，記得在「單位」分頁把它切回未備戰。</p>
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
    // the toggle event is asynchronous, so read the cards' current state before replacing them
    page.querySelectorAll('details[data-open]').forEach((d) => { if (d.open) st.open[d.dataset.open] = true; else delete st.open[d.dataset.open]; });
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
        <button type="button" class="btn small" data-act="ready-all">全軍進入備戰</button>
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

  page.addEventListener('toggle', (ev) => {
    const el = ev.target;
    if (!(el instanceof HTMLDetailsElement) || !el.dataset.open) return;
    if (el.open) st.open[el.dataset.open] = true; else delete st.open[el.dataset.open];
    save();
  }, true);

  on(page, 'click', '[data-turn]', (ev, el) => { st.turn = el.dataset.turn; save(); draw(); });
  on(page, 'click', '[data-phase]', (ev, el) => { st.phase = el.dataset.phase; save(); draw(); });
  on(page, 'click', '[data-tab]', (ev, el) => { st.tab = el.dataset.tab; save(); draw(); });
  on(page, 'change', '[data-once]', (ev, el) => {
    if (el.checked) st.used[el.dataset.once] = true; else delete st.used[el.dataset.once];
    save();
    draw();
  });

  on(page, 'click', '[data-act]', (ev, el) => {
    const act = el.dataset.act;
    const holder = el.closest('[data-eid]');
    const eid = holder ? holder.dataset.eid : null;
    if (act === 'count') {
      const k = el.dataset.k;
      const min = (COUNTERS.find((x) => x[0] === k) || [])[2] || 0;
      st[k] = Math.max(min, (Number(st[k]) || 0) + Number(el.dataset.d));
    } else if (act === 'next-round') {
      st.round = (Number(st.round) || 1) + 1;
      Object.keys(st.used).forEach((k) => { if (k.startsWith('r|')) delete st.used[k]; });
      toast(`第 ${st.round} 戰鬥輪：每輪一次的技能已重置`);
    } else if (act === 'ready-all') {
      rows.forEach((r) => { if (hasKatah(r.u) && wounds(r).remain > 0) st.ready[r.e.eid] = true; });
      toast(`擁有${katahRule ? katahRule.name : '武藝'}的單位已進入備戰狀態`);
    } else if (act === 'ready') {
      if (st.ready[eid]) delete st.ready[eid]; else st.ready[eid] = true;
    } else if (act === 'dmg') {
      const r = rows.find((x) => x.e.eid === eid);
      if (!r) return;
      const w = wounds(r);
      st.lost[eid] = Math.min(w.total, Math.max(0, w.lost + Number(el.dataset.d)));
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
      if (!confirm('開始新的一局？戰鬥輪、CP、VP、傷害與已使用的技能都會歸零。')) return;
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
