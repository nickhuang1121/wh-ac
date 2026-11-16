import { html, on, fmtPts, toast, decodeShare } from '../util.js';
import { db } from '../data.js';
import { computeList } from '../calc.js';
import { getLists, saveList, deleteList, newList, duplicateList, unpackList } from '../store.js';
import { listText } from '../listops.js';
import { emptyState } from './parts.js';

export function listRow(l, href) {
  const c = computeList(l, db);
  const errors = c.warnings.filter((w) => w.level === 'error').length;
  return html`
    <a class="row" href="${href}">
      <span class="grow">
        <b>${l.name}</b>
        <small>${c.dets.map((d) => d.name).join('、') || '未選分隊'}・${l.entries.length} 個單位${errors ? html`・<span class="bad">${errors} 個問題</span>` : ''}</small>
      </span>
      <span class="pts ${c.total > l.limit ? 'over' : ''}">${fmtPts(c.total)}<small> / ${fmtPts(l.limit)}</small></span>
    </a>`;
}

export function index(page) {
  document.title = '軍表 · 帝皇禁軍';
  const draw = () => {
    const lists = getLists().sort((a, b) => (b.updated || 0) - (a.updated || 0));
    page.innerHTML = String(html`
      <h1>軍表</h1>
      <div class="actions top">
        <button type="button" class="btn primary" data-act="new">＋ 新軍表</button>
        <a class="btn" href="#/cloud">雲端軍表</a>
      </div>
      ${lists.length ? html`
        <ul class="rows">
          ${lists.map((l) => html`<li class="with-menu">
            ${listRow(l, `#/list/${l.id}`)}
            <span class="menu">
              <a class="btn small" href="#/play/${l.id}">遊玩</a>
              <button type="button" class="btn small" data-act="dup" data-id="${l.id}">複製</button>
              <button type="button" class="btn small danger" data-act="del" data-id="${l.id}">刪除</button>
            </span>
          </li>`)}
        </ul>` : emptyState('還沒有軍表', '建立一份新軍表，選分隊、加單位，分數會自動計算。')}
      <details class="card help">
        <summary>匯入別人分享的軍表</summary>
        <p class="muted small">貼上分享連結（或連結中 <code>#/import/</code> 後面的那一段）。</p>
        <form id="import-form" class="inline-form">
          <input type="text" id="import-text" placeholder="貼上分享連結" aria-label="分享連結" autocomplete="off">
          <button class="btn" type="submit">匯入</button>
        </form>
      </details>
      <p class="muted small">編輯時會自動儲存到本機。換裝置前，可用「雲端軍表」存檔，或複製分享連結。</p>`);
  };
  draw();

  on(page, 'click', '[data-act]', (ev, el) => {
    const act = el.dataset.act;
    if (act === 'new') {
      const l = newList({ limit: db.build.defaultPoints || 2000, dpLimit: db.build.dpLimit === undefined ? null : db.build.dpLimit });
      location.hash = `#/list/${l.id}`;
    } else if (act === 'dup') {
      const c = duplicateList(el.dataset.id);
      if (c) { toast(`已複製為「${c.name}」`); draw(); }
    } else if (act === 'del') {
      const l = getLists().find((x) => x.id === el.dataset.id);
      if (l && confirm(`刪除「${l.name}」？這個動作無法復原。`)) { deleteList(l.id); draw(); }
    }
  });
  on(page, 'submit', '#import-form', (ev) => {
    ev.preventDefault();
    const raw = page.querySelector('#import-text').value.trim();
    if (!raw) return;
    const m = /#\/import\/([\w-]+)/.exec(raw);
    location.hash = `#/import/${m ? m[1] : raw.replace(/[^\w-]/g, '')}`;
  });
}

// Opening a share link shows a preview first; nothing is saved until the user says so.
export function importView(page, payload) {
  document.title = '匯入軍表';
  let list;
  try {
    list = unpackList(decodeShare(payload));
    // drop anything this data set does not know about
    list.entries = list.entries.filter((e) => db.unit[e.unit]);
    list.dets = list.dets.filter((id) => db.det[id]);
  } catch (e) {
    page.innerHTML = String(html`<h1>匯入軍表</h1>${emptyState('這個分享連結無法讀取', '連結可能不完整，請對方重新複製一次。')}<p><a class="btn" href="#/lists">回軍表</a></p>`);
    return;
  }
  const c = computeList(list, db);
  page.innerHTML = String(html`
    <h1>匯入軍表</h1>
    <div class="card">
      <h3>${list.name}</h3>
      <p class="muted">${fmtPts(c.total)} / ${fmtPts(list.limit)} 分・${list.entries.length} 個單位</p>
      <pre class="listtext">${listText(list)}</pre>
      <div class="actions">
        <button type="button" class="btn primary" data-act="save">儲存到我的軍表</button>
        <a class="btn" href="#/lists">取消</a>
      </div>
    </div>`);
  on(page, 'click', '[data-act="save"]', () => {
    saveList(list);
    toast('已儲存');
    location.replace(`#/list/${list.id}`);
  });
}
