import { html, on, toast } from '../util.js';
import { getList, getLists, saveList } from '../store.js';

function errorText(err) {
  switch (err.code) {
    case 'auth/popup-blocked': return '瀏覽器擋下了登入視窗。請允許彈出式視窗，再按一次 Google 登入。';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request': return '已取消登入。';
    case 'auth/unauthorized-domain': return '此網站尚未加入 Firebase 的登入授權網域。';
    case 'permission-denied': return '沒有存取權限，請確認登入帳號後再試。';
    case 'auth/network-request-failed':
    case 'unavailable': return '無法連上雲端，請確認網路連線後再試。';
    default: return err.message || '操作失敗，請再試一次。';
  }
}

export function view(page, selectedId) {
  document.title = '雲端軍表 · 帝皇禁軍';
  page.innerHTML = String(html`
    <nav class="crumbs"><a href="#/lists">‹ 軍表</a></nav>
    <h1>雲端軍表</h1>
    <p id="cloud-status" role="status" aria-live="polite">連線中…</p>
    <div id="cloud-panel"></div>`);
  const status = page.querySelector('#cloud-status');
  const panel = page.querySelector('#cloud-panel');
  let cloud, user, unsubscribe;
  let backups = null;
  let generation = 0;
  let busy = false;

  function draw() {
    if (!user) {
      panel.innerHTML = String(html`
        <p>登入後可將本機軍表存到雲端，並在其他裝置用同一個 Google 帳號載入。</p>
        <button type="button" class="btn primary" data-act="login">使用 Google 登入</button>`);
      return;
    }
    const local = getLists().sort((a, b) => b.updated - a.updated);
    panel.innerHTML = String(html`
      <div class="actions wrap">
        <span>${user.email || user.displayName}</span>
        <button type="button" class="btn small" data-act="logout">登出</button>
      </div>
      <h2>儲存到雲端</h2>
      ${local.length ? html`<div class="card">
        <label class="field">選擇本機軍表
          <select id="cloud-local">${local.map((l) => html`<option value="${l.id}" ${l.id === selectedId ? 'selected' : ''}>${l.name}</option>`)}</select>
        </label>
        <div class="actions"><button type="button" class="btn primary" data-act="upload" ${backups ? '' : 'disabled'}>儲存到雲端</button></div>
      </div>` : html`<p class="muted">這台裝置還沒有軍表。<a href="#/lists">建立本機軍表</a></p>`}
      <h2>我的雲端存檔</h2>
      <button type="button" class="btn small" data-act="refresh">重新整理清單</button>
      ${backups?.length ? html`<ul class="rows">${backups.map((b) => html`
        <li class="card">
          <b>${b.roster?.name || '未命名軍表'}</b>
          <small class="muted">${b.updatedAt.toDate().toLocaleString('zh-TW')}</small>
          <div class="actions wrap">
            <button type="button" class="btn small" data-act="load" data-id="${b.id}">載入到本機</button>
            <button type="button" class="btn small danger" data-act="delete" data-id="${b.id}">刪除雲端存檔</button>
          </div>
        </li>`)}</ul>` : backups ? html`<p class="muted">尚無雲端存檔。</p>` : ''}
    `);
  }

  async function refresh(session) {
    const rows = await cloud.listBackups(user.uid);
    if (session === generation) backups = rows;
  }

  async function run(message, action) {
    const session = generation;
    busy = true;
    panel.querySelectorAll('select, button').forEach((el) => { el.disabled = true; });
    status.textContent = message;
    try {
      const result = await action(session);
      if (session === generation) status.textContent = result || '';
    } catch (err) {
      if (session === generation) status.textContent = errorText(err);
    } finally {
      if (session === generation) { busy = false; draw(); }
    }
  }

  import('../cloud.js').then((api) => {
    if (generation) return;
    cloud = api;
    unsubscribe = cloud.watchUser((account) => {
      generation++;
      user = account;
      backups = null;
      busy = false;
      status.textContent = '';
      draw();
      if (user) run('正在讀取雲端軍表…', refresh);
    });
  }).catch(() => {
    if (generation) return;
    status.textContent = '無法連上 Firebase，請確認網路連線後再試。';
    panel.innerHTML = String(html`<button class="btn" type="button" data-act="retry">重新連線</button>`);
  });

  on(page, 'change', '#cloud-local', (ev, el) => { selectedId = el.value; });
  on(page, 'click', '[data-act]', (ev, el) => {
    if (busy) return;
    const act = el.dataset.act;
    if (act === 'retry') return location.reload();
    if (act === 'login') return run('等待 Google 登入…', () => cloud.login().then(() => ''));
    if (!user) return;
    if (act === 'logout') return run('正在登出…', () => cloud.logout());
    if (act === 'refresh') return run('正在讀取雲端軍表…', refresh);

    const id = act === 'upload' ? panel.querySelector('#cloud-local').value : el.dataset.id;
    const backup = backups.find((b) => b.id === id);
    if (act === 'load') {
      return run('正在載入軍表…', async (session) => {
        const list = await cloud.loadBackup(user.uid, id);
        if (session !== generation) return;
        const local = getList(id);
        if (local && !confirm(`以雲端存檔覆寫本機的「${local.name}」？`)) return;
        if (!saveList(list)) throw new Error('本機儲存失敗，請確認瀏覽器儲存空間。');
        toast('已載入雲端軍表');
        location.hash = `#/list/${id}`;
      });
    }
    const list = act === 'upload' ? getList(id) : null;
    if (act === 'upload' && !list) { status.textContent = '找不到這份本機軍表。'; draw(); return; }
    if (backup) {
      const prompt = act === 'delete' ? `刪除「${backup.roster.name}」的雲端存檔？`
        : `以本機的「${list.name}」覆寫雲端存檔「${backup.roster.name}」？`;
      if (!confirm(prompt)) return;
    }
    run(act === 'delete' ? '正在刪除…' : '正在儲存…', async (session) => {
      await cloud.changeBackup(user.uid, id, backup, list);
      if (session !== generation) return;
      const message = list ? '已儲存到雲端。' : '已刪除雲端存檔。';
      try {
        await refresh(session);
      } catch {
        if (session === generation) backups = null;
        return message + '請重新整理清單。';
      }
      return message;
    });
  });
  return () => { generation++; if (unsubscribe) unsubscribe(); };
}
