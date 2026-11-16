// Points editor: change numbers, try them on this device, download a new data/points.json.
import { html, on, toast, download } from '../util.js';
import { db, applyOverride, pointsStamp } from '../data.js';
import { validatePoints, formatPoints } from '../calc.js';
import { saveOverride, clearOverride } from '../store.js';

const SEP = '|';
const copy = (o) => JSON.parse(JSON.stringify(o));
const getPath = (obj, path) => path.split(SEP).reduce((o, k) => (o === null || o === undefined ? undefined : o[k]), obj);
function setPath(obj, path, value) {
  const keys = path.split(SEP);
  const last = keys.pop();
  const holder = keys.reduce((o, k) => o[k], obj);
  holder[last] = value;
}

// number of leaf values that differ between two points objects
function diffCount(a, b) {
  if (a === b) return 0;
  const objA = a !== null && typeof a === 'object';
  const objB = b !== null && typeof b === 'object';
  if (!objA && !objB) return 1;
  if (!objA || !objB) return Math.max(1, objA ? Object.keys(a).length : Object.keys(b).length);
  const keys = new Set(Object.keys(a).concat(Object.keys(b)));
  let n = 0;
  keys.forEach((k) => { n += diffCount(a[k], b[k]); });
  return n;
}

export function view(page) {
  document.title = '分數 · 帝皇禁軍';
  let draft = copy(db.points);
  const site = db.sitePoints;

  const num = (path, label, opts) => {
    const o = opts || {};
    const v = getPath(draft, path);
    const changed = v !== getPath(site, path);
    return html`<label class="pf ${o.cls || ''}"><span>${label}</span><input type="number" inputmode="numeric" min="${o.min || 0}" step="1" data-path="${path}" value="${v === null || v === undefined ? '' : v}" class="${changed ? 'changed' : ''}" aria-label="${o.aria || label}"></label>`;
  };

  const unitCard = (u) => {
    const P = draft.units[u.id];
    const sizes = P.models.length > 1;
    const choices = [];
    (u.options || []).forEach((o) => {
      if (o.toggle) choices.push({ key: `${o.id}:on`, label: o.label });
      else o.choices.forEach((ch) => choices.push({ key: `${o.id}:${ch.id}`, label: `${o.label}：${ch.label}` }));
    });
    const wg = P.wargear || {};
    const siteWg = (site.units[u.id] || {}).wargear || {};
    return html`
      <div class="pe" data-unit="${u.id}">
        <div class="pe-name"><a href="#/unit/${u.id}">${u.name}</a>${u.legends ? html` <span class="tag legends">傳奇</span>` : ''}</div>
        <div class="pe-row">
          ${sizes ? html`<span class="pe-lbl">分數</span>` : ''}
          ${P.pts.map((p, i) => num(`units${SEP}${u.id}${SEP}pts${SEP}${i}`, sizes ? `${P.models[i]} 模型` : '分數', { aria: `${u.name} ${P.models[i]} 個模型的分數` }))}
        </div>
        ${P.extra ? html`
          <div class="pe-row">
            ${num(`units${SEP}${u.id}${SEP}extra${SEP}from`, '你的第幾個起', { cls: 'narrow', min: 2, aria: `${u.name} 從第幾個起適用重複價` })}
            ${P.extra.pts.map((p, i) => num(`units${SEP}${u.id}${SEP}extra${SEP}pts${SEP}${i}`, sizes ? `${P.models[i]} 模型` : '每個', { aria: `${u.name} ${P.models[i]} 個模型的重複價` }))}
            <button type="button" class="btn small" data-act="extra-off">取消加價</button>
          </div>` : html`
          <div class="pe-row"><button type="button" class="btn small ghost" data-act="extra-on">＋ 設定「你的第 N 個起」的價格</button></div>`}
        ${choices.length ? html`
          <details class="pe-wg" ${Object.keys(wg).length ? 'open' : ''}>
            <summary>裝備加價${Object.keys(wg).length ? html`<span class="count">${Object.keys(wg).length}</span>` : ''}</summary>
            ${choices.map((ch) => html`<label class="pf wide"><span>${ch.label}</span><input type="number" inputmode="numeric" min="0" step="1" data-wg="${ch.key}" value="${wg[ch.key] || ''}" placeholder="0" class="${(wg[ch.key] || 0) !== (siteWg[ch.key] || 0) ? 'changed' : ''}"></label>`)}
          </details>` : ''}
      </div>`;
  };

  const status = () => {
    if (!db.usingOverride) return html`<p class="banner ok">這台裝置使用網站發佈的分數：版本 ${site.version || '—'}（${site.date || '—'}）。</p>`;
    return html`<p class="banner warn">這台裝置正在使用<b>本機自訂</b>的分數（只有這台裝置看得到）。${db.overrideStale ? html`<br>注意：網站分數已經更新為版本 ${site.version || '—'}（${site.date || '—'}），本機自訂的內容是根據舊版改的；按「還原為網站分數」可改用新版。` : ''}</p>`;
  };

  const draw = () => {
    const sections = [];
    db.units.forEach((u) => {
      let s = sections.find((x) => x.name === u.section);
      if (!s) sections.push(s = { name: u.section, units: [] });
      s.units.push(u);
    });
    const n = diffCount(draft, site);
    page.innerHTML = String(html`
      <h1>分數</h1>
      <div id="p-status">${status()}</div>

      <details class="card help">
        <summary>怎麼更新整個網站的分數</summary>
        <ol>
          <li>在這一頁改好數字，記得一併更新下面的「版本」與「日期」。</li>
          <li>按「下載 points.json」。</li>
          <li>用下載的檔案取代專案裡的 <code>data/points.json</code>，commit 後 push 到 GitHub。</li>
          <li>GitHub Pages 更新後，所有裝置重新整理就會拿到新分數；已存的軍表只記單位與選項，會自動用新分數重算。</li>
        </ol>
        <p class="muted small">也可以直接用編輯器改 <code>data/points.json</code>：每個單位一行，<code>models</code> 是可選的模型數、<code>pts</code> 是對應分數、<code>extra</code> 是「你的第 N 個起」的價格、<code>wargear</code> 是裝備加價。</p>
        <p class="muted small">下方的「套用到本機」只會改這台裝置看到的分數，方便先試算，不會影響其他人；「匯入」可載入一份 points.json 來檢視或繼續修改；「還原」會丟掉本機的修改，改回網站發佈的分數。</p>
      </details>

      <section>
        <h2>版本</h2>
        <div class="card pe-meta">
          <label class="field">版本<input type="text" data-path="version" data-text value="${draft.version || ''}" autocomplete="off"></label>
          <label class="field">日期<input type="date" data-path="date" data-text value="${draft.date || ''}"></label>
          <label class="field grow">說明<input type="text" data-path="note" data-text value="${draft.note || ''}" autocomplete="off"></label>
        </div>
      </section>

      ${sections.map((s) => html`
        <section>
          <h2>${s.name}<span class="count">${s.units.length}</span></h2>
          <div class="pe-grid">${s.units.map(unitCard)}</div>
        </section>`)}

      <section>
        <h2>分隊 DP</h2>
        <div class="card pe-list">
          ${db.dets.map((d) => num(`detachments${SEP}${d.id}${SEP}dp`, d.name, { cls: 'line', aria: `${d.name} 的 DP` }))}
        </div>
      </section>

      <section>
        <h2>強化升級</h2>
        ${db.dets.map((d) => html`
          <div class="card pe-list">
            <h3>${d.name}</h3>
            ${d.enhancements.map((e) => num(`enhancements${SEP}${d.id}/${e.id}${SEP}pts`, e.name, { cls: 'line', aria: `${d.name}：${e.name} 的分數` }))}
          </div>`)}
      </section>

      <div class="savebar">
        <span id="p-count" class="${n ? 'bad' : 'muted'}">${n ? `與網站分數有 ${n} 處不同` : '與網站分數相同'}</span>
        <div class="actions wrap">
          <button type="button" class="btn small primary" data-act="apply">套用到本機</button>
          <button type="button" class="btn small" data-act="download">下載 points.json</button>
          <button type="button" class="btn small" data-act="import">匯入</button>
          <button type="button" class="btn small danger" data-act="reset">還原</button>
        </div>
        <input type="file" id="p-file" accept=".json,application/json" hidden>
      </div>`);
  };

  const recount = () => {
    const n = diffCount(draft, site);
    const el = page.querySelector('#p-count');
    el.textContent = n ? `與網站分數有 ${n} 處不同` : '與網站分數相同';
    el.className = n ? 'bad' : 'muted';
  };
  const problems = () => {
    const errs = validatePoints(draft, db);
    if (errs.length) alert(`分數資料有問題，請先修正：\n\n${errs.slice(0, 8).join('\n')}${errs.length > 8 ? `\n…還有 ${errs.length - 8} 項` : ''}`);
    return errs.length > 0;
  };

  on(page, 'input', '[data-path]', (ev, el) => {
    const path = el.dataset.path;
    let v;
    if (el.hasAttribute('data-text')) {
      v = el.value;
    } else {
      const n = Number(el.value);
      v = el.value.trim() === '' || !Number.isFinite(n) || n < 0 ? null : n;
      el.classList.toggle('invalid', v === null);
    }
    setPath(draft, path, v);
    el.classList.toggle('changed', v !== getPath(site, path));
    recount();
  });
  on(page, 'input', '[data-wg]', (ev, el) => {
    const id = el.closest('[data-unit]').dataset.unit;
    const P = draft.units[id];
    const n = Math.floor(Number(el.value));
    P.wargear = P.wargear || {};
    if (Number.isFinite(n) && n > 0) P.wargear[el.dataset.wg] = n; else delete P.wargear[el.dataset.wg];
    if (!Object.keys(P.wargear).length) delete P.wargear;
    const before = ((site.units[id] || {}).wargear || {})[el.dataset.wg] || 0;
    el.classList.toggle('changed', ((P.wargear || {})[el.dataset.wg] || 0) !== before);
    recount();
  });

  on(page, 'click', '[data-act]', (ev, el) => {
    const act = el.dataset.act;
    const holder = el.closest('[data-unit]');
    if (act === 'extra-on') {
      const P = draft.units[holder.dataset.unit];
      const old = (site.units[holder.dataset.unit] || {}).extra;
      P.extra = old ? copy(old) : { from: 2, pts: P.pts.slice() };
      draw();
    } else if (act === 'extra-off') {
      delete draft.units[holder.dataset.unit].extra;
      draw();
    } else if (act === 'apply') {
      if (problems()) return;
      if (diffCount(draft, site) === 0) {
        clearOverride();
        applyOverride();
        toast('與網站分數相同，已改回使用網站分數');
      } else if (saveOverride({ base: pointsStamp(site), points: copy(draft) })) {
        applyOverride();
        toast('已套用到這台裝置，軍表會用新分數計算');
      } else {
        toast('儲存失敗：瀏覽器的儲存空間可能已滿或被停用');
      }
      page.querySelector('#p-status').innerHTML = String(status());
    } else if (act === 'download') {
      if (problems()) return;
      download('points.json', formatPoints(draft), 'application/json');
      toast('已下載，請用它取代專案裡的 data/points.json');
    } else if (act === 'import') {
      page.querySelector('#p-file').click();
    } else if (act === 'reset') {
      if (!confirm('還原為網站發佈的分數？這一頁尚未下載的修改與本機自訂的分數都會消失。')) return;
      clearOverride();
      applyOverride();
      draft = copy(db.points);
      draw();
      toast('已還原為網站分數');
    }
  });

  on(page, 'change', '#p-file', (ev, el) => {
    const file = el.files && el.files[0];
    if (!file) return;
    file.text().then((text) => {
      let data;
      try { data = JSON.parse(text); } catch (e) { alert('這個檔案不是有效的 JSON。'); return; }
      const errs = validatePoints(data, db);
      if (errs.length) { alert(`這個檔案不能直接使用：\n\n${errs.slice(0, 8).join('\n')}`); return; }
      draft = data;
      draw();
      toast('已載入檔案內容，確認後按「套用到本機」');
    });
  });

  draw();
}
