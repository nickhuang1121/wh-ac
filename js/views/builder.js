// Army builder: one list, edited in place and saved on every change.
import { html, on, fmtPts, toast, copyText, encodeShare } from '../util.js';
import { db, minCost } from '../data.js';
import { computeList, enhEligible, enhKey, canAttach, isLeader } from '../calc.js';
import { getList, saveList, deleteList, duplicateList, packList, getSettings } from '../store.js';
import { addUnit, removeEntry, cloneEntry, sortedRows, optionLines, enhNames, attachedTo, listText } from '../listops.js';
import { openDialog, printFragment } from '../ui.js';
import { datasheet, unitThumb, detachmentMeta, emptyState } from './parts.js';
import { detachmentBody } from './rules.js';
import { backupStatus, watchBackups, connectBackups, upload, disableBackup } from '../backup.js';

const openEntries = new Set();
const LEVEL = { error: '問題', warn: '提醒', info: '說明' };

// "禁軍衛士兄弟會 #2" when the list has several of the same unit
function rowLabel(row, rows) {
  const same = rows.filter((x) => x.e.unit === row.e.unit);
  return same.length > 1 ? `${row.u.name} #${same.indexOf(row) + 1}` : row.u.name;
}

function summaryBar(list, c) {
  const over = c.total > list.limit;
  const left = list.limit - c.total;
  const pct = list.limit ? Math.min(100, Math.round((c.total / list.limit) * 100)) : 0;
  const dpOver = list.dpLimit !== null && list.dpLimit !== undefined && c.dp > list.dpLimit;
  return html`
    <div class="sum-main ${over ? 'over' : ''}">
      <b>${fmtPts(c.total)}</b><span> / ${fmtPts(list.limit)} 分</span>
      <small>${over ? `超過 ${fmtPts(-left)}` : `剩 ${fmtPts(left)}`}</small>
    </div>
    <div class="sum-side">
      <span class="${dpOver ? 'bad' : ''}">${c.dp}${list.dpLimit !== null && list.dpLimit !== undefined ? ` / ${list.dpLimit}` : ''} DP</span>
      <span>${list.entries.length} 單位</span>
    </div>
    <div class="bar" role="presentation"><i class="${over ? 'over' : ''}" style="width:${pct}%"></i></div>`;
}

function warningBox(c) {
  if (!c.warnings.length) return html`<p class="banner ok">沒有發現問題。</p>`;
  return html`<ul class="warns">${c.warnings.map((w) => html`<li class="${w.level}"><span class="lv">${LEVEL[w.level]}</span>${w.text}</li>`)}</ul>`;
}

function enhField(row, list, c) {
  const u = row.u;
  const dets = c.dets;
  const cur = (row.e.enh || [])[0] || '';
  if (!dets.length && !cur) return html`<p class="muted small">選了分隊之後，可以在這裡選強化升級。</p>`;
  const isChar = u.keywords.includes(db.build.characterKeyword);
  const taken = new Set();
  c.rows.forEach((x) => { if (x !== row) (x.e.enh || []).forEach((k) => taken.add(k)); });
  const groups = [];
  const rest = [];
  const seen = new Set();
  dets.forEach((d) => {
    const ok = [];
    d.enhancements.forEach((e) => {
      const k = enhKey(d.id, e.id);
      seen.add(k);
      const p = db.points.enhancements[k];
      const label = `${e.name}（+${p ? p.pts : 0}）${taken.has(k) ? '・已被選用' : ''}`;
      const fits = enhEligible(e, u) && (e.upgrade || isChar || !db.build.enhancementsNeedCharacter);
      if (fits) ok.push({ k, label }); else rest.push({ k, label: `${d.name}：${label}` });
    });
    if (ok.length) groups.push({ name: d.name, items: ok });
  });
  if (cur && !seen.has(cur)) {
    const info = db.enh[cur];
    rest.push({ k: cur, label: info ? `${info.det.name}：${info.enh.name}` : cur });
  }
  const opt = (i) => html`<option value="${i.k}" ${i.k === cur ? 'selected' : ''}>${i.label}</option>`;
  return html`
    <label class="field">強化升級
      <select data-f="enh" data-fk="${row.e.eid}:enh">
        <option value="">無</option>
        ${groups.map((g) => html`<optgroup label="${g.name}">${g.items.map(opt)}</optgroup>`)}
        ${rest.length ? html`<optgroup label="不符合限制（選了會提醒）">${rest.map(opt)}</optgroup>` : ''}
      </select>
    </label>`;
}

function entryCard(row, list, c) {
  const e = row.e;
  if (row.missing) {
    return html`
      <div class="entry missing" data-eid="${e.eid}">
        <p><b>${e.unit}</b>：目前的資料裡沒有這個單位。</p>
        <button type="button" class="btn small danger" data-act="rm-entry">移除</button>
      </div>`;
  }
  const u = row.u;
  const P = row.P;
  const isWarlord = list.warlord === e.eid;
  const target = attachedTo(row, c.rows);
  const leaders = c.rows.filter((x) => !x.missing && x.e.attach === e.eid);
  const enh = enhNames(row);
  const sub = [];
  if (P.models.length > 1 || row.models > 1) sub.push(`${row.models} 個模型`);
  optionLines(row).forEach((s) => sub.push(s));
  enh.forEach((x) => sub.push(`強化：${x.name}`));
  if (target && !target.missing) sub.push(`加入 ${rowLabel(target, c.rows)}`);
  if (leaders.length) sub.push(`領袖：${leaders.map((x) => x.u.name).join('、')}`);

  const targets = isLeader(u, db) ? c.rows.filter((x) => !x.missing && canAttach(u, x.u)) : [];
  const parts = [`基本 ${fmtPts(row.base)}${row.repeat ? `（你的第 ${P.extra.from} 個起的價格）` : ''}`];
  if (row.wargear) parts.push(`裝備 ${row.wargear}`);
  if (row.enh) parts.push(`強化升級 ${row.enh}`);

  return html`
    <details class="entry" data-eid="${e.eid}" ${openEntries.has(e.eid) ? 'open' : ''}>
      <summary>
        ${unitThumb(u)}
        <span class="grow">
          <b>${u.name}${isWarlord ? html` <span class="tag warlord">主將</span>` : ''}${u.legends ? html` <span class="tag legends">傳奇</span>` : ''}${row.repeat ? html` <span class="tag repeat">重複加價</span>` : ''}</b>
          <small>${sub.join('・') || u.en}</small>
        </span>
        <span class="pts">${fmtPts(row.total)}<small> 分</small></span>
      </summary>
      <div class="entry-body">
        ${P.models.length > 1 ? html`
          <label class="field">模型數
            <select data-f="models" data-fk="${e.eid}:models">
              ${P.models.map((n, i) => html`<option value="${n}" ${n === row.models ? 'selected' : ''}>${n} 個模型（${P.pts[i]} 分）</option>`)}
            </select>
          </label>` : ''}
        ${(u.options || []).map((o) => {
          const v = (e.opts || {})[o.id];
          const price = (key) => ((P.wargear || {})[key] ? `（+${P.wargear[key]}）` : '');
          if (o.toggle) {
            return html`<label class="check"><input type="checkbox" data-f="opt" data-opt="${o.id}" data-fk="${e.eid}:${o.id}" ${v ? 'checked' : ''}> ${o.label}${price(`${o.id}:on`)}</label>`;
          }
          return html`
            <label class="field">${o.label}
              <select data-f="opt" data-opt="${o.id}" data-fk="${e.eid}:${o.id}">
                ${o.choices.map((ch, i) => html`<option value="${ch.id}" ${(v === ch.id || (!v && i === 0)) ? 'selected' : ''}>${ch.label}${price(`${o.id}:${ch.id}`)}</option>`)}
                ${o.perModel ? html`<option value="mixed" ${v === 'mixed' ? 'selected' : ''}>混搭（各模型不同）</option>` : ''}
              </select>
            </label>`;
        })}
        ${enhField(row, list, c)}
        ${targets.length ? html`
          <label class="field">加入單位
            <select data-f="attach" data-fk="${e.eid}:attach">
              <option value="">不加入</option>
              ${targets.map((x) => html`<option value="${x.e.eid}" ${e.attach === x.e.eid ? 'selected' : ''}>${rowLabel(x, c.rows)}</option>`)}
            </select>
          </label>` : ''}
        ${u.keywords.includes(db.build.characterKeyword) ? html`<label class="check"><input type="checkbox" data-f="warlord" data-fk="${e.eid}:warlord" ${isWarlord ? 'checked' : ''}> 設為主將</label>` : ''}
        <label class="field">備註
          <input type="text" data-f="note" value="${e.note || ''}" maxlength="200" placeholder="例如：模型配裝、戰術提醒" autocomplete="off">
        </label>
        <p class="muted small cost">${parts.join(' ＋ ')}</p>
        <div class="actions">
          <a class="btn small" href="#/unit/${u.id}">數據卡</a>
          <button type="button" class="btn small" data-act="dup-entry">再加一個</button>
          <button type="button" class="btn small danger" data-act="rm-entry">移除</button>
        </div>
      </div>
    </details>`;
}

function printable(list, full) {
  const c = computeList(list, db);
  const rows = sortedRows(c.rows).filter((r) => !r.missing);
  const distinct = [];
  rows.forEach((r) => { if (!distinct.includes(r.u)) distinct.push(r.u); });
  return html`
    <div class="print-list">
      <h1>${list.name}</h1>
      <p>${fmtPts(c.total)} / ${fmtPts(list.limit)} 分　｜　分隊：${c.dets.map((d) => `${d.name}（${(db.points.detachments[d.id] || {}).dp || 0} DP）`).join('、') || '未選擇'}</p>
      <table class="plist">
        <thead><tr><th>單位</th><th>配置</th><th>分數</th></tr></thead>
        <tbody>
          ${rows.map((r) => {
            const t = attachedTo(r, c.rows);
            const lines = optionLines(r).concat(enhNames(r).map((x) => `強化升級：${x.name}（+${x.pts}）`));
            if (t && !t.missing) lines.push(`加入：${t.u.name}`);
            if (r.e.note) lines.push(`備註：${r.e.note}`);
            return html`<tr>
              <td><b>${r.u.name}</b>${r.P.models.length > 1 || r.models > 1 ? ` ×${r.models}` : ''}${list.warlord === r.e.eid ? '［主將］' : ''}</td>
              <td>${lines.map((l) => html`<div>${l}</div>`)}</td>
              <td class="num">${fmtPts(r.total)}</td>
            </tr>`;
          })}
        </tbody>
      </table>
      <p class="small">分數版本：${db.points.version || ''}（${db.points.date || ''}）${db.usingOverride ? '・本機自訂' : ''}</p>
      ${full ? html`
        ${c.dets.map((d) => html`<section class="pbreak"><h1>${d.name}</h1>${detachmentBody(d)}</section>`)}
        ${distinct.map((u) => html`<section class="pbreak">${datasheet(u, { photo: false })}</section>`)}` : ''}
    </div>`;
}

export function view(page, id) {
  const list = getList(id);
  if (!list) {
    page.innerHTML = String(html`${emptyState('找不到這份軍表', '它可能已經被刪除，或是存在另一台裝置上。')}<p><a class="btn" href="#/lists">回軍表</a></p>`);
    return;
  }
  document.title = `${list.name} · 軍表`;
  const presets = db.build.pointsPresets || [2000];

  const save = () => { if (!saveList(list)) toast('儲存失敗：瀏覽器的儲存空間可能已滿或被停用'); };

  const refreshBackup = () => {
    const button = page.querySelector('[data-act="backup"]');
    if (!button) return;
    const { enabled, busy, status, user } = backupStatus(list);
    button.textContent = user ? '立即上傳' : '登入並上傳';
    button.disabled = busy;
    const toggle = page.querySelector('#b-auto-backup');
    toggle.checked = enabled;
    toggle.disabled = busy;
    page.querySelector('#b-backup-status').textContent = status;
    page.querySelector('#b-backup-account').textContent = user?.email || '';
  };

  const refresh = () => {
    const c = computeList(list, db);
    page.querySelector('#b-summary').innerHTML = String(summaryBar(list, c));
    page.querySelector('#b-warn').innerHTML = String(warningBox(c));
    return c;
  };

  const draw = () => {
    const fk = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.fk : null;
    // the toggle event is asynchronous, so read the cards' current state before replacing them
    page.querySelectorAll('details.entry').forEach((d) => { if (d.open) openEntries.add(d.dataset.eid); else openEntries.delete(d.dataset.eid); });
    const c = computeList(list, db);
    const rows = sortedRows(c.rows);
    const limits = presets.includes(list.limit) ? presets : presets.concat([list.limit]).sort((a, b) => a - b);
    page.innerHTML = String(html`
      <nav class="crumbs"><a href="#/lists">‹ 軍表</a></nav>
      <div class="b-head">
        <input type="text" id="l-name" class="title-input" value="${list.name}" maxlength="60" aria-label="軍表名稱" autocomplete="off">
        <div class="b-settings">
          <label class="field inline">分數上限
            <select id="l-limit" data-fk="limit">
              ${limits.map((n) => html`<option value="${n}" ${n === list.limit ? 'selected' : ''}>${fmtPts(n)}</option>`)}
              <option value="custom">自訂…</option>
            </select>
          </label>
          <label class="field inline">DP 上限
            <input type="number" id="l-dp" min="0" max="99" step="1" inputmode="numeric" value="${list.dpLimit === null || list.dpLimit === undefined ? '' : list.dpLimit}" placeholder="不限">
          </label>
        </div>
      </div>

      <div class="summary" id="b-summary">${summaryBar(list, c)}</div>
      <div class="actions wrap">
        <button type="button" class="btn" data-act="backup">立即上傳</button>
        <label class="check"><input type="checkbox" id="b-auto-backup">自動備份這份軍表</label>
        <span class="muted small" id="b-backup-account"></span>
        <span class="small" id="b-backup-status" role="status"></span>
      </div>

      <section>
        <h2>分隊</h2>
        ${c.dets.length ? html`
          <ul class="rows">
            ${c.dets.map((d) => html`<li class="with-side">
              <a class="row det" href="#/det/${d.id}"><span class="grow"><b>${d.name}</b>${detachmentMeta(d)}</span></a>
              <button type="button" class="btn small danger" data-act="rm-det" data-id="${d.id}" aria-label="移除分隊 ${d.name}">移除</button>
            </li>`)}
          </ul>` : ''}
        <div class="actions"><button type="button" class="btn" data-act="add-det">${c.dets.length ? '更改分隊' : '＋ 選擇分隊'}</button></div>
      </section>

      <section>
        <h2>檢查</h2>
        <div id="b-warn">${warningBox(c)}</div>
        <p class="muted small">檢查只是提醒，不會阻止你組表；請以你們使用的核心規則與賽制為準。</p>
      </section>

      <section>
        <h2>單位<span class="count">${list.entries.length}</span></h2>
        ${rows.length ? html`<div class="entries">${rows.map((r) => entryCard(r, list, c))}</div>` : emptyState('還沒有單位', '按下方的按鈕開始加入單位。')}
        <div class="actions"><button type="button" class="btn primary" data-act="add-unit">＋ 新增單位</button></div>
      </section>

      <section>
        <h2>使用這份軍表</h2>
        <div class="actions wrap">
          <a class="btn primary" href="#/play/${list.id}">進入遊玩模式</a>
          <a class="btn" href="#/cloud/${list.id}">雲端軍表</a>
          <button type="button" class="btn" data-act="share">複製分享連結</button>
          <button type="button" class="btn" data-act="copy">複製文字版</button>
          <button type="button" class="btn" data-act="print">列印軍表</button>
          <button type="button" class="btn" data-act="print-full">列印軍表＋規則與數據卡</button>
          <button type="button" class="btn" data-act="dup-list">複製成新軍表</button>
          <button type="button" class="btn danger" data-act="del-list">刪除軍表</button>
        </div>
      </section>`);
    refreshBackup();
    if (fk) {
      const el = page.querySelector(`[data-fk="${CSS.escape(fk)}"]`);
      if (el) el.focus({ preventScroll: true });
    }
  };

  // remember which entry cards are open (the toggle event does not bubble)
  page.addEventListener('toggle', (ev) => {
    const el = ev.target;
    if (!(el instanceof HTMLDetailsElement) || !el.dataset.eid) return;
    if (el.open) openEntries.add(el.dataset.eid); else openEntries.delete(el.dataset.eid);
  }, true);

  // text / number inputs: save and refresh the totals only, so the control being typed in survives
  on(page, 'input', '#l-name', (ev, el) => { list.name = el.value.trim() || '新軍表'; save(); document.title = `${list.name} · 軍表`; });
  on(page, 'input', '#l-dp', (ev, el) => {
    const v = el.value.trim();
    const n = Number(v);
    list.dpLimit = v === '' || !Number.isFinite(n) || n < 0 ? null : Math.floor(n);
    save();
    refresh();
  });
  on(page, 'input', '[data-f="note"]', (ev, el) => {
    const e = list.entries.find((x) => x.eid === el.closest('[data-eid]').dataset.eid);
    if (e) { e.note = el.value; save(); }
  });

  on(page, 'change', '#b-auto-backup', (ev, el) => {
    if (el.checked) upload(id, 'enable', list);
    else disableBackup(id);
  });
  on(page, 'change', '#l-limit', (ev, el) => {
    if (el.value === 'custom') {
      const v = prompt('分數上限', String(list.limit));
      const n = Math.floor(Number(v));
      if (v !== null && Number.isFinite(n) && n > 0 && n <= 100000) list.limit = n;
    } else {
      list.limit = Number(el.value);
    }
    save();
    draw();
  });

  on(page, 'change', 'select[data-f], input[type="checkbox"][data-f]', (ev, el) => {
    const eid = el.closest('[data-eid]').dataset.eid;
    const e = list.entries.find((x) => x.eid === eid);
    if (!e) return;
    const f = el.dataset.f;
    if (f === 'models') e.models = Number(el.value);
    else if (f === 'opt') { e.opts = e.opts || {}; e.opts[el.dataset.opt] = el.type === 'checkbox' ? el.checked : el.value; }
    else if (f === 'enh') e.enh = el.value ? [el.value] : [];
    else if (f === 'attach') e.attach = el.value || null;
    else if (f === 'warlord') list.warlord = el.checked ? eid : (list.warlord === eid ? null : list.warlord);
    save();
    draw();
  });

  on(page, 'click', '[data-act]', (ev, el) => {
    const act = el.dataset.act;
    const holder = el.closest('[data-eid]');
    const eid = holder ? holder.dataset.eid : null;
    if (act === 'backup') return upload(id, 'manual', list);
    if (act === 'add-unit') return unitPicker(list, save, draw);
    if (act === 'add-det') return detPicker(list, save, draw);
    if (act === 'rm-det') { list.dets = list.dets.filter((d) => d !== el.dataset.id); save(); return draw(); }
    if (act === 'dup-entry') {
      const copy = cloneEntry(list, eid);
      if (copy) { openEntries.add(copy.eid); save(); draw(); toast('已再加入一個'); }
      return undefined;
    }
    if (act === 'rm-entry') { removeEntry(list, eid); openEntries.delete(eid); save(); return draw(); }
    if (act === 'share') {
      const url = `${location.href.split('#')[0]}#/import/${encodeShare(packList(list))}`;
      return copyText(url).then((ok) => toast(ok ? '已複製分享連結' : '無法複製，請手動複製網址列'));
    }
    if (act === 'copy') return copyText(listText(list)).then((ok) => toast(ok ? '已複製文字版軍表' : '無法複製'));
    if (act === 'print') return printFragment(printable(list, false));
    if (act === 'print-full') return printFragment(printable(list, true));
    if (act === 'dup-list') {
      const c = duplicateList(list.id);
      if (c) { toast(`已複製為「${c.name}」`); location.hash = `#/list/${c.id}`; }
      return undefined;
    }
    if (act === 'del-list') {
      if (confirm(`刪除「${list.name}」？這個動作無法復原。`)) { deleteList(list.id); location.hash = '#/lists'; }
    }
    return undefined;
  });

  draw();
  const stopWatching = watchBackups(refreshBackup);
  connectBackups().catch(() => {}); // Local editing remains available offline.
  return stopWatching;
}

// ── pickers ──

function unitPicker(list, save, done) {
  const units = getSettings().showLegends ? db.units : db.units.filter((u) => !u.legends);
  const count = (id) => list.entries.filter((e) => e.unit === id).length;
  const rows = (q) => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const hit = units.filter((u) => {
      const hay = [u.name, u.en, u.keywords.join(' '), u.group].join(' ').toLowerCase();
      return words.every((w) => hay.includes(w));
    });
    if (!hit.length) return html`<p class="muted">沒有符合的單位。</p>`;
    let section = null;
    return html`<ul class="rows">${hit.map((u) => {
      const P = db.points.units[u.id];
      const head = u.section !== section ? html`<li class="sec">${u.section}</li>` : '';
      section = u.section;
      const n = count(u.id);
      return html`${head}<li><div class="row unit static">
        ${unitThumb(u)}
        <span class="grow"><b>${u.name}</b><small>${u.group}・${u.en}</small>${P && P.extra ? html`<small>你的第 ${P.extra.from} 個起 ${P.extra.pts.join(' / ')} 分</small>` : ''}</span>
        <span class="pick-side">
          <span class="pts">${P ? fmtPts(minCost(P)) : '—'}<small>${P && P.pts.length > 1 ? ' 起' : ' 分'}</small><em class="have" data-have="${u.id}">${n ? `已有 ${n}` : ''}</em></span>
          <span class="row-acts">
            <button type="button" class="btn icon primary" data-add="${u.id}" title="加入軍表" aria-label="把「${u.name}」加入軍表"><i class="fa-solid fa-plus" aria-hidden="true"></i></button>
            <button type="button" class="btn icon" data-info="${u.id}" title="單位資訊" aria-label="查看「${u.name}」的單位資訊"><i class="fa-solid fa-circle-info" aria-hidden="true"></i></button>
          </span>
        </span>
      </div></li>`;
    })}</ul>`;
  };
  const d = openDialog({
    title: '新增單位',
    wide: true,
    body: html`
      <input type="search" class="dlg-search" placeholder="篩選名稱或關鍵詞" aria-label="篩選單位" autocomplete="off">
      <div class="dlg-list">${rows('')}</div>
      <p class="muted small">加號把單位加入軍表，可以連續加。資訊按鈕會先打開數據卡。加完按右上角關閉。</p>`,
  });
  const out = d.querySelector('.dlg-list');
  const markHave = (id) => {
    const n = count(id);
    d.querySelectorAll(`[data-have="${CSS.escape(id)}"]`).forEach((el) => { el.textContent = n ? `已有 ${n}` : ''; });
  };
  const add = (u) => {
    addUnit(list, u.id);
    save();
    markHave(u.id);
    toast(`已加入 ${u.name}`);
  };
  on(d, 'input', '.dlg-search', (ev, el) => { out.innerHTML = String(rows(el.value.trim())); });
  on(d, 'click', '[data-add]', (ev, el) => add(db.unit[el.dataset.add]));
  on(d, 'click', '[data-info]', (ev, el) => openUnitInfo(db.unit[el.dataset.info], add));
  d.addEventListener('close', done);
}

function openUnitInfo(u, onAdd) {
  const d = openDialog({
    title: '單位資訊',
    wide: true,
    body: html`
      <div class="actions top">
        <button type="button" class="btn primary" data-add-here><i class="fa-solid fa-plus" aria-hidden="true"></i>加入軍表</button>
      </div>
      ${datasheet(u)}`,
  });
  on(d, 'click', '[data-add-here]', () => onAdd(u));
}

function detPicker(list, save, done) {
  const d = openDialog({
    title: '選擇分隊',
    wide: true,
    body: html`
      <ul class="rows">
        ${db.dets.map((x) => html`<li><button type="button" class="row det pick" data-det="${x.id}" aria-pressed="${list.dets.includes(x.id) ? 'true' : 'false'}">
          <span class="grow"><b>${x.name}</b><small>${x.en}</small>${detachmentMeta(x)}<small>分隊規則：${x.ability.name}</small></span>
          <span class="tick" aria-hidden="true">✓</span>
        </button></li>`)}
      </ul>
      <p class="muted small">可以複選；DP 是否足夠、唯一標籤是否衝突會顯示在「檢查」。</p>`,
  });
  on(d, 'click', '[data-det]', (ev, el) => {
    const id = el.dataset.det;
    const onNow = list.dets.includes(id);
    list.dets = onNow ? list.dets.filter((x) => x !== id) : list.dets.concat([id]);
    el.setAttribute('aria-pressed', onNow ? 'false' : 'true');
    save();
  });
  d.addEventListener('close', done);
}
