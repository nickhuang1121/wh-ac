import { html, on, fmtPts, toast } from '../util.js';
import { db } from '../data.js';
import { computeList } from '../calc.js';
import { getLists, getSettings, saveSettings } from '../store.js';

export function view(page) {
  document.title = '帝皇禁軍 11 版速查';
  const m = db.rules.meta;
  const s = getSettings();
  const lists = getLists().sort((a, b) => (b.updated || 0) - (a.updated || 0)).slice(0, 3);
  const legends = db.units.filter((u) => u.legends).length;

  page.innerHTML = String(html`
    <section class="hero">
      <h1>帝皇禁軍 <span>11 版速查</span></h1>
      <p class="muted">${m.title}（${m.edition} ${m.version}）</p>
    </section>

    <section class="tiles">
      <a class="tile" href="#/units"><b>單位數據卡</b><span>${db.units.length - legends} 個單位＋${legends} 個傳奇單位</span></a>
      <a class="tile" href="#/rules"><b>軍隊規則與分隊</b><span>御林武藝、${db.dets.length} 個分隊</span></a>
      <a class="tile" href="#/lists"><b>組軍表</b><span>自動計分、檢查、分享</span></a>
      <a class="tile" href="#/play"><b>遊玩模式</b><span>依階段查戰略技能、記錄 CP 與傷害</span></a>
    </section>

    ${lists.length ? html`
      <section>
        <h2>最近的軍表</h2>
        <ul class="rows">
          ${lists.map((l) => {
            const c = computeList(l, db);
            return html`<li><a class="row" href="#/list/${l.id}">
              <span class="grow"><b>${l.name}</b><small>${c.dets.map((d) => d.name).join('、') || '未選分隊'}・${l.entries.length} 個單位</small></span>
              <span class="pts ${c.total > l.limit ? 'over' : ''}">${fmtPts(c.total)}<small> / ${fmtPts(l.limit)}</small></span>
            </a></li>`;
          })}
        </ul>
      </section>` : ''}

    <section>
      <h2>分數版本</h2>
      <div class="card">
        <p><b>${db.points.note || '分數'}</b></p>
        <p class="muted small">版本 ${db.points.version || '—'}・${db.points.date || '—'}</p>
        ${db.usingOverride ? html`<p class="banner warn">目前使用本機自訂的分數${db.overrideStale ? '，而且網站分數已經更新過' : ''}。<a href="#/points">查看</a></p>` : ''}
        <p><a class="btn" href="#/points">查看或修改分數</a></p>
      </div>
    </section>

    <section>
      <h2>設定</h2>
      <div class="card settings">
        <label class="check"><input type="checkbox" id="set-legends" ${s.showLegends ? 'checked' : ''}> 顯示傳奇單位</label>
        <label class="field inline">外觀
          <select id="set-theme">
            <option value="dark" ${s.theme !== 'light' ? 'selected' : ''}>深色</option>
            <option value="light" ${s.theme === 'light' ? 'selected' : ''}>淺色</option>
          </select>
        </label>
      </div>
    </section>

    <section>
      <h2>原文更新日誌</h2>
      <ul class="changelog">
        ${m.changelog.map((c) => html`<li><b>${c.version}</b><time>${c.date}</time><span>${c.text}</span></li>`)}
      </ul>
    </section>

    <footer class="foot muted small">
      <p>愛好者自製的非官方工具。規則文字轉錄自《${m.title}》${m.edition} ${m.version}，僅將簡體字形轉為繁體，術語維持原文。</p>
      <p>Warhammer 40,000 與相關名稱為 Games Workshop Limited 的商標，本站與其無關。</p>
      <p>軍表與設定儲存在本機。登入後，可將選定的軍表另存到雲端。</p>
    </footer>`);

  on(page, 'change', '#set-legends', (ev, el) => {
    saveSettings(Object.assign(getSettings(), { showLegends: el.checked }));
    toast(el.checked ? '已顯示傳奇單位' : '已隱藏傳奇單位');
  });
  on(page, 'change', '#set-theme', (ev, el) => {
    saveSettings(Object.assign(getSettings(), { theme: el.value }));
    document.documentElement.dataset.theme = el.value;
  });
}
